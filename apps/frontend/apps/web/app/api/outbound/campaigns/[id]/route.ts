import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

async function getAccountId(userId: string) {
  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId, isPersonalAccount: true },
    select: { id: true },
  });
  return account?.id ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const { id } = await params;

    const campaign = await prisma.outboundCampaign.findFirst({
      where: { id, accountId },
      include: {
        contacts: {
          orderBy: { updatedAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const statusCounts = await prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    const outcomeCounts = await prisma.campaignContact.groupBy({
      by: ['outcome'],
      where: { campaignId: id, outcome: { not: null } },
      _count: true,
    });

    return NextResponse.json({
      ...campaign,
      statusBreakdown: statusCounts.reduce(
        (acc, s) => ({ ...acc, [s.status]: s._count }),
        {} as Record<string, number>,
      ),
      outcomeBreakdown: outcomeCounts.reduce(
        (acc, o) => ({ ...acc, [o.outcome ?? 'unknown']: o._count }),
        {} as Record<string, number>,
      ),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching campaign:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const campaign = await prisma.outboundCampaign.findFirst({
      where: { id, accountId },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const validTransitions: Record<string, string[]> = {
      pause: ['ACTIVE'],
      resume: ['PAUSED'],
      cancel: ['ACTIVE', 'PAUSED', 'SCHEDULED', 'DRAFT'],
    };

    if (!action || !validTransitions[action]) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!validTransitions[action]!.includes(campaign.status)) {
      return NextResponse.json(
        { error: `Cannot ${action} a campaign with status ${campaign.status}` },
        { status: 400 },
      );
    }

    const statusMap: Record<string, string> = {
      pause: 'PAUSED',
      resume: 'ACTIVE',
      cancel: 'CANCELLED',
    };

    const updated = await prisma.outboundCampaign.update({
      where: { id },
      data: { status: statusMap[action] as any },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error updating campaign:', error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}
