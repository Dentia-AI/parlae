import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

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

    const account = userId
      ? await prisma.account.findFirst({
          where: { primaryOwnerId: userId, isPersonalAccount: true },
          select: { id: true },
        })
      : null;

    if (!account) {
      return NextResponse.json({
        outboundCalls: 0,
        reachRate: 0,
        successRate: 0,
        activeCampaigns: 0,
        enabled: false,
      });
    }

    const accountId = account.id;

    let settings: any = null;
    try {
      settings = await prisma.outboundSettings.findUnique({
        where: { accountId },
      });
    } catch {
      return NextResponse.json({
        outboundCalls: 0,
        reachRate: 0,
        successRate: 0,
        activeCampaigns: 0,
        enabled: false,
      });
    }

    const enabled =
      settings?.patientCareEnabled || settings?.financialEnabled || false;

    if (!enabled) {
      return NextResponse.json({
        outboundCalls: 0,
        reachRate: 0,
        successRate: 0,
        activeCampaigns: 0,
        enabled: false,
      });
    }

    const [activeCampaigns, contacts] = await Promise.all([
      prisma.outboundCampaign.count({
        where: { accountId, status: 'ACTIVE' },
      }),
      prisma.campaignContact.findMany({
        where: {
          campaign: { accountId },
          updatedAt: { gte: startDate, lte: endDate },
          status: { not: 'QUEUED' },
        },
        select: { status: true, outcome: true },
      }),
    ]);

    const totalAttempted = contacts.length;
    const answered = contacts.filter(
      (c) => c.status === 'COMPLETED',
    ).length;
    const positiveOutcomes = ['booked', 'confirmed', 'paid', 'interested', 'scheduled'];
    const successful = contacts.filter(
      (c) =>
        c.status === 'COMPLETED' &&
        c.outcome &&
        positiveOutcomes.includes(c.outcome.toLowerCase()),
    ).length;

    const reachRate =
      totalAttempted > 0 ? Math.round((answered / totalAttempted) * 100) : 0;
    const successRate =
      totalAttempted > 0 ? Math.round((successful / totalAttempted) * 100) : 0;

    return NextResponse.json({
      outboundCalls: totalAttempted,
      reachRate,
      successRate,
      activeCampaigns,
      enabled: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching outbound analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch outbound analytics' },
      { status: 500 },
    );
  }
}
