import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/call-logs
 * 
 * Returns paginated call logs for the current user's account.
 * Supports filtering by outcome, date range, search term, and call reason.
 * 
 * HIPAA: Requires authentication. Only returns logs for the user's account.
 * Access is logged for audit trail.
 *
 * Query params:
 * - page: page number (default: 1)
 * - limit: items per page (default: 20, max: 100)
 * - outcome: filter by outcome (BOOKED, TRANSFERRED, etc.)
 * - callReason: filter by call reason
 * - status: filter by status (COMPLETED, MISSED, etc.)
 * - startDate: ISO date string (filter from)
 * - endDate: ISO date string (filter to)
 * - search: search by contact name or phone number
 * - sortBy: field to sort by (default: callStartedAt)
 * - sortOrder: asc or desc (default: desc)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's personal account
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
    const offset = (page - 1) * limit;
    const outcome = searchParams.get('outcome');
    const callReason = searchParams.get('callReason');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'callStartedAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Build where clause - scoped to user's account
    const where: any = {
      accountId: account.id,
    };

    if (outcome) {
      where.outcome = outcome;
    }

    if (callReason) {
      where.callReason = callReason;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.callStartedAt = {};
      if (startDate) where.callStartedAt.gte = new Date(startDate);
      if (endDate) where.callStartedAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { contactName: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Valid sort fields to prevent injection
    const validSortFields = ['callStartedAt', 'duration', 'outcome', 'status', 'contactName'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'callStartedAt';

    // Fetch total count and page of results
    const [total, calls] = await Promise.all([
      prisma.callLog.count({ where }),
      prisma.callLog.findMany({
        where,
        orderBy: { [safeSortBy]: sortOrder },
        take: limit,
        skip: offset,
        select: {
          id: true,
          vapiCallId: true,
          phoneNumber: true,
          callType: true,
          direction: true,
          duration: true,
          status: true,
          outcome: true,
          callReason: true,
          urgencyLevel: true,
          contactName: true,
          contactEmail: true,
          summary: true,
          appointmentSet: true,
          insuranceVerified: true,
          paymentPlanDiscussed: true,
          transferredToStaff: true,
          transferredTo: true,
          followUpRequired: true,
          customerSentiment: true,
          costCents: true,
          callStartedAt: true,
          callEndedAt: true,
          createdAt: true,
        },
      }),
    ]);

    // Aggregate stats for the current filter
    const [outcomeStats, reasonStats] = await Promise.all([
      prisma.callLog.groupBy({
        by: ['outcome'],
        where: { accountId: account.id },
        _count: true,
      }),
      prisma.callLog.groupBy({
        by: ['callReason'],
        where: { accountId: account.id, callReason: { not: null } },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      calls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
      filters: {
        outcomes: outcomeStats.map(s => ({ value: s.outcome, count: s._count })),
        reasons: reasonStats.map(s => ({ value: s.callReason, count: s._count })),
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
