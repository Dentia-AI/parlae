import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';
import { isAdminUser } from '~/lib/auth/admin';
import { calculateBlendedCost, getPlatformPricing } from '@kit/shared/vapi/cost-calculator';
import { getAccountProvider } from '@kit/shared/voice-provider';
import type { RetellCallResponse } from '@kit/shared/retell/retell.service';

import type { VapiCall, VapiAnalyticsQuery } from '@kit/shared/vapi/vapi.service';

/**
 * Generate mock analytics data for development
 */
function generateMockAnalytics(startDate: Date, endDate: Date) {
  const diffMs = endDate.getTime() - startDate.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const is24h = days <= 1;

  let activityTrend: Array<{ date: string; count: number }>;

  if (is24h) {
    activityTrend = Array.from({ length: 24 }, (_, i) => {
      const hour = new Date(startDate);
      hour.setHours(startDate.getHours() + i, 0, 0, 0);
      const isBusinessHour = i >= 8 && i < 18;
      return {
        date: hour.toISOString(),
        count: isBusinessHour
          ? Math.floor(Math.random() * 8) + 3
          : Math.floor(Math.random() * 3),
      };
    });
  } else {
    activityTrend = Array.from({ length: days }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      return {
        date: date.toISOString().split('T')[0],
        count: Math.floor(Math.random() * 30) + 10,
      };
    });
  }

  const totalCalls = activityTrend.reduce((sum, d) => sum + d.count, 0);

  const callDurations = Array.from({ length: totalCalls }, () => ({
    duration: Math.floor(Math.random() * 300) + 15,
  }));

  return {
    dateRange: { start: startDate, end: endDate },
    metrics: {
      totalCalls,
      bookingRate: 78,
      avgCallTime: 102,
      totalCost: 0,
    },
    activityTrend,
    outcomesDistribution: [
      { outcome: 'BOOKED', count: Math.floor(totalCalls * 0.78), percentage: 78 },
      { outcome: 'TRANSFERRED', count: Math.floor(totalCalls * 0.14), percentage: 14 },
      { outcome: 'INSURANCE_INQUIRY', count: Math.floor(totalCalls * 0.06), percentage: 6 },
      { outcome: 'OTHER', count: Math.floor(totalCalls * 0.02), percentage: 2 },
    ],
    satisfactionBreakdown: [
      { label: 'Satisfied', count: Math.floor(totalCalls * 0.72), percentage: 72 },
      { label: 'Not Satisfied', count: Math.floor(totalCalls * 0.08), percentage: 8 },
      { label: 'Unknown', count: Math.floor(totalCalls * 0.20), percentage: 20 },
    ],
    callDurations,
  };
}

