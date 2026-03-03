import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/get-session';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/outbound/campaigns/approve-all
 *
 * Approve all DRAFT campaigns for the current user's account.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

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

    const result = await prisma.outboundCampaign.updateMany({
      where: { accountId: account.id, status: 'DRAFT' },
      data: {
        status: 'ACTIVE',
        scheduledStartAt: new Date(),
      },
    });

    logger.info(
      { accountId: account.id, approved: result.count },
      '[Outbound] Bulk approved all DRAFT campaigns',
    );

    return NextResponse.json({
      success: true,
      approved: result.count,
    });
  } catch (error) {
    logger.error({ error }, '[Outbound] Approve all failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve campaigns' },
      { status: 500 },
    );
  }
}
