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
    callId: call.id,
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
  callId: string;
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
  const rawAnalysis = (call.call_analysis ?? {}) as Record<string, any>;
  const custom = (rawAnalysis.custom_analysis_data ?? {}) as Record<string, any>;
  const analysis = { ...rawAnalysis, ...custom };

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

  const presetSentiment = (rawAnalysis.user_sentiment || '').toLowerCase();
  const customSentiment = (custom.customer_sentiment || '').toLowerCase();
  const sentiment = customSentiment || presetSentiment
    || (analysis.caller_satisfied === true ? 'positive' : analysis.caller_satisfied === false ? 'negative' : null);

  return {
    id: call.call_id,
    callId: call.call_id,
    phoneNumber: call.from_number || 'unknown',
    callType: call.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND',
    duration,
    status: call.call_status === 'ended' ? 'COMPLETED' : (call.call_status || 'COMPLETED').toUpperCase(),
    outcome: retellOutcome,
    callReason: analysis.call_reason || null,
    urgencyLevel: analysis.urgency_level || null,
    contactName: analysis.patient_name || null,
    contactEmail: analysis.patient_email || null,
    summary: rawAnalysis.call_summary || null,
    appointmentSet: !!analysis.appointment_booked || retellOutcome === 'BOOKED',
    insuranceVerified: !!analysis.insurance_verified,
    paymentPlanDiscussed: !!analysis.payment_discussed,
    transferredToStaff: !!analysis.transferred_to_staff || retellOutcome === 'TRANSFERRED',
    transferredTo: analysis.transferred_to || null,
    followUpRequired: !!analysis.follow_up_required,
    customerSentiment: sentiment,
    costCents: null,
    callStartedAt: startIso,
    callEndedAt: endIso,
  };
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
  if (o === 'no_resolution') return 'OTHER';
  return 'OTHER';
}

/**
 * Generate mock call log data for development when no real calls exist.
 */