/**
 * GET /api/analytics/calls
 *
 * Hybrid analytics approach:
 * 1. Vapi POST /analytics API for aggregate metrics (total calls, avg duration, cost, daily trend)
 * 2. Vapi GET /call (limited) for structured output analysis (outcomes, insurance, payments)
 *
 * Query params:
 * - startDate: ISO date string (default: 7 days ago)
 * - endDate: ISO date string (default: now)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    const searchParams = request.nextUrl.searchParams;

    // Vapi plan limits call history to the last 14 days.
    // Clamp startDate so we never request beyond the retention window.
    const RETENTION_DAYS = 14;
    const earliestAllowed = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const rawStartDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startDate = rawStartDate < earliestAllowed ? earliestAllowed : rawStartDate;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date();

    const account = userId ? await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: { id: true },
    }) : null;

    if (!account) {
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(generateMockAnalytics(startDate, endDate));
      }
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const activeProvider = await getAccountProvider(account.id);

    if (activeProvider === 'RETELL') {
      try {
        const retellData = await computeRetellAnalytics(account.id, startDate, endDate);
        if (retellData.metrics.totalCalls === 0 && process.env.NODE_ENV === 'development') {
          return NextResponse.json(generateMockAnalytics(startDate, endDate));
        }
        return NextResponse.json(retellData);
      } catch (retellErr) {
        console.warn('[analytics] Retell API call failed:', retellErr);
        if (process.env.NODE_ENV === 'development') {
          return NextResponse.json(generateMockAnalytics(startDate, endDate));
        }
        throw retellErr;
      }
    }

    // Get account's phone numbers from VapiPhoneNumber table
    let phoneNumbers = await prisma.vapiPhoneNumber.findMany({
      where: { accountId: account.id, isActive: true },
      select: { vapiPhoneId: true },
    });

    // Fallback: if no VapiPhoneNumber records, try phoneIntegrationSettings
    if (phoneNumbers.length === 0) {
      const fullAccount = await prisma.account.findUnique({
        where: { id: account.id },
        select: { phoneIntegrationSettings: true },
      });
      const settings = fullAccount?.phoneIntegrationSettings as any;
      if (settings?.vapiPhoneId) {
        phoneNumbers = [{ vapiPhoneId: settings.vapiPhoneId }];
      }
    }

    const emptyResponse = {
      dateRange: { start: startDate, end: endDate },
      metrics: {
        totalCalls: 0, bookingRate: 0, avgCallTime: 0, totalCost: 0, insuranceVerified: 0,
        paymentPlans: { count: 0, totalAmount: 0 },
        collections: { count: 0, totalAmount: 0, recovered: 0, collectionRate: 0 },
      },
      activityTrend: [],
      outcomesDistribution: [],
    };

    if (phoneNumbers.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(generateMockAnalytics(startDate, endDate));
      }
      return NextResponse.json(emptyResponse);
    }

    const vapiService = createVapiService();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // -----------------------------------------------------------------------
    // PART 1: Vapi Analytics API for aggregate metrics
    // Uses POST /analytics for efficient server-side aggregation.
    // Note: This returns org-wide data (no phone-number filter), so we use
    // it for global trends and always verify against listCalls for accuracy.
    // -----------------------------------------------------------------------
    let totalCalls = 0;
    let avgDurationSeconds = 0;
    let totalCost = 0;
    let activityTrend: Array<{ date: string; count: number }> = [];

    try {
      const analyticsQuery: VapiAnalyticsQuery = {
        queries: [
          {
            table: 'call',
            name: 'callMetrics',
            timeRange: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              timezone,
            },
            operations: [
              { operation: 'count', column: 'id', alias: 'totalCalls' },
              { operation: 'avg', column: 'duration', alias: 'avgDuration' },
              { operation: 'sum', column: 'cost', alias: 'totalCost' },
            ],
          },
          {
            table: 'call',
            name: 'dailyTrend',
            timeRange: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              step: 'day',
              timezone,
            },
            operations: [
              { operation: 'count', column: 'id', alias: 'count' },
            ],
          },
        ],
      };

      const analyticsResult = await vapiService.getCallAnalytics(analyticsQuery);

      console.log('[Analytics] Vapi POST /analytics raw result type:', typeof analyticsResult, Array.isArray(analyticsResult));
      if (analyticsResult) {
        console.log('[Analytics] Vapi POST /analytics keys:', Object.keys(analyticsResult));
      }

      // Parse analytics API results — response is Array<{ name, timeRange, result }>
      const results = Array.isArray(analyticsResult)
        ? analyticsResult
        : (analyticsResult as any)?.data ?? (analyticsResult as any)?.results ?? [];

      console.log('[Analytics] Parsed results:', Array.isArray(results), 'length:', results?.length);

      if (Array.isArray(results)) {
        for (const queryResult of results) {
          console.log('[Analytics] Query result:', queryResult.name, 'result rows:', queryResult.result?.length);

          if (queryResult.name === 'callMetrics' && queryResult.result?.length > 0) {
            const metrics = queryResult.result[0];
            // Vapi analytics returns strings — coerce to numbers
            totalCalls = Number(metrics.totalCalls) || 0;
            avgDurationSeconds = Math.round(Number(metrics.avgDuration) || 0);
            totalCost = Math.round((Number(metrics.totalCost) || 0) * 100) / 100;
            console.log('[Analytics] callMetrics:', { totalCalls, avgDurationSeconds, totalCost });
          }

          if (queryResult.name === 'dailyTrend' && queryResult.result?.length > 0) {
            activityTrend = queryResult.result.map((row: any) => ({
              date: (row.date || row.timestamp || '').toString().slice(0, 10),
              count: Number(row.count) || 0,
            })).filter((r: any) => r.date);
            console.log('[Analytics] dailyTrend entries:', activityTrend.length, 'sample:', activityTrend.slice(0, 3));
          }
        }
      }
    } catch (analyticsErr) {
      console.error('[Analytics] Vapi analytics API failed, will compute from calls:', analyticsErr);
    }

    // -----------------------------------------------------------------------
    // PART 2: Fetch calls for structured output analysis
    // Always fetch WITHOUT date filter first to ensure we have data.
    // Then filter by date range client-side for the selected period.
    // -----------------------------------------------------------------------
    const MAX_CALLS_FOR_OUTCOMES = 500;
    const allFetchedCalls: VapiCall[] = [];

    console.log('[Analytics] Fetching calls for phones:', phoneNumbers.map(p => p.vapiPhoneId));

    for (const phone of phoneNumbers) {
      const calls = await vapiService.listCalls({
        phoneNumberId: phone.vapiPhoneId,
        limit: MAX_CALLS_FOR_OUTCOMES,
        createdAtGe: startDate.toISOString(),
        createdAtLe: endDate.toISOString(),
      });
      console.log(`[Analytics] Phone ${phone.vapiPhoneId}: ${calls.length} calls from listCalls`);
      allFetchedCalls.push(...calls);
    }

    console.log(`[Analytics] Total fetched calls: ${allFetchedCalls.length}`);

    // allFetchedCalls are already within the date range (via Vapi query params).
    // Apply a lenient client-side filter just in case of edge cases.
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const recentCalls = allFetchedCalls.filter((call) => {
      const callTime = new Date(call.startedAt || call.endedAt || call.createdAt || 0).getTime();
      return callTime >= startMs && callTime <= endMs;
    });

    console.log(`[Analytics] After date filter (${startDate.toISOString()} - ${endDate.toISOString()}): ${recentCalls.length} calls`);

    // If analytics API returned 0 calls but we have calls, use listCalls data
    if (totalCalls === 0 && recentCalls.length > 0) {
      totalCalls = recentCalls.length;
    }

    // If analytics API didn't return trends, compute from calls
    if (activityTrend.length === 0 && recentCalls.length > 0) {
      const dailyCounts = new Map<string, number>();
      for (const call of recentCalls) {
        const dateKey = (call.startedAt || call.endedAt || '').slice(0, 10);
        if (dateKey) {
          dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
        }
      }
      activityTrend = buildFullActivityTrend(dailyCounts, startDate, endDate);
    }

    // Compute outcome metrics from structured data in calls
    const outcomeCounts = new Map<string, number>();
    let bookedCount = 0;
    let insuranceVerifiedCount = 0;
    let paymentPlanCount = 0;
    let collectionCount = 0;
    let fallbackDuration = 0;
    let fallbackDurationCount = 0;

    for (const call of recentCalls) {
      const sd = call.analysis?.structuredData || {};
      const outcome = inferOutcome(sd);

      outcomeCounts.set(outcome, (outcomeCounts.get(outcome) || 0) + 1);
      if (outcome === 'BOOKED' || outcome === 'RESCHEDULED') bookedCount++;

      if (sd.insuranceVerified) insuranceVerifiedCount++;
      if (sd.paymentDiscussed) paymentPlanCount++;
      if (sd.collectionAttempt) collectionCount++;

      if (avgDurationSeconds === 0 && call.startedAt && call.endedAt) {
        const dur = Math.round(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        );
        fallbackDuration += dur;
        fallbackDurationCount++;
      }
    }

    const avgCallTime = avgDurationSeconds > 0
      ? avgDurationSeconds
      : (fallbackDurationCount > 0 ? Math.round(fallbackDuration / fallbackDurationCount) : 0);

    const sampleSize = recentCalls.length;
    const bookingRate = sampleSize > 0
      ? Math.round((bookedCount / sampleSize) * 1000) / 10
      : 0;

    const outcomesDistribution = Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({
      outcome,
      count,
      percentage: sampleSize > 0 ? Math.round((count / sampleSize) * 1000) / 10 : 0,
    }));

    console.log('[Analytics] Final response:', {
      totalCalls,
      bookingRate,
      avgCallTime: avgCallTime,
      activityTrendEntries: activityTrend.length,
      outcomesCount: outcomesDistribution.length,
      recentCallsCount: recentCalls.length,
    });

    // If no calls at all, return mock in dev
    if (totalCalls === 0 && recentCalls.length === 0 && process.env.NODE_ENV === 'development') {
      return NextResponse.json(generateMockAnalytics(startDate, endDate));
    }

    // Compute blended totalCost from individual calls (admin-only)
    const isAdmin = isAdminUser(userId);
    let blendedTotalCost = 0;

    if (isAdmin && recentCalls.length > 0) {
      const pricingRates = await getPlatformPricing(prisma);
      for (const call of recentCalls) {
        const vapiCost = Number(call.cost) || 0;
        let dur = 0;
        if (call.startedAt && call.endedAt) {
          dur = Math.round(
            (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
          );
        }
        const callType = call.type === 'outboundPhoneCall' ? 'outbound' as const : 'inbound' as const;
        const breakdown = calculateBlendedCost(vapiCost, dur, callType, pricingRates);
        blendedTotalCost += breakdown.totalDollars;
      }
      blendedTotalCost = Math.round(blendedTotalCost * 100) / 100;
    }

    return NextResponse.json({
      dateRange: { start: startDate, end: endDate },
      metrics: {
        totalCalls,
        bookingRate,
        avgCallTime,
        totalCost: isAdmin ? blendedTotalCost : 0,
        insuranceVerified: insuranceVerifiedCount,
        paymentPlans: { count: paymentPlanCount, totalAmount: 0 },
        collections: { count: collectionCount, totalAmount: 0, recovered: 0, collectionRate: 0 },
      },
      activityTrend,
      outcomesDistribution,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Error fetching call analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

function inferOutcome(structuredData: Record<string, any>): string {
  const outcome = structuredData?.callOutcome;
  switch (outcome) {
    case 'appointment_booked': return 'BOOKED';
    case 'appointment_rescheduled': return 'RESCHEDULED';
    case 'appointment_cancelled': return 'CANCELLED';
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

/**
 * Collect the clinic's phone numbers for an account so we can scope
 * Retell calls by to_number instead of agent_id (which changes on redeploy).
 */
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

  // Include retired phone numbers so historical calls still appear in analytics
  const history = Array.isArray(fullAccount?.phoneNumberHistory)
    ? (fullAccount.phoneNumberHistory as Array<{ phoneNumber: string }>)
    : [];
  for (const entry of history) {
    if (entry.phoneNumber) numbers.add(normalizeE164(entry.phoneNumber));
  }

  return [...numbers];
}

