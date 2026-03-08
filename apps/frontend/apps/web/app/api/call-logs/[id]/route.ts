import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';
import { isAdminUser } from '~/lib/auth/admin';
import { getLogger } from '@kit/shared/logger';
import { calculateBlendedCost, getPlatformPricing } from '@kit/shared/vapi/cost-calculator';
import type { RetellCallResponse } from '@kit/shared/retell/retell.service';

/**
 * GET /api/call-logs/[id]
 *
 * Returns full call details fetched from Vapi API.
 * The [id] parameter is the Vapi call ID.
 * Access is verified via the CallReference table (account scoping).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    const { id: callId } = await params;
    const logger = await getLogger();

    if (process.env.NODE_ENV === 'development' && callId.startsWith('mock-call-')) {
      return NextResponse.json(generateMockCallDetail(callId));
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Verify the call belongs to this account via CallReference
    const callRef = await prisma.callReference.findFirst({
      where: {
        callId,
        accountId: account.id,
      },
    });

    const callProvider = (callRef as any)?.provider || 'RETELL';

    // Route to Retell if the CallReference says provider is RETELL
    if (callProvider === 'RETELL') {
      const { createRetellService } = await import('@kit/shared/retell/retell.service');
      const retell = createRetellService();
      const retellCall = await retell.getCall(callId);

      if (!retellCall) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 });
      }

      logger.info({
        userId, callId: callId, provider: 'RETELL', action: 'viewed_call_detail',
      }, '[Call Logs] Call detail accessed');

      const detail = mapRetellCallToDetail(retellCall);

      if (detail.outcome === 'OTHER') {
        const bookingAction = await prisma.aiActionLog.findFirst({
          where: {
            accountId: account.id,
            callId,
            action: { in: ['book_appointment', 'reschedule_appointment'] },
            success: true,
          },
          select: { action: true },
        });
        if (bookingAction?.action === 'reschedule_appointment') {
          detail.outcome = 'RESCHEDULED';
          detail.appointmentSet = true;
        } else if (bookingAction) {
          detail.outcome = 'BOOKED';
          detail.appointmentSet = true;
        }
      }

      return NextResponse.json(detail);
    }

    // Fetch full call data from Vapi
    const vapiService = createVapiService();
    const call = await vapiService.getCall(callId);

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!callRef) {
      const phoneNumberId = call.phoneNumberId;
      let authorized = false;

      if (phoneNumberId) {
        const vapiPhone = await prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneId: phoneNumberId, accountId: account.id },
        });

        if (vapiPhone) {
          authorized = true;
        } else {
          const fullAccount = await prisma.account.findUnique({
            where: { id: account.id },
            select: { phoneIntegrationSettings: true },
          });
          const settings = fullAccount?.phoneIntegrationSettings as any;
          if (settings?.vapiPhoneId === phoneNumberId) {
            authorized = true;
          }
        }
      }

      if (!authorized) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 });
      }

      try {
        await prisma.callReference.create({
          data: { callId, accountId: account.id },
        });
      } catch {
        // Ignore duplicate key
      }
    }

    logger.info({
      userId, callId, action: 'viewed_call_detail',
    }, '[Call Logs] Call detail accessed');

    const isAdmin = isAdminUser(userId);
    const pricingRates = await getPlatformPricing(prisma);

    return NextResponse.json(mapVapiCallToDetail(call, isAdmin, pricingRates));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching call log detail:', error);
    return NextResponse.json({ error: 'Failed to fetch call log' }, { status: 500 });
  }
}

/**
 * Normalize a Vapi transcript into a plain-text string.
 *
 * Vapi returns `artifact.transcript` as an array of message objects:
 *   [{ role: "assistant", message: "Hello!", time: 0.5 }, ...]
 * Older calls may still have a plain string. This helper handles both.
 */