function generateMockCallLogs(page: number, limit: number) {
  const names = ['Sarah Johnson', 'Michael Chen', 'Emma Wilson', 'James Davis', 'Lisa Anderson', 'Robert Martinez', 'Jennifer Taylor', 'David Brown', 'Maria Garcia', 'John Smith'];
  const outcomes = ['BOOKED', 'TRANSFERRED', 'INFORMATION', 'BOOKED', 'BOOKED', 'VOICEMAIL', 'OTHER', 'INSURANCE_INQUIRY'];
  const sentiments = ['very_positive', 'positive', 'neutral', 'positive', 'neutral', 'negative', null];
  const reasons = ['new_appointment', 'reschedule', 'insurance_question', 'general_inquiry', 'billing', null];
  const summaries = [
    'Patient called to schedule a dental cleaning. Booked for next Tuesday at 2 PM with Dr. Chen.',
    'Caller had questions about insurance coverage for root canal. Transferred to billing department.',
    'New patient inquiry about teeth whitening services and pricing.',
    'Called to reschedule their appointment from Friday to Monday. Updated in calendar.',
    'Follow-up call about post-procedure care instructions.',
    'Patient checking on their insurance claim status. Verified coverage details.',
    'Called about emergency toothache. Scheduled same-day appointment.',
    'Voicemail left - patient will call back during business hours.',
  ];

  const total = 35;
  const offset = (page - 1) * limit;
  const calls = [];

  for (let i = offset; i < Math.min(offset + limit, total); i++) {
    const callStartedAt = new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000);
    const duration = Math.floor(60 + Math.random() * 300);
    const callEndedAt = new Date(callStartedAt.getTime() + duration * 1000);
    const outcome = outcomes[i % outcomes.length]!;

    calls.push({
      id: `mock-call-${i}`,
      callId: `mock-call-${i}`,
      phoneNumber: `+1555${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
      callType: 'INBOUND',
      duration,
      status: 'COMPLETED',
      outcome,
      callReason: reasons[i % reasons.length],
      urgencyLevel: i % 5 === 0 ? 'urgent' : 'routine',
      contactName: names[i % names.length],
      contactEmail: null,
      summary: summaries[i % summaries.length],
      appointmentSet: outcome === 'BOOKED',
      insuranceVerified: outcome === 'INSURANCE_INQUIRY',
      paymentPlanDiscussed: false,
      transferredToStaff: outcome === 'TRANSFERRED',
      transferredTo: outcome === 'TRANSFERRED' ? 'Front Desk' : null,
      followUpRequired: i % 4 === 0,
      customerSentiment: sentiments[i % sentiments.length],
      costCents: null,
      callStartedAt: callStartedAt.toISOString(),
      callEndedAt: callEndedAt.toISOString(),
    });
  }

  calls.sort((a, b) => new Date(b.callStartedAt).getTime() - new Date(a.callStartedAt).getTime());

  const outcomeCounts = new Map<string, number>();
  for (const c of calls) {
    outcomeCounts.set(c.outcome, (outcomeCounts.get(c.outcome) || 0) + 1);
  }

  return {
    calls,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + limit < total,
    },
    filters: {
      outcomes: Array.from(outcomeCounts.entries()).map(([value, count]) => ({ value, count })),
      reasons: [],
    },
  };
}

/**
 * GET /api/call-logs
 *
 * Returns paginated call logs for the current user's account.
 * Data is fetched from the voice provider API and scoped to the account's phone numbers.
 *
 * Query params:
 * - page: page number (default: 1)
 * - limit: items per page (default: 20, max: 100)
 * - startDate: ISO date string (filter from)
 * - endDate: ISO date string (filter to)
 * - outcome: filter by outcome (client-side filtering after fetch)
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
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(generateMockCallLogs(1, 20));
      }
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

    try {
      if (activeProvider === 'RETELL') {
        mappedCalls = await fetchRetellCalls(account.id, searchParams);
      } else {
        mappedCalls = await fetchVapiCalls(
          account.id, searchParams, isAdmin, pricingRates,
        );
      }
    } catch (providerErr) {
      console.warn('[call-logs] Provider API call failed:', providerErr);
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(generateMockCallLogs(page, limit));
      }
      throw providerErr;
    }

    if (mappedCalls.length === 0 && process.env.NODE_ENV === 'development') {
      return NextResponse.json(generateMockCallLogs(page, limit));
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

function normalizeE164(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

async function collectClinicPhoneNumbers(accountId: string): Promise<string[]> {
  const numbers = new Set<string>();

  const retellPhones = await prisma.retellPhoneNumber.findMany({
    where: { accountId },
    select: { phoneNumber: true },
  });
  for (const p of retellPhones) {
    if (p.phoneNumber) numbers.add(normalizeE164(p.phoneNumber));
  }

  const fullAccount = await prisma.account.findUnique({
    where: { id: accountId },
    select: { phoneIntegrationSettings: true, phoneNumberHistory: true },
  });
  const settings = (fullAccount?.phoneIntegrationSettings as any) ?? {};
  if (settings.phoneNumber) numbers.add(normalizeE164(settings.phoneNumber));

  const history = Array.isArray(fullAccount?.phoneNumberHistory)
    ? (fullAccount.phoneNumberHistory as Array<{ phoneNumber: string }>)
    : [];
  for (const entry of history) {
    if (entry.phoneNumber) numbers.add(normalizeE164(entry.phoneNumber));
  }

  return [...numbers];
}

async function fetchRetellCalls(
  accountId: string,
  searchParams: URLSearchParams,
) {
  const { createRetellService } = await import('@kit/shared/retell/retell.service');
  const retell = createRetellService();

  const clinicPhones = await collectClinicPhoneNumbers(accountId);
  if (clinicPhones.length === 0) return [];

  const rawStartDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const rawCalls = await retell.listCalls({
    filter_criteria: {
      ...(rawStartDate ? { after_start_timestamp: new Date(rawStartDate).getTime() } : {}),
      ...(endDate ? { before_start_timestamp: new Date(endDate).getTime() } : {}),
    },
    sort_order: 'descending',
    limit: 1000,
  });

  const clinicPhoneSet = new Set(clinicPhones);
  const filteredCalls = (rawCalls || []).filter((call) => {
    const toNum = normalizeE164(call.to_number || '');
    const fromNum = normalizeE164(call.from_number || '');
    return clinicPhoneSet.has(toNum) || clinicPhoneSet.has(fromNum);
  });

  return filteredCalls.map(mapRetellCallToListItem);
}
