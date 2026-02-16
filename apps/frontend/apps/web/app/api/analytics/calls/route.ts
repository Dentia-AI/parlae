import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';

import type { VapiCall } from '@kit/shared/vapi/vapi.service';

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
 * Returns aggregated call metrics for the analytics dashboard.
 * Data is fetched from Vapi API and aggregated server-side.
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
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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

    // Get account's phone numbers
    const phoneNumbers = await prisma.vapiPhoneNumber.findMany({
      where: { accountId: account.id, isActive: true },
      select: { vapiPhoneId: true },
    });

    if (phoneNumbers.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(generateMockAnalytics(startDate, endDate));
      }
      return NextResponse.json({
        dateRange: { start: startDate, end: endDate },
        metrics: {
          totalCalls: 0, bookingRate: 0, avgCallTime: 0, insuranceVerified: 0,
          paymentPlans: { count: 0, totalAmount: 0 },
          collections: { count: 0, totalAmount: 0, recovered: 0, collectionRate: 0 },
        },
        activityTrend: [],
        outcomesDistribution: [],
      });
    }

    // Fetch calls from Vapi for each phone number in the date range
    const vapiService = createVapiService();
    const allCalls: VapiCall[] = [];

    for (const phone of phoneNumbers) {
      const calls = await vapiService.listCalls({
        phoneNumberId: phone.vapiPhoneId,
        limit: 1000,
        createdAtGe: startDate.toISOString(),
        createdAtLe: endDate.toISOString(),
      });
      allCalls.push(...calls);
    }

    // If no calls, return mock in dev
    if (allCalls.length === 0 && process.env.NODE_ENV === 'development') {
      return NextResponse.json(generateMockAnalytics(startDate, endDate));
    }

    // Compute analytics from the fetched calls
    const totalCalls = allCalls.length;

    // Outcomes distribution
    const outcomeCounts = new Map<string, number>();
    let bookedCount = 0;
    let totalDuration = 0;
    let durationCount = 0;
    let insuranceVerifiedCount = 0;
    let paymentPlanCount = 0;
    let collectionCount = 0;

    // Activity trend by day
    const dailyCounts = new Map<string, number>();

    for (const call of allCalls) {
      const sd = call.analysis?.structuredData || {};
      const outcome = inferOutcome(sd);

      outcomeCounts.set(outcome, (outcomeCounts.get(outcome) || 0) + 1);
      if (outcome === 'BOOKED') bookedCount++;

      // Duration
      if (call.startedAt && call.endedAt) {
        const dur = Math.round(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        );
        totalDuration += dur;
        durationCount++;
      }

      // Structured data flags
      if (sd.insuranceVerified) insuranceVerifiedCount++;
      if (sd.paymentDiscussed) paymentPlanCount++;
      if (sd.collectionAttempt) collectionCount++;

      // Activity trend
      const dateKey = (call.startedAt || call.endedAt || '').slice(0, 10);
      if (dateKey) {
        dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
      }
    }

    const bookingRate = totalCalls > 0 ? Math.round((bookedCount / totalCalls) * 1000) / 10 : 0;
    const avgCallTime = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    const outcomesDistribution = Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({
      outcome,
      count,
      percentage: totalCalls > 0 ? Math.round((count / totalCalls) * 1000) / 10 : 0,
    }));

    const activityTrend = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      dateRange: { start: startDate, end: endDate },
      metrics: {
        totalCalls,
        bookingRate,
        avgCallTime,
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
