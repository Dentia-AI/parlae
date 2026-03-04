import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/action-items
 *
 * Returns action items for the authenticated user's account.
 * Supports pagination and filtering by status, direction, reason.
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
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const status = url.searchParams.get('status') || '';
    const direction = url.searchParams.get('direction') || '';
    const reason = url.searchParams.get('reason') || '';

    const where: Record<string, unknown> = { accountId: account.id };

    if (status) where.status = status;
    if (direction) where.direction = direction;
    if (reason) where.reason = reason;

    const [items, total, members] = await Promise.all([
      prisma.actionItem.findMany({
        where: where as any,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.actionItem.count({ where: where as any }),
      prisma.accountMembership.findMany({
        where: { accountId: account.id },
        select: {
          userId: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),
    ]);

    const teamMembers = members.map((m) => ({
      id: m.user.id,
      name: m.user.displayName || m.user.email,
    }));

    return NextResponse.json({
      items,
      teamMembers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[action-items] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch action items' },
      { status: 500 },
    );
  }
}
