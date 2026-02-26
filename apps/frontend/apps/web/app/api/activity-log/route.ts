import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/activity-log
 *
 * Returns AI action log entries for the authenticated user's account.
 * Supports pagination, filtering by source/action/status, date range, and search.
 *
 * Query params:
 *   page       - Page number (default 1)
 *   limit      - Items per page (default 25, max 100)
 *   source     - Filter by source: 'pms' | 'gcal' | 'all'
 *   action     - Filter by action type
 *   status     - Filter by status: 'completed' | 'pending' | 'failed'
 *   search     - Search by resource ID or call ID
 *   startDate  - ISO date string for range start
 *   endDate    - ISO date string for range end
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

    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)));
    const source = url.searchParams.get('source') || 'all';
    const action = url.searchParams.get('action') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';
    const startDate = url.searchParams.get('startDate') || '';
    const endDate = url.searchParams.get('endDate') || '';

    const where: Record<string, unknown> = {
      accountId: account.id,
    };

    if (source && source !== 'all') {
      where.source = source;
    }

    if (action) {
      where.action = action;
    }

    if (status) {
      where.status = status;
    }

    if (search.trim()) {
      where.OR = [
        { externalResourceId: { contains: search, mode: 'insensitive' } },
        { callId: { contains: search, mode: 'insensitive' } },
        { calendarEventId: { contains: search, mode: 'insensitive' } },
        { writebackId: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.createdAt = dateFilter;
    }

    const [logs, total] = await Promise.all([
      prisma.aiActionLog.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.aiActionLog.count({ where: where as any }),
    ]);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[activity-log] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch activity log' },
      { status: 500 },
    );
  }
}
