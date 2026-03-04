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
    const url = request.nextUrl;
    const contactPage = Math.max(1, parseInt(url.searchParams.get('contactPage') || '1', 10));
    const contactLimit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('contactLimit') || '20', 10)));

    const campaign = await prisma.outboundCampaign.findFirst({
      where: { id, accountId },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const [contacts, contactsTotal, statusCounts, outcomeCounts] = await Promise.all([
      prisma.campaignContact.findMany({
        where: { campaignId: id },
        orderBy: { updatedAt: 'desc' },
        skip: (contactPage - 1) * contactLimit,
        take: contactLimit,
      }),
      prisma.campaignContact.count({ where: { campaignId: id } }),
      prisma.campaignContact.groupBy({
        by: ['status'],
        where: { campaignId: id },
        _count: true,
      }),
      prisma.campaignContact.groupBy({
        by: ['outcome'],
        where: { campaignId: id, outcome: { not: null } },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      ...campaign,
      contacts,
      contactsPagination: {
        page: contactPage,
        limit: contactLimit,
        total: contactsTotal,
        totalPages: Math.ceil(contactsTotal / contactLimit),
      },
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

    if (action === 'setChannel') {
      if (['COMPLETED', 'CANCELLED'].includes(campaign.status)) {
        return NextResponse.json({ error: 'Channel cannot be changed on completed or cancelled campaigns' }, { status: 400 });
      }
      const VALID_CHANNELS = ['NONE', 'PHONE', 'SMS', 'EMAIL'];
      const channel = body.channel;
      if (!channel || !VALID_CHANNELS.includes(channel)) {
        return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
      }
      const updated = await prisma.outboundCampaign.update({
        where: { id },
        data: { channel: channel as any },
      });
      return NextResponse.json(updated);
    }

    const validTransitions: Record<string, string[]> = {
      pause: ['ACTIVE'],
      resume: ['PAUSED'],
      cancel: ['ACTIVE', 'PAUSED', 'SCHEDULED', 'DRAFT'],
      approve: ['DRAFT'],
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
      approve: 'ACTIVE',
    };

    const updateData: Record<string, unknown> = {
      status: statusMap[action] as any,
    };

    if (action === 'approve') {
      updateData.scheduledStartAt = new Date();
    }

    const updated = await prisma.outboundCampaign.update({
      where: { id },
      data: updateData,
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
