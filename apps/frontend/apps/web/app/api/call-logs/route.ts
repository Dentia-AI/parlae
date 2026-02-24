import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';
import { isAdminUser } from '~/lib/auth/admin';
import { calculateBlendedCost, getPlatformPricing, DEFAULT_PRICING_RATES } from '@kit/shared/vapi/cost-calculator';
import type { PlatformPricingRates } from '@kit/shared/vapi/cost-calculator';
import { getAccountProvider } from '@kit/shared/voice-provider';
import type { RetellCallResponse } from '@kit/shared/retell/retell.service';

import type { VapiCall } from '@kit/shared/vapi/vapi.service';

/**
 * Normalize a Vapi transcript into a plain-text string.
 * Vapi returns artifact.transcript as an array of message objects;
 * older calls may still have a plain string.
 */
function normalizeTranscript(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
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
 * Map a Vapi call to the shape the frontend expects for the call list.
 *
 * @param showCost  If true (admin), include blended cost. Otherwise costCents is null.
 * @param rates     Platform pricing rates for blended cost calculation.
 */
function mapVapiCallToListItem(
  call: VapiCall,
  showCost: boolean,
  rates: PlatformPricingRates,
) {
  const analysis = call.analysis || {};
  const structuredData = analysis.structuredData || {};
  const artifact = call.artifact || {};
  const summary = analysis.summary || call.summary || null;
  const transcript =
    normalizeTranscript(artifact.transcript) ||
    normalizeTranscript(artifact.messages) ||
    (typeof call.transcript === 'string' ? call.transcript : null);

  // Calculate duration in seconds
  let duration: number | null = null;
  if (call.startedAt && call.endedAt) {
    duration = Math.round(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
    );
  }

  // Infer outcome from structured data
  const outcome = inferOutcome(structuredData);

  // Blended cost (admin-only)
  let costCents: number | null = null;
  if (showCost && call.cost != null && duration != null) {
    const callType = call.type === 'outboundPhoneCall' ? 'outbound' as const : 'inbound' as const;
    const breakdown = calculateBlendedCost(call.cost, duration, callType, rates);
    costCents = breakdown.totalCents;
  }

  return {
    id: call.id,
    vapiCallId: call.id,
    phoneNumber: call.customer?.number || call.phoneNumber?.number || 'unknown',
    callType: call.type === 'outboundPhoneCall' ? 'OUTBOUND' : 'INBOUND',
    duration,
    status: call.status === 'ended' ? 'COMPLETED' : call.status?.toUpperCase() || 'COMPLETED',
    outcome,
    callReason: structuredData.callReason || null,
    urgencyLevel: structuredData.urgencyLevel || null,
    contactName: structuredData.patientName || call.customer?.name || null,
    contactEmail: structuredData.patientEmail || null,
    summary,
    appointmentSet: !!structuredData.appointmentBooked,
    insuranceVerified: !!structuredData.insuranceVerified,
    paymentPlanDiscussed: !!structuredData.paymentDiscussed,
    transferredToStaff: !!structuredData.transferredToStaff,
    transferredTo: structuredData.transferredTo || null,
    followUpRequired: !!structuredData.followUpRequired,
    customerSentiment: structuredData.customerSentiment || null,
    costCents,
    callStartedAt: call.startedAt || call.endedAt || new Date().toISOString(),
    callEndedAt: call.endedAt || null,
  };
}

/**
 * Infer a call outcome string from Vapi structured data.
 */
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

/**
 * Map a Retell call to the same list-item shape used by Vapi calls.
 */
function mapRetellCallToListItem(call: RetellCallResponse): {
  id: string;
  vapiCallId: string;
  phoneNumber: string;
  callType: string;
  duration: number | null;
  status: string;
  outcome: string;
  callReason: string | null;
  urgencyLevel: string | null;
  contactName: string | null;
  contactEmail: string | null;
  summary: string | null;
  appointmentSet: boolean;
  insuranceVerified: boolean;
  paymentPlanDiscussed: boolean;
  transferredToStaff: boolean;
  transferredTo: string | null;
  followUpRequired: boolean;
  customerSentiment: string | null;
  costCents: number | null;
  callStartedAt: string;
  callEndedAt: string | null;
} {
  const analysis = (call.call_analysis ?? {}) as Record<string, any>;

  let duration: number | null = null;
  if (call.start_timestamp && call.end_timestamp) {
    duration = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
  } else if (call.duration_ms) {
    duration = Math.round(call.duration_ms / 1000);
  }

  const retellOutcome = inferRetellOutcome(analysis);
  const startIso = call.start_timestamp
    ? new Date(call.start_timestamp).toISOString()
    : new Date().toISOString();
  const endIso = call.end_timestamp
    ? new Date(call.end_timestamp).toISOString()
    : null;

  return {
    id: call.call_id,
    vapiCallId: call.call_id,
    phoneNumber: call.from_number || 'unknown',
    callType: call.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND',
    duration,
    status: call.call_status === 'ended' ? 'COMPLETED' : (call.call_status || 'COMPLETED').toUpperCase(),
    outcome: retellOutcome,
    callReason: analysis.call_reason || null,
    urgencyLevel: analysis.urgency_level || null,
    contactName: analysis.patient_name || null,
    contactEmail: analysis.patient_email || null,
    summary: analysis.call_summary || null,
    appointmentSet: !!analysis.appointment_booked,
    insuranceVerified: !!analysis.insurance_verified,
    paymentPlanDiscussed: !!analysis.payment_discussed,
    transferredToStaff: !!analysis.transferred_to_staff,
    transferredTo: analysis.transferred_to || null,
    followUpRequired: !!analysis.follow_up_required,
    customerSentiment: analysis.customer_sentiment || null,
    costCents: null,
    callStartedAt: startIso,
    callEndedAt: endIso,
  };
}

function inferRetellOutcome(analysis: Record<string, any>): string {
  const outcome = analysis?.call_outcome;
  switch (outcome) {
    case 'appointment_booked': return 'BOOKED';
    case 'transferred_to_staff': return 'TRANSFERRED';
    case 'insurance_verified': return 'INSURANCE_INQUIRY';
    case 'payment_plan_discussed': return 'PAYMENT_PLAN';
    case 'information_provided': return 'INFORMATION';
    case 'voicemail': return 'VOICEMAIL';
    default: {
      if (analysis?.appointment_booked) return 'BOOKED';
      if (analysis?.transferred_to_staff) return 'TRANSFERRED';
      return 'OTHER';
    }
  }
}

/**
 * GET /api/call-logs
 *
 * Returns paginated call logs for the current user's account.
 * Data is fetched from Vapi API (source of truth) and scoped to the account's phone numbers.
 *
 * Query params:
 * - page: page number (default: 1)
 * - limit: items per page (default: 20, max: 100)
 * - startDate: ISO date string (filter from)
 * - endDate: ISO date string (filter to)
 * - outcome: filter by outcome (client-side filtering after Vapi fetch)
 * - search: search by contact name or phone number (client-side filtering)
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

    const activeProvider = await getAccountProvider(account.id);

    // Fetch pricing rates and check admin status for cost visibility
    const isAdmin = isAdminUser(userId);
    const pricingRates = isAdmin ? await getPlatformPricing(prisma) : DEFAULT_PRICING_RATES;

    let mappedCalls: ReturnType<typeof mapVapiCallToListItem>[] = [];

    if (activeProvider === 'RETELL') {
      mappedCalls = await fetchRetellCalls(account.id, searchParams);
    } else {
      mappedCalls = await fetchVapiCalls(
        account.id, searchParams, isAdmin, pricingRates,
      );
    }

    // Apply client-side filters
    if (outcome) {
      mappedCalls = mappedCalls.filter(c => c.outcome === outcome);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      mappedCalls = mappedCalls.filter(c =>
        (c.contactName && c.contactName.toLowerCase().includes(searchLower)) ||
        (c.phoneNumber && c.phoneNumber.includes(search)) ||
        (c.contactEmail && c.contactEmail.toLowerCase().includes(searchLower)) ||
        (c.callReason && c.callReason.toLowerCase().includes(searchLower))
      );
    }

    const total = mappedCalls.length;
    const offset = (page - 1) * limit;
    const paginatedCalls = mappedCalls.slice(offset, offset + limit);

    // Compute aggregate stats
    const outcomeCounts = new Map<string, number>();
    const reasonCounts = new Map<string, number>();
    for (const c of mappedCalls) {
      outcomeCounts.set(c.outcome, (outcomeCounts.get(c.outcome) || 0) + 1);
      if (c.callReason) {
        reasonCounts.set(c.callReason, (reasonCounts.get(c.callReason) || 0) + 1);
      }
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
        reasons: Array.from(reasonCounts.entries()).map(([value, count]) => ({ value, count })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching call logs:', error);
    return NextResponse.json({ error: 'Failed to fetch call logs' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Provider-specific fetch helpers
// ---------------------------------------------------------------------------

async function fetchVapiCalls(
  accountId: string,
  searchParams: URLSearchParams,
  isAdmin: boolean,
  pricingRates: PlatformPricingRates,
) {
  const RETENTION_DAYS = 14;
  const earliestAllowed = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rawStartDate = searchParams.get('startDate');
  const startDate = rawStartDate && rawStartDate > earliestAllowed ? rawStartDate : earliestAllowed;
  const endDate = searchParams.get('endDate');

  let phoneNumbers = await prisma.vapiPhoneNumber.findMany({
    where: { accountId, isActive: true },
    select: { vapiPhoneId: true },
  });

  if (phoneNumbers.length === 0) {
    const fullAccount = await prisma.account.findUnique({
      where: { id: accountId },
      select: { phoneIntegrationSettings: true },
    });
    const settings = fullAccount?.phoneIntegrationSettings as any;
    if (settings?.vapiPhoneId) {
      phoneNumbers = [{ vapiPhoneId: settings.vapiPhoneId }];
    }
  }

  if (phoneNumbers.length === 0) return [];

  const vapiService = createVapiService();
  const allCalls: VapiCall[] = [];

  for (const phone of phoneNumbers) {
    const calls = await vapiService.listCalls({
      phoneNumberId: phone.vapiPhoneId,
      limit: 1000,
      createdAtGe: startDate || undefined,
      createdAtLe: endDate || undefined,
    });
    allCalls.push(...calls);
  }

  allCalls.sort((a, b) => {
    const aTime = new Date(a.startedAt || a.endedAt || 0).getTime();
    const bTime = new Date(b.startedAt || b.endedAt || 0).getTime();
    return bTime - aTime;
  });

  return allCalls.map((call) => mapVapiCallToListItem(call, isAdmin, pricingRates));
}

async function fetchRetellCalls(
  accountId: string,
  searchParams: URLSearchParams,
) {
  const { createRetellService } = await import('@kit/shared/retell/retell.service');
  const retell = createRetellService();

  let retellPhones = await prisma.retellPhoneNumber.findMany({
    where: { accountId, isActive: true },
    select: { retellPhoneNumberId: true },
  });

  // Fallback: check phoneIntegrationSettings for Retell agent IDs
  if (retellPhones.length === 0) {
    const fullAccount = await prisma.account.findUnique({
      where: { id: accountId },
      select: { phoneIntegrationSettings: true },
    });
    const settings = fullAccount?.phoneIntegrationSettings as any;
    if (settings?.retellReceptionistAgentId) {
      // Fetch calls filtered by agent_id instead
      const agentIds: string[] = [];
      if (settings.retellReceptionistAgentId) agentIds.push(settings.retellReceptionistAgentId);
      if (settings.retellAgentIds && Array.isArray(settings.retellAgentIds)) {
        agentIds.push(...settings.retellAgentIds);
      }

      const rawStartDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      const allCalls: RetellCallResponse[] = [];
      for (const agentId of [...new Set(agentIds)]) {
        const calls = await retell.listCalls({
          filter_criteria: {
            agent_id: [agentId],
            ...(rawStartDate ? { after_start_timestamp: new Date(rawStartDate).getTime() } : {}),
            ...(endDate ? { before_start_timestamp: new Date(endDate).getTime() } : {}),
          },
          sort_order: 'descending',
          limit: 1000,
        });
        allCalls.push(...(calls || []));
      }

      return allCalls.map(mapRetellCallToListItem);
    }

    return [];
  }

  const rawStartDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const allCalls: RetellCallResponse[] = [];
  for (const phone of retellPhones) {
    const calls = await retell.listCalls({
      filter_criteria: {
        ...(rawStartDate ? { after_start_timestamp: new Date(rawStartDate).getTime() } : {}),
        ...(endDate ? { before_start_timestamp: new Date(endDate).getTime() } : {}),
      },
      sort_order: 'descending',
      limit: 1000,
    });
    allCalls.push(...(calls || []));
  }

  return allCalls.map(mapRetellCallToListItem);
}
