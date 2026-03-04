import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

const PATIENT_CARE_CALL_TYPES = [
  'RECALL', 'REMINDER', 'FOLLOWUP', 'NOSHOW', 'TREATMENT_PLAN',
  'POSTOP', 'REACTIVATION', 'SURVEY', 'WELCOME',
];

const FINANCIAL_CALL_TYPES = ['PAYMENT', 'BENEFITS'];

const GROUP_MAP: Record<string, string[]> = {
  PATIENT_CARE: PATIENT_CARE_CALL_TYPES,
  FINANCIAL: FINANCIAL_CALL_TYPES,
};

async function getAccountId(userId: string) {
  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId, isPersonalAccount: true },
    select: { id: true },
  });
  return account?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const group = url.searchParams.get('group') || '';

    const callTypes = GROUP_MAP[group];
    if (!callTypes) {
      return NextResponse.json({ error: 'Invalid group. Use PATIENT_CARE or FINANCIAL.' }, { status: 400 });
    }

    const where: Record<string, unknown> = {
      accountId,
      callType: { in: callTypes },
    };

    const [campaigns, total, summary] = await Promise.all([
      prisma.outboundCampaign.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.outboundCampaign.count({ where: where as any }),
      prisma.outboundCampaign.groupBy({
        by: ['callType', 'status'],
        where: { accountId, callType: { in: callTypes } } as any,
        _count: true,
        _sum: { totalContacts: true },
      }),
    ]);

    // Build per-callType summary: { RECALL: { campaigns: 5, active: 2, contacts: 120 }, ... }
    const callTypeSummary: Record<string, { campaigns: number; active: number; contacts: number }> = {};
    for (const row of summary) {
      const ct = row.callType as string;
      if (!callTypeSummary[ct]) {
        callTypeSummary[ct] = { campaigns: 0, active: 0, contacts: 0 };
      }
      callTypeSummary[ct]!.campaigns += row._count;
      callTypeSummary[ct]!.contacts += row._sum?.totalContacts ?? 0;
      if (row.status === 'ACTIVE') {
        callTypeSummary[ct]!.active += row._count;
      }
    }

    return NextResponse.json({
      campaigns,
      summary: callTypeSummary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching campaigns:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}