function normalizeTranscript(raw: unknown): string | null {
  if (!raw) return null;

  // Already a string (legacy format)
  if (typeof raw === 'string') return raw;

  // Array of message objects
  if (Array.isArray(raw)) {
    return raw
      .map((msg: any) => {
        const role = msg.role || 'unknown';
        const label =
          role === 'assistant' || role === 'bot' ? 'AI' :
          role === 'user' || role === 'customer' ? 'User' :
          role === 'system' ? 'System' :
          role.charAt(0).toUpperCase() + role.slice(1);
        return `${label}: ${msg.message || msg.content || ''}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  return null;
}

/**
 * Map a full Vapi call to the detail shape the frontend expects.
 *
 * @param showCost If true (admin), include blended cost + breakdown. Otherwise null.
 * @param rates    Platform pricing rates for blended cost calculation.
 */
function mapVapiCallToDetail(
  call: any,
  showCost: boolean,
  rates: import('@kit/shared/vapi/cost-calculator').PlatformPricingRates,
) {
  const analysis = call.analysis || {};
  const structuredData = analysis.structuredData || {};
  const artifact = call.artifact || {};

  const summary = analysis.summary || call.summary || null;

  const transcript =
    normalizeTranscript(artifact.transcript) ||
    normalizeTranscript(artifact.messages) ||
    (typeof call.transcript === 'string' ? call.transcript : null);

  const recordingUrl = artifact.recording || artifact.recordingUrl || call.recordingUrl || null;

  let duration: number | null = null;
  if (call.startedAt && call.endedAt) {
    duration = Math.round(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
    );
  }

  const outcome = inferOutcome(structuredData);

  // Blended cost (admin-only)
  let costCents: number | null = null;
  let costBreakdownBlended: import('@kit/shared/vapi/cost-calculator').BlendedCostBreakdown | null = null;
  if (showCost && call.cost != null && duration != null) {
    const callType = call.type === 'outboundPhoneCall' ? 'outbound' as const : 'inbound' as const;
    costBreakdownBlended = calculateBlendedCost(call.cost, duration, callType, rates);
    costCents = costBreakdownBlended.totalCents;
  }

  return {
    id: call.id,
    callId: call.id,

    phoneNumber: call.customer?.number || call.phoneNumber?.number || 'unknown',
    callType: call.type === 'outboundPhoneCall' ? 'OUTBOUND' : 'INBOUND',
    direction: call.type === 'outboundPhoneCall' ? 'outbound' : 'inbound',
    duration,
    status: call.status === 'ended' ? 'COMPLETED' : call.status?.toUpperCase() || 'COMPLETED',
    outcome,
    callReason: structuredData.callReason || null,
    urgencyLevel: structuredData.urgencyLevel || null,

    contactName: structuredData.patientName || call.customer?.name || null,
    contactEmail: structuredData.patientEmail || null,

    transcript,
    summary,
    recordingUrl,

    structuredData: Object.keys(structuredData).length > 0 ? {
      patientName: structuredData.patientName,
      patientPhone: structuredData.patientPhone,
      patientEmail: structuredData.patientEmail,
      patientId: structuredData.patientId,
      isNewPatient: structuredData.isNewPatient,
      callReason: structuredData.callReason,
      callOutcome: structuredData.callOutcome,
      appointmentBooked: structuredData.appointmentBooked,
      appointmentCancelled: structuredData.appointmentCancelled,
      appointmentRescheduled: structuredData.appointmentRescheduled,
      appointmentType: structuredData.appointmentType,
      appointmentDate: structuredData.appointmentDate,
      appointmentTime: structuredData.appointmentTime,
      providerName: structuredData.providerName,
      insuranceVerified: structuredData.insuranceVerified,
      insuranceProvider: structuredData.insuranceProvider,
      paymentDiscussed: structuredData.paymentDiscussed,
      customerSentiment: structuredData.customerSentiment,
      urgencyLevel: structuredData.urgencyLevel,
      followUpRequired: structuredData.followUpRequired,
      followUpNotes: structuredData.followUpNotes,
      transferredToStaff: structuredData.transferredToStaff,
      transferredTo: structuredData.transferredTo,
      callSummary: structuredData.callSummary,
      keyTopicsDiscussed: structuredData.keyTopicsDiscussed,
      actionsPerformed: structuredData.actionsPerformed,
    } : null,

    appointmentSet: !!structuredData.appointmentBooked,
    leadCaptured: !!structuredData.patientName || !!structuredData.patientEmail,
    insuranceVerified: !!structuredData.insuranceVerified,
    insuranceProvider: structuredData.insuranceProvider || null,
    paymentPlanDiscussed: !!structuredData.paymentDiscussed,
    paymentPlanAmount: null,
    transferredToStaff: !!structuredData.transferredToStaff,
    transferredTo: structuredData.transferredTo || null,
    followUpRequired: !!structuredData.followUpRequired,
    followUpDate: null,

    customerSentiment: structuredData.customerSentiment || null,
    aiConfidence: null,
    callQuality: null,

    costCents,

    metadata: {
      vapiPhoneNumberId: call.phoneNumberId,
      vapiAssistantId: call.assistantId,
      vapiSquadId: call.squadId,
      endedReason: call.endedReason,
      costBreakdown: call.costBreakdown,
      ...(showCost && costBreakdownBlended ? { blendedCostBreakdown: costBreakdownBlended } : {}),
    },
    actions: structuredData.actionsPerformed ? { actions: structuredData.actionsPerformed } : null,
    callNotes: null,

    voiceAgent: null,

    callStartedAt: call.startedAt || call.endedAt || new Date().toISOString(),
    callEndedAt: call.endedAt || null,
    createdAt: call.startedAt || new Date().toISOString(),
  };
}

function inferOutcome(structuredData: Record<string, any>): string {
  const outcome = structuredData?.callOutcome;
  switch (outcome) {
    case 'appointment_booked': return 'BOOKED';
    case 'transferred_to_staff': return 'TRANSFERRED';
    case 'insurance_verified': return 'INSURANCE_INQUIRY';
    case 'payment_plan_discussed': return 'PAYMENT_PLAN';
    case 'information_provided': return 'INFORMATION';
    case 'voicemail': return 'VOICEMAIL';
    default: {
      if (structuredData?.appointmentBooked) return 'BOOKED';
      if (structuredData?.transferredToStaff) return 'TRANSFERRED';
      if (structuredData?.insuranceVerified) return 'INSURANCE_INQUIRY';
      if (structuredData?.paymentDiscussed) return 'PAYMENT_PLAN';
      return 'OTHER';
    }
  }
}

function inferRetellOutcome(analysis: Record<string, any>): string {
  const o = analysis?.call_outcome;
  if (o === 'appointment_booked' || analysis?.appointment_booked) return 'BOOKED';
  if (o === 'patient_created') return 'BOOKED';
  if (o === 'transferred_to_staff' || o === 'transferred_to_human' || analysis?.transferred_to_staff) return 'TRANSFERRED';
  if (o === 'insurance_verified' || o === 'insurance_updated') return 'INSURANCE_INQUIRY';
  if (o === 'general_inquiry' || o === 'information_provided') return 'INFORMATION';
  if (o === 'caller_hung_up') return 'HUNG_UP';
  if (o === 'emergency_handled') return 'EMERGENCY';
  if (o === 'appointment_rescheduled') return 'RESCHEDULED';
  if (o === 'appointment_cancelled') return 'CANCELLED';
  if (o === 'payment_plan_discussed' || o === 'payment_processed') return 'PAYMENT_PLAN';
  if (o === 'voicemail') return 'VOICEMAIL';
  return 'OTHER';
}

function mapRetellCallToDetail(call: RetellCallResponse) {
  const rawAnalysis = (call.call_analysis ?? {}) as Record<string, any>;
  const custom = (rawAnalysis.custom_analysis_data ?? {}) as Record<string, any>;
  const analysis = { ...rawAnalysis, ...custom };

  let duration: number | null = null;
  if (call.start_timestamp && call.end_timestamp) {
    duration = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
  } else if (call.duration_ms) {
    duration = Math.round(call.duration_ms / 1000);
  }

  const transcript = call.transcript || (call.transcript_object
    ? call.transcript_object
        .map((t) => `${t.role === 'agent' ? 'AI' : 'User'}: ${t.content}`)
        .join('\n')
    : null);

  const startIso = call.start_timestamp
    ? new Date(call.start_timestamp).toISOString()
    : new Date().toISOString();
  const endIso = call.end_timestamp
    ? new Date(call.end_timestamp).toISOString()
    : null;

  const outcome = inferRetellOutcome(analysis);

  const presetSentiment = (rawAnalysis.user_sentiment || '').toLowerCase();
  const customSentiment = (custom.customer_sentiment || '').toLowerCase();
  const sentiment = customSentiment || presetSentiment
    || (analysis.caller_satisfied === true ? 'positive' : analysis.caller_satisfied === false ? 'negative' : null);

  return {
    id: call.call_id,
    callId: call.call_id,
    phoneNumber: call.from_number || 'unknown',
    callType: call.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND',
    direction: call.direction || 'inbound',
    duration,
    status: call.call_status === 'ended' ? 'COMPLETED' : (call.call_status || 'COMPLETED').toUpperCase(),
    outcome,
    callReason: analysis.call_reason || null,
    urgencyLevel: analysis.urgency_level || null,
    contactName: analysis.patient_name || null,
    contactEmail: analysis.patient_email || null,
    transcript,
    summary: rawAnalysis.call_summary || null,
    recordingUrl: call.recording_url || null,
    structuredData: Object.keys(analysis).length > 1 ? analysis : null,
    appointmentSet: !!analysis.appointment_booked || outcome === 'BOOKED',
    leadCaptured: !!analysis.patient_name || !!analysis.patient_email,
    insuranceVerified: !!analysis.insurance_verified,
    insuranceProvider: analysis.insurance_provider || null,
    paymentPlanDiscussed: !!analysis.payment_discussed,
    paymentPlanAmount: null,
    transferredToStaff: !!analysis.transferred_to_staff || outcome === 'TRANSFERRED',
    transferredTo: analysis.transferred_to || null,
    followUpRequired: !!analysis.follow_up_required,
    followUpDate: null,
    customerSentiment: sentiment,
    aiConfidence: null,
    callQuality: null,
    costCents: null,
    metadata: {
      retellAgentId: call.agent_id,
      disconnectionReason: call.disconnection_reason,
      publicLogUrl: call.public_log_url,
    },
    actions: null,
    callNotes: null,
    voiceAgent: null,
    callStartedAt: startIso,
    callEndedAt: endIso,
    createdAt: startIso,
  };
}

function generateMockCallDetail(callId: string) {
  const callStartedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const duration = 194;
  const callEndedAt = new Date(callStartedAt.getTime() + duration * 1000);

  return {
    id: callId,
    callId,
    phoneNumber: '+15551234567',
    callType: 'INBOUND',
    direction: 'inbound',
    duration,
    status: 'COMPLETED',
    outcome: 'BOOKED',
    callReason: 'new_appointment',
    urgencyLevel: 'routine',
    contactName: 'Sarah Johnson',
    contactEmail: 'sarah.johnson@email.com',
    transcript: [
      'AI: Thank you for calling Parlae Dental. How can I help you today?',
      'User: Hi, I\'d like to book a dental cleaning appointment.',
      'AI: Of course! I\'d be happy to help you schedule a cleaning. Are you an existing patient with us?',
      'User: Yes, I am. My name is Sarah Johnson.',
      'AI: Great, welcome back Sarah! Let me look up your record. I can see your last cleaning was about 6 months ago. Would you like to schedule another routine cleaning?',
      'User: Yes please. Do you have anything available next week?',
      'AI: Let me check our availability. We have openings on Tuesday at 10 AM, Wednesday at 2 PM, and Thursday at 9 AM. Which would work best for you?',
      'User: Tuesday at 10 AM works perfectly.',
      'AI: Wonderful! I\'ve booked your dental cleaning appointment for Tuesday at 10:00 AM with Dr. Chen. The appointment will be approximately 30 minutes. Is there anything else you\'d like to know?',
      'User: No, that\'s all. Thank you!',
      'AI: You\'re welcome, Sarah! We\'ll see you on Tuesday. Have a great day!',
    ].join('\n'),
    summary: 'Existing patient Sarah Johnson called to schedule a routine dental cleaning. Appointment booked for Tuesday at 10:00 AM with Dr. Chen. Patient was pleasant and the call was handled efficiently.',
    recordingUrl: null,
    structuredData: {
      patientName: 'Sarah Johnson',
      patientPhone: '+15551234567',
      patientEmail: 'sarah.johnson@email.com',
      patientId: 'PAT-2024-0142',
      isNewPatient: false,
      callReason: 'new_appointment',
      callOutcome: 'appointment_booked',
      appointmentBooked: true,
      appointmentCancelled: false,
      appointmentRescheduled: false,
      appointmentType: 'Dental Cleaning',
      appointmentDate: 'Tuesday',
      appointmentTime: '10:00 AM',
      providerName: 'Dr. Chen',
      insuranceVerified: false,
      paymentDiscussed: false,
      customerSentiment: 'positive',
      urgencyLevel: 'routine',
      followUpRequired: false,
      keyTopicsDiscussed: ['appointment scheduling', 'dental cleaning', 'availability'],
      actionsPerformed: [
        'Looked up patient record',
        'Checked provider availability',
        'Booked dental cleaning appointment for Tuesday 10:00 AM with Dr. Chen',
      ],
    },
    appointmentSet: true,
    leadCaptured: true,
    insuranceVerified: false,
    insuranceProvider: null,
    paymentPlanDiscussed: false,
    paymentPlanAmount: null,
    transferredToStaff: false,
    transferredTo: null,
    followUpRequired: false,
    followUpDate: null,
    customerSentiment: 'positive',
    aiConfidence: null,
    callQuality: null,
    costCents: null,
    metadata: {},
    actions: {
      actions: [
        'Looked up patient record',
        'Checked provider availability',
        'Booked dental cleaning appointment for Tuesday 10:00 AM with Dr. Chen',
      ],
    },
    callNotes: null,
    voiceAgent: null,
    callStartedAt: callStartedAt.toISOString(),
    callEndedAt: callEndedAt.toISOString(),
    createdAt: callStartedAt.toISOString(),
  };
}
