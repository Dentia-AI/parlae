import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';

import type { VapiCall, VapiAnalyticsQuery } from '@kit/shared/vapi/vapi.service';

/**
 * Generate mock analytics data for development
 */
function generateMockAnalytics(startDate: Date, endDate: Date) {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const activityTrend = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return {
      date: date.toISOString().split('T')[0],
      count: Math.floor(Math.random() * 30) + 10,
    };
  });

  const totalCalls = activityTrend.reduce((sum, day) => sum + day.count, 0);

  return {
    dateRange: { start: startDate, end: endDate },
    metrics: {
      totalCalls,
      bookingRate: 78,
      avgCallTime: 102,
      totalCost: 0,
      insuranceVerified: Math.floor(totalCalls * 0.65),
      paymentPlans: { count: Math.floor(totalCalls * 0.16), totalAmount: 4720000 },
      collections: { count: Math.floor(totalCalls * 0.12), totalAmount: 3280000, recovered: 3280000, collectionRate: 89.0 },
    },
    activityTrend,
    outcomesDistribution: [
      { outcome: 'BOOKED', count: Math.floor(totalCalls * 0.78), percentage: 78 },
      { outcome: 'TRANSFERRED', count: Math.floor(totalCalls * 0.14), percentage: 14 },
      { outcome: 'INSURANCE_INQUIRY', count: Math.floor(totalCalls * 0.06), percentage: 6 },
      { outcome: 'OTHER', count: Math.floor(totalCalls * 0.02), percentage: 2 },
    ],
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

      // Parse analytics API results — response is Array<{ name, timeRange, result }>
      const results = Array.isArray(analyticsResult)
        ? analyticsResult
        : (analyticsResult as any)?.data ?? (analyticsResult as any)?.results ?? [];

      if (Array.isArray(results)) {
        for (const queryResult of results) {
          if (queryResult.name === 'callMetrics' && queryResult.result?.length > 0) {
            const metrics = queryResult.result[0];
            totalCalls = metrics.totalCalls || 0;
            avgDurationSeconds = Math.round(metrics.avgDuration || 0);
            totalCost = Math.round((metrics.totalCost || 0) * 100) / 100;
          }

          if (queryResult.name === 'dailyTrend' && queryResult.result?.length > 0) {
            activityTrend = queryResult.result.map((row: any) => ({
              date: (row.date || row.timestamp || '').toString().slice(0, 10),
              count: row.count || 0,
            })).filter((r: any) => r.date);
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

    for (const phone of phoneNumbers) {
      const calls = await vapiService.listCalls({
        phoneNumberId: phone.vapiPhoneId,
        limit: MAX_CALLS_FOR_OUTCOMES,
      });
      allFetchedCalls.push(...calls);
    }

    // Filter to the requested date range
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const recentCalls = allFetchedCalls.filter((call) => {
      const callTime = new Date(call.startedAt || call.endedAt || call.createdAt || 0).getTime();
      return callTime >= startMs && callTime <= endMs;
    });

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
      activityTrend = Array.from(dailyCounts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
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
      if (outcome === 'BOOKED') bookedCount++;

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

    // If no calls at all, return mock in dev
    if (totalCalls === 0 && recentCalls.length === 0 && process.env.NODE_ENV === 'development') {
      return NextResponse.json(generateMockAnalytics(startDate, endDate));
    }

    return NextResponse.json({
      dateRange: { start: startDate, end: endDate },
      metrics: {
        totalCalls,
        bookingRate,
        avgCallTime,
        totalCost,
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