function normalizeE164(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function emptyRetellResult(startDate: Date, endDate: Date) {
  return {
    dateRange: { start: startDate, end: endDate },
    metrics: { totalCalls: 0, bookingRate: 0, avgCallTime: 0, totalCost: 0 },
    activityTrend: buildFullActivityTrend(new Map(), startDate, endDate),
    outcomesDistribution: [],
    satisfactionBreakdown: [
      { label: 'Satisfied', count: 0, percentage: 0 },
      { label: 'Not Satisfied', count: 0, percentage: 0 },
      { label: 'Unknown', count: 0, percentage: 0 },
    ],
    callDurations: [],
    appointmentTypes: [],
  };
}

/**
 * Build a complete activity trend array filling in every day in the range,
 * even days with 0 calls, so the bar chart renders bars for each day.
 */
function buildFullActivityTrend(
  dailyCounts: Map<string, number>,
  startDate: Date,
  endDate: Date,
): Array<{ date: string; count: number }> {
  const trend: Array<{ date: string; count: number }> = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const dateKey = current.toISOString().slice(0, 10);
    trend.push({ date: dateKey, count: dailyCounts.get(dateKey) || 0 });
    current.setDate(current.getDate() + 1);
  }

  return trend;
}

async function computeRetellAnalytics(
  accountId: string,
  startDate: Date,
  endDate: Date,
) {
  const { createRetellService } = await import('@kit/shared/retell/retell.service');
  const retell = createRetellService();

  const clinicPhones = await collectClinicPhoneNumbers(accountId);

  if (clinicPhones.length === 0) {
    console.warn('[Retell Analytics] No phone numbers found for account', accountId);
    return emptyRetellResult(startDate, endDate);
  }

  // Fetch all calls in date range, then scope to this clinic by phone number.
  // This is agent-redeploy-safe: phone numbers stay the same across redeploys.
  const rawCalls = await retell.listCalls({
    filter_criteria: {
      after_start_timestamp: startDate.getTime(),
      before_start_timestamp: endDate.getTime(),
    },
    sort_order: 'descending',
    limit: 1000,
  });

  const clinicPhoneSet = new Set(clinicPhones);
  const uniqueCalls = (rawCalls || []).filter((call) => {
    const toNum = normalizeE164(call.to_number || '');
    const fromNum = normalizeE164(call.from_number || '');
    return clinicPhoneSet.has(toNum) || clinicPhoneSet.has(fromNum);
  });

  console.log(`[Retell Analytics] clinic phones: ${clinicPhones}, raw: ${rawCalls?.length ?? 0}, filtered: ${uniqueCalls.length}`);

  const totalCalls = uniqueCalls.length;
  let totalDuration = 0;
  let durationCount = 0;
  let bookedCount = 0;
  let satisfiedCount = 0;
  let unsatisfiedCount = 0;
  let satisfactionUnknown = 0;
  const outcomeCounts = new Map<string, number>();
  const appointmentTypes = new Map<string, number>();
  const dailyCounts = new Map<string, number>();
  const callDurations: Array<{ duration: number }> = [];

  for (const call of uniqueCalls) {
    const rawAnalysis = (call.call_analysis ?? {}) as Record<string, any>;
    const custom = (rawAnalysis.custom_analysis_data ?? {}) as Record<string, any>;
    const analysis = { ...rawAnalysis, ...custom };

    let dur = 0;
    if (call.start_timestamp && call.end_timestamp) {
      dur = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
    } else if (call.duration_ms) {
      dur = Math.round(call.duration_ms / 1000);
    }
    if (dur > 0) { totalDuration += dur; durationCount++; callDurations.push({ duration: dur }); }

    const outcome = inferRetellOutcome(analysis);

    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) || 0) + 1);
    if (outcome === 'BOOKED' || outcome === 'RESCHEDULED') bookedCount++;

    const presetSentiment = (rawAnalysis.user_sentiment || '').toLowerCase();
    const customSentiment = (custom.customer_sentiment || '').toLowerCase();
    const sentiment = customSentiment || presetSentiment || null;
    if (sentiment === 'very_positive' || sentiment === 'positive' || analysis.caller_satisfied === true) satisfiedCount++;
    else if (sentiment === 'negative' || sentiment === 'very_negative' || analysis.caller_satisfied === false) unsatisfiedCount++;
    else satisfactionUnknown++;

    const apptType = analysis.appointment_type as string | undefined;
    if (apptType) {
      appointmentTypes.set(apptType, (appointmentTypes.get(apptType) || 0) + 1);
    }

    const dateKey = call.start_timestamp
      ? new Date(call.start_timestamp).toISOString().slice(0, 10)
      : '';
    if (dateKey) dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
  }

  const avgCallTime = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
  const bookingRate = totalCalls > 0
    ? Math.round((bookedCount / totalCalls) * 1000) / 10
    : 0;

  return {
    dateRange: { start: startDate, end: endDate },
    metrics: {
      totalCalls,
      bookingRate,
      avgCallTime,
      totalCost: 0,
    },
    activityTrend: buildFullActivityTrend(dailyCounts, startDate, endDate),
    outcomesDistribution: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({
      outcome,
      count,
      percentage: totalCalls > 0 ? Math.round((count / totalCalls) * 1000) / 10 : 0,
    })),
    satisfactionBreakdown: [
      { label: 'Satisfied', count: satisfiedCount, percentage: totalCalls > 0 ? Math.round((satisfiedCount / totalCalls) * 1000) / 10 : 0 },
      { label: 'Not Satisfied', count: unsatisfiedCount, percentage: totalCalls > 0 ? Math.round((unsatisfiedCount / totalCalls) * 1000) / 10 : 0 },
      { label: 'Unknown', count: satisfactionUnknown, percentage: totalCalls > 0 ? Math.round((satisfactionUnknown / totalCalls) * 1000) / 10 : 0 },
    ],
    callDurations,
    appointmentTypes: Array.from(appointmentTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}
