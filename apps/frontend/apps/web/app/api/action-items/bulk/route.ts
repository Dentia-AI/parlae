import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * PATCH /api/action-items/bulk
 *
 * Bulk update action items: resolve all, assign all, etc.
 * Accepts { ids: string[], action: 'resolve' | 'assign', assignedToUserId?: string }
 */
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { ids, action, assignedToUserId } = body as {
      ids: string[];
      action: 'resolve' | 'assign';
      assignedToUserId?: string;
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No item IDs provided' }, { status: 400 });
    }

    if (!action || !['resolve', 'assign'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const whereClause = {
      id: { in: ids },
      accountId: account.id,
      status: { not: 'RESOLVED' as const },
    };

    if (action === 'resolve') {
      const result = await prisma.actionItem.updateMany({
        where: whereClause,
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedByUserId: userId,
        },
      });

      await prisma.notification.updateMany({
        where: {
          accountId: account.id,
          dismissed: false,
          link: '/home/action-items',
        },
        data: { dismissed: true },
      });

      return NextResponse.json({ updated: result.count });
    }

    if (action === 'assign') {
      const resolvedUserId = assignedToUserId === '__self__' ? userId : assignedToUserId;
      if (!resolvedUserId) {
        return NextResponse.json({ error: 'No assignee provided' }, { status: 400 });
      }

      const result = await prisma.actionItem.updateMany({
        where: whereClause,
        data: {
          status: 'IN_PROGRESS',
          assignedToUserId: resolvedUserId,
        },
      });

      return NextResponse.json({ updated: result.count });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[action-items/bulk] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bulk update' },
      { status: 500 },
    );
  }
}
