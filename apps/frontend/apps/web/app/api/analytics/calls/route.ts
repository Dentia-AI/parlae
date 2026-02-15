import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * Generate mock analytics data for development
 */
function generateMockAnalytics(startDate: Date, endDate: Date) {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Generate activity trend
  const activityTrend = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return {
      date: date.toISOString().split('T')[0],
      count: Math.floor(Math.random() * 30) + 10, // 10-40 calls per day
    };
  });

  const totalCalls = activityTrend.reduce((sum, day) => sum + day.count, 0);
  
  return {
    dateRange: {
      start: startDate,
      end: endDate,
    },
    metrics: {
      totalCalls,
      bookingRate: 78, // 78%
      avgCallTime: 102, // 1m 42s
      insuranceVerified: Math.floor(totalCalls * 0.65), // 65%
      paymentPlans: {
        count: Math.floor(totalCalls * 0.16), // 16%
        totalAmount: 4720000, // $47,200
      },
      collections: {
        count: Math.floor(totalCalls * 0.12), // 12%
        totalAmount: 3280000, // $32,800
        recovered: 3280000,
        collectionRate: 89.0,
      },
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
 * Returns aggregated call metrics for the analytics dashboard
 * Query params:
 * - startDate: ISO date string (default: 7 days ago)
 * - endDate: ISO date string (default: now)
 * - agentId: voice agent ID (optional, filter by specific agent)
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireSession();
    const userId = session.user?.id;
    
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date();
    const agentId = searchParams.get('agentId');

    // Get user's personal account for scoping
    const account = userId ? await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: { id: true },
    }) : null;

    // Build the where clause - scoped to user's account
    const where: any = {
      callStartedAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Scope to account if available
    if (account) {
      where.accountId = account.id;
    }

    if (agentId) {
      where.voiceAgentId = agentId;
    }

    // Get total calls
    const totalCalls = await prisma.callLog.count({ where });

    // If no calls and in development, return mock data
    if (totalCalls === 0 && process.env.NODE_ENV === 'development') {
      const mockData = generateMockAnalytics(startDate, endDate);
      return NextResponse.json(mockData);
    }

    // Get calls by outcome for booking rate calculation
    const callsByOutcome = await prisma.callLog.groupBy({
      by: ['outcome'],
      where,
      _count: true,
    });

    // Calculate booking rate
    const bookedCalls = callsByOutcome.find(g => g.outcome === 'BOOKED')?._count || 0;
    const bookingRate = totalCalls > 0 ? (bookedCalls / totalCalls) * 100 : 0;

    // Get average call time
    const avgDuration = await prisma.callLog.aggregate({
      where: {
        ...where,
        duration: { not: null },
      },
      _avg: {
        duration: true,
      },
    });

    const avgCallTime = avgDuration._avg.duration || 0;

    // Get insurance verified count
    const insuranceVerified = await prisma.callLog.count({
      where: {
        ...where,
        insuranceVerified: true,
      },
    });

    // Get payment plans stats
    const paymentPlans = await prisma.callLog.aggregate({
      where: {
        ...where,
        paymentPlanDiscussed: true,
      },
      _sum: {
        paymentPlanAmount: true,
      },
      _count: true,
    });

    // Get collections stats
    const collections = await prisma.callLog.aggregate({
      where: {
        ...where,
        collectionAttempt: true,
      },
      _sum: {
        collectionAmount: true,
      },
      _count: {
        _all: true,
      },
    });

    const collectionSuccess = await prisma.callLog.count({
      where: {
        ...where,
        collectionSuccess: true,
      },
    });

    const collectionRate = collections._count._all > 0 
      ? (collectionSuccess / collections._count._all) * 100 
      : 0;

    // Get activity trend (calls per day) - scoped to account
    const accountId = account?.id;
    const activityTrend = accountId && agentId
      ? await prisma.$queryRaw`
          SELECT 
            DATE(call_started_at) as date,
            COUNT(*)::int as count
          FROM call_logs
          WHERE call_started_at >= ${startDate}
            AND call_started_at <= ${endDate}
            AND account_id = ${accountId}
            AND voice_agent_id = ${agentId}
          GROUP BY DATE(call_started_at)
          ORDER BY date ASC
        `
      : accountId
      ? await prisma.$queryRaw`
          SELECT 
            DATE(call_started_at) as date,
            COUNT(*)::int as count
          FROM call_logs
          WHERE call_started_at >= ${startDate}
            AND call_started_at <= ${endDate}
            AND account_id = ${accountId}
          GROUP BY DATE(call_started_at)
          ORDER BY date ASC
        `
      : await prisma.$queryRaw`
          SELECT 
            DATE(call_started_at) as date,
            COUNT(*)::int as count
          FROM call_logs
          WHERE call_started_at >= ${startDate}
            AND call_started_at <= ${endDate}
          GROUP BY DATE(call_started_at)
          ORDER BY date ASC
        `;

    // Get call outcomes distribution
    const outcomesDistribution = callsByOutcome.map(group => ({
      outcome: group.outcome,
      count: group._count,
      percentage: totalCalls > 0 ? (group._count / totalCalls) * 100 : 0,
    }));

    return NextResponse.json({
      dateRange: {
        start: startDate,
        end: endDate,
      },
      metrics: {
        totalCalls,
        bookingRate: Math.round(bookingRate * 10) / 10, // Round to 1 decimal
        avgCallTime: Math.round(avgCallTime), // Round to nearest second
        insuranceVerified,
        paymentPlans: {
          count: paymentPlans._count,
          totalAmount: paymentPlans._sum.paymentPlanAmount || 0,
        },
        collections: {
          count: collections._count._all,
          totalAmount: collections._sum.collectionAmount || 0,
          recovered: collections._sum.collectionAmount || 0,
          collectionRate: Math.round(collectionRate * 10) / 10,
        },
      },
      activityTrend,
      outcomesDistribution,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.error('Error fetching call analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
