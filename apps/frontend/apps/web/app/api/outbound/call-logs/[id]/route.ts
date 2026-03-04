import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import type { RetellCallResponse } from '@kit/shared/retell/retell.service';

/**
 * GET /api/outbound/call-logs/[id]
 *
 * Returns full outbound call details fetched from Retell.
 * Verifies the call belongs to one of the account's outbound agents.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    const { id: callId } = await params;

    if (process.env.NODE_ENV === 'development' && callId.startsWith('mock-outbound-call-')) {
      return NextResponse.json(generateMockOutboundCallDetail(callId));
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

    const settings = await prisma.outboundSettings.findUnique({
      where: { accountId: account.id },
    });

    const agentIds = new Set<string>();
    if (settings?.patientCareRetellAgentId) agentIds.add(settings.patientCareRetellAgentId);
    if (settings?.financialRetellAgentId) agentIds.add(settings.financialRetellAgentId);

    if (agentIds.size === 0) {
      return NextResponse.json({ error: 'No outbound agents configured' }, { status: 404 });
    }

    const { createRetellService } = await import('@kit/shared/retell/retell.service');
    const retell = createRetellService();
    const call = await retell.getCall(callId);

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!agentIds.has(call.agent_id)) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Enrich with campaign contact data
    let campaignInfo: { patientName?: string; campaignName?: string; callType?: string } = {};
    try {
      const contact = await prisma.campaignContact.findFirst({
        where: {
          retellCallId: callId,
          campaign: { accountId: account.id },
        },
        select: {
          callContext: true,
          campaign: { select: { name: true, callType: true } },
        },
      });
      if (contact) {
        const ctx = (contact.callContext ?? {}) as Record<string, string>;
        campaignInfo = {
          patientName: ctx.patient_name,
          campaignName: contact.campaign?.name,
          callType: contact.campaign?.callType,
        };
      }
    } catch {
      // CampaignContact table may not exist yet
    }

    return NextResponse.json(mapRetellCallToDetail(call, campaignInfo));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching outbound call detail:', error);
    return NextResponse.json({ error: 'Failed to fetch outbound call detail' }, { status: 500 });
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
  if (o === 'no_resolution') return 'NO_ANSWER';
  return 'OTHER';
}

function mapRetellCallToDetail(
  call: RetellCallResponse,
  campaignInfo: { patientName?: string; campaignName?: string; callType?: string },
) {
  const rawAnalysis = (call.call_analysis ?? {}) as Record<string, any>;
  const custom = (rawAnalysis.custom_analysis_data ?? {}) as Record<string, any>;
  const analysis = { ...rawAnalysis, ...custom };
  const metadata = (call.metadata ?? {}) as Record<string, string>;

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
    phoneNumber: call.to_number || 'unknown',
    callType: metadata.callType || campaignInfo.callType || 'OUTBOUND',
    direction: 'outbound',
    duration,
    status: call.call_status === 'ended' ? 'COMPLETED' : (call.call_status || 'COMPLETED').toUpperCase(),
    outcome,
    callReason: analysis.call_reason || null,
    urgencyLevel: analysis.urgency_level || null,
    contactName: analysis.patient_name || campaignInfo.patientName || null,
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
      campaignId: metadata.campaignId || null,
      contactId: metadata.contactId || null,
    },
    actions: null,
    callNotes: null,
    voiceAgent: null,
    campaignName: campaignInfo.campaignName || null,
    callStartedAt: startIso,
    callEndedAt: endIso,
    createdAt: startIso,
  };
}

function generateMockOutboundCallDetail(callId: string) {
  const callStartedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const duration = 156;
  const callEndedAt = new Date(callStartedAt.getTime() + duration * 1000);

  return {
    id: callId,
    callId,
    phoneNumber: '+15559876543',
    callType: 'RECALL',
    direction: 'outbound',
    duration,
    status: 'COMPLETED',
    outcome: 'BOOKED',
    callReason: 'recall',
    urgencyLevel: 'routine',
    contactName: 'Patricia Williams',
    contactEmail: 'patricia.williams@email.com',
    transcript: [
      'AI: Hi, this is Parlae calling from Dr. Chen\'s dental office. May I speak with Patricia Williams?',
      'User: Yes, this is Patricia.',
      'AI: Hi Patricia! I\'m calling because our records show it\'s been about 6 months since your last dental cleaning. We\'d love to get you scheduled for your next visit.',
      'User: Oh right, I\'ve been meaning to call about that. What do you have available?',
      'AI: Great! Let me check our schedule. We have openings next Thursday at 3 PM, Friday at 10 AM, or the following Monday at 1 PM. Would any of those work for you?',
      'User: Thursday at 3 PM sounds perfect.',
      'AI: Wonderful! I\'ve booked your cleaning appointment for Thursday at 3:00 PM with Dr. Patel. You should receive a confirmation text shortly. Is there anything else I can help with?',
      'User: No, that\'s great. Thanks for the reminder!',
      'AI: You\'re welcome, Patricia! We\'ll see you on Thursday. Have a great day!',
    ].join('\n'),
    summary: 'Outbound recall call to Patricia Williams for 6-month dental cleaning. Patient was receptive and booked a cleaning appointment for Thursday at 3:00 PM with Dr. Patel.',
    recordingUrl: null,
    structuredData: {
      patientName: 'Patricia Williams',
      patientPhone: '+15559876543',
      patientEmail: 'patricia.williams@email.com',
      patientId: 'PAT-2024-0287',
      isNewPatient: false,
      callReason: 'recall',
      callOutcome: 'appointment_booked',
      appointmentBooked: true,
      appointmentCancelled: false,
      appointmentRescheduled: false,
      appointmentType: 'Dental Cleaning',
      appointmentDate: 'Thursday',
      appointmentTime: '3:00 PM',
      providerName: 'Dr. Patel',
      insuranceVerified: false,
      paymentDiscussed: false,
      customerSentiment: 'positive',
      urgencyLevel: 'routine',
      followUpRequired: false,
      keyTopicsDiscussed: ['6-month recall', 'dental cleaning', 'scheduling'],
      actionsPerformed: [
        'Contacted patient for 6-month recall',
        'Checked provider availability',
        'Booked dental cleaning for Thursday 3:00 PM with Dr. Patel',
        'Confirmation text sent',
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
    metadata: {
      retellAgentId: 'mock-agent-outbound',
      disconnectionReason: 'agent_hangup',
      publicLogUrl: null,
      campaignId: 'mock-campaign-recall',
      contactId: 'mock-contact-001',
    },
    actions: {
      actions: [
        'Contacted patient for 6-month recall',
        'Checked provider availability',
        'Booked dental cleaning for Thursday 3:00 PM with Dr. Patel',
        'Confirmation text sent',
      ],
    },
    callNotes: null,
    voiceAgent: null,
    campaignName: '6-Month Recall Campaign',
    callStartedAt: callStartedAt.toISOString(),
    callEndedAt: callEndedAt.toISOString(),
    createdAt: callStartedAt.toISOString(),
  };
}
