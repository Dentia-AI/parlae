import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/action-items/count
 *
 * Returns the count of OPEN action items for the dashboard badge.
 */
export async function GET() {
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
      return NextResponse.json({ count: 0 });
    }

    const count = await prisma.actionItem.count({
      where: { accountId: account.id, status: 'OPEN' },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[action-items/count] Error:', error);
    return NextResponse.json({ count: 0 });
  }
}
