import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import type { RetellCallResponse } from '@kit/shared/retell/retell.service';

/**
 * Map a Retell call to the list-item shape the frontend expects.
 * For outbound calls, `from_number` is the clinic and `to_number` is the patient.
 */
function mapRetellCallToListItem(
  call: RetellCallResponse,
  campaignContactMap: Map<string, { patientName?: string; campaignName?: string; callType?: string }>,
) {
  const rawAnalysis = (call.call_analysis ?? {}) as Record<string, any>;
  const custom = (rawAnalysis.custom_analysis_data ?? {}) as Record<string, any>;
  const analysis = { ...rawAnalysis, ...custom };

  let duration: number | null = null;
  if (call.start_timestamp && call.end_timestamp) {
    duration = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
  } else if (call.duration_ms) {
    duration = Math.round(call.duration_ms / 1000);
  }

  const outcome = inferOutcome(analysis);
  const startIso = call.start_timestamp
    ? new Date(call.start_timestamp).toISOString()
    : new Date().toISOString();
  const endIso = call.end_timestamp
    ? new Date(call.end_timestamp).toISOString()
    : null;

  const presetSentiment = (rawAnalysis.user_sentiment || '').toLowerCase();
  const customSentiment = (custom.customer_sentiment || '').toLowerCase();
  const sentiment = customSentiment || presetSentiment
    || (analysis.caller_satisfied === true ? 'positive' : analysis.caller_satisfied === false ? 'negative' : null);

  const metadata = (call.metadata ?? {}) as Record<string, string>;
  const contactInfo = campaignContactMap.get(call.call_id) ?? {};

  return {
    id: call.call_id,
    callId: call.call_id,
    phoneNumber: call.to_number || 'unknown',
    callType: metadata.callType || contactInfo.callType || 'OUTBOUND',
    duration,
    status: call.call_status === 'ended' ? 'COMPLETED' : (call.call_status || 'COMPLETED').toUpperCase(),
    outcome,
    callReason: analysis.call_reason || null,
    urgencyLevel: analysis.urgency_level || null,
    contactName: analysis.patient_name || contactInfo.patientName || null,
    contactEmail: analysis.patient_email || null,
    summary: rawAnalysis.call_summary || null,
    appointmentSet: !!analysis.appointment_booked || outcome === 'BOOKED',
    insuranceVerified: !!analysis.insurance_verified,
    paymentPlanDiscussed: !!analysis.payment_discussed,
    transferredToStaff: !!analysis.transferred_to_staff || outcome === 'TRANSFERRED',
    transferredTo: analysis.transferred_to || null,
    followUpRequired: !!analysis.follow_up_required,
    customerSentiment: sentiment,
    costCents: null,
    callStartedAt: startIso,
    callEndedAt: endIso,
    campaignName: contactInfo.campaignName || metadata.campaignId || null,
    disconnectionReason: call.disconnection_reason || null,
  };
}

function inferOutcome(analysis: Record<string, any>): string {
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

/**
 * GET /api/outbound/call-logs
 *
 * Fetches outbound call logs from Retell for the current account's outbound agents.
 * Data is fetched directly from Retell and enriched with campaign/contact data.
 *
 * Query params:
 * - page, limit: pagination
 * - startDate, endDate: date filter (ISO)
 * - outcome: filter by call outcome
 * - search: filter by contact name or phone number
 * - callType: filter by outbound call type (RECALL, REMINDER, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

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

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const outcome = searchParams.get('outcome');
    const search = searchParams.get('search');
    const callTypeFilter = searchParams.get('callType');

    const settings = await prisma.outboundSettings.findUnique({
      where: { accountId: account.id },
    });

    const agentIds: string[] = [];
    if (settings?.patientCareRetellAgentId) agentIds.push(settings.patientCareRetellAgentId);
    if (settings?.financialRetellAgentId) agentIds.push(settings.financialRetellAgentId);

    if (agentIds.length === 0) {
      return NextResponse.json({
        calls: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        filters: { outcomes: [], callTypes: [] },
      });
    }

    const { createRetellService } = await import('@kit/shared/retell/retell.service');
    const retell = createRetellService();

    const rawStartDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const allCalls: RetellCallResponse[] = [];
    for (const agentId of agentIds) {
      const calls = await retell.listCalls({
        filter_criteria: {
          agent_id: [agentId],
          ...(rawStartDate ? { after_start_timestamp: new Date(rawStartDate).getTime() } : {}),
          ...(endDate ? { before_start_timestamp: new Date(endDate).getTime() } : {}),
        },
        sort_order: 'descending',
        limit: 1000,
      });
      allCalls.push(...calls);
    }

    allCalls.sort((a, b) => (b.start_timestamp || 0) - (a.start_timestamp || 0));

    // Enrich with campaign contact data
    const retellCallIds = allCalls
      .map((c) => c.call_id)
      .filter(Boolean);

    let campaignContactMap = new Map<string, { patientName?: string; campaignName?: string; callType?: string }>();

    if (retellCallIds.length > 0) {
      try {
        const contacts = await prisma.campaignContact.findMany({
          where: {
            retellCallId: { in: retellCallIds },
            campaign: { accountId: account.id },
          },
          select: {
            retellCallId: true,
            callContext: true,
            campaign: { select: { name: true, callType: true } },
          },
        });

        for (const c of contacts) {
          if (!c.retellCallId) continue;
          const ctx = (c.callContext ?? {}) as Record<string, string>;
          campaignContactMap.set(c.retellCallId, {
            patientName: ctx.patient_name,
            campaignName: c.campaign?.name,
            callType: c.campaign?.callType,
          });
        }
      } catch {
        // CampaignContact table may not exist yet
      }
    }

    let mappedCalls = allCalls.map((call) => mapRetellCallToListItem(call, campaignContactMap));

    // Apply filters
    if (outcome) {
      mappedCalls = mappedCalls.filter((c) => c.outcome === outcome);
    }
    if (callTypeFilter) {
      mappedCalls = mappedCalls.filter((c) => c.callType === callTypeFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      mappedCalls = mappedCalls.filter((c) =>
        (c.contactName && c.contactName.toLowerCase().includes(s)) ||
        (c.phoneNumber && c.phoneNumber.includes(search)) ||
        (c.campaignName && c.campaignName.toLowerCase().includes(s)),
      );
    }

    const total = mappedCalls.length;
    const offset = (page - 1) * limit;
    const paginatedCalls = mappedCalls.slice(offset, offset + limit);

    const outcomeCounts = new Map<string, number>();
    const callTypeCounts = new Map<string, number>();
    for (const c of mappedCalls) {
      outcomeCounts.set(c.outcome, (outcomeCounts.get(c.outcome) || 0) + 1);
      callTypeCounts.set(c.callType, (callTypeCounts.get(c.callType) || 0) + 1);
    }

    return NextResponse.json({
      calls: paginatedCalls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
      filters: {
        outcomes: Array.from(outcomeCounts.entries()).map(([value, count]) => ({ value, count })),
        callTypes: Array.from(callTypeCounts.entries()).map(([value, count]) => ({ value, count })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching outbound call logs:', error);
    return NextResponse.json({ error: 'Failed to fetch outbound call logs' }, { status: 500 });
  }
}
