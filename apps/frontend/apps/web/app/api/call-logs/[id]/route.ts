import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';
import { getLogger } from '@kit/shared/logger';

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
    const { id: vapiCallId } = await params;
    const logger = await getLogger();

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
        vapiCallId,
        accountId: account.id,
      },
    });

    if (!callRef) {
      // Fallback: check if any of the account's phone numbers match this call
      // This handles calls that may not have a CallReference yet
      const vapiService = createVapiService();
      const call = await vapiService.getCall(vapiCallId);

      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 });
      }

      // Verify phone number belongs to this account
      const phoneNumberId = call.phoneNumberId;
      if (phoneNumberId) {
        const vapiPhone = await prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneId: phoneNumberId, accountId: account.id },
        });
        if (!vapiPhone) {
          return NextResponse.json({ error: 'Call not found' }, { status: 404 });
        }
      } else {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 });
      }

      // HIPAA: Log access
      logger.info({
        userId,
        vapiCallId,
        action: 'viewed_call_detail',
      }, '[Call Logs] Call detail accessed');

      return NextResponse.json(mapVapiCallToDetail(call));
    }

    // Fetch full call data from Vapi
    const vapiService = createVapiService();
    const call = await vapiService.getCall(vapiCallId);

    if (!call) {
      return NextResponse.json({ error: 'Call not found in Vapi' }, { status: 404 });
    }

    // HIPAA: Log access
    logger.info({
      userId,
      vapiCallId,
      action: 'viewed_call_detail',
    }, '[Call Logs] Call detail accessed');

    return NextResponse.json(mapVapiCallToDetail(call));
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
 */
function mapVapiCallToDetail(call: any) {
  const analysis = call.analysis || {};
  const structuredData = analysis.structuredData || {};
  const artifact = call.artifact || {};

  const summary = analysis.summary || call.summary || null;

  // Normalize transcript: prefer artifact.transcript (array), fall back to
  // artifact.messages, then legacy top-level call.transcript string.
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

  return {
    id: call.id,
    vapiCallId: call.id,

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

    costCents: call.cost ? Math.round(call.cost * 100) : null,

    metadata: {
      vapiPhoneNumberId: call.phoneNumberId,
      vapiAssistantId: call.assistantId,
      vapiSquadId: call.squadId,
      endedReason: call.endedReason,
      costBreakdown: call.costBreakdown,
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
