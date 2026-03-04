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
    const search = url.searchParams.get('search') || '';

    const where: Record<string, unknown> = { accountId };

    if (search.trim()) {
      where.OR = [
        { phoneNumber: { contains: search.trim(), mode: 'insensitive' } },
        { reason: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.doNotCallEntry.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.doNotCallEntry.count({ where: where as any }),
    ]);

    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        phoneNumber: e.phoneNumber,
        reason: e.reason,
        source: e.source,
        createdAt: e.createdAt.toISOString(),
      })),
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
    console.error('Error fetching DNC entries:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const { phoneNumber, reason } = await request.json();
    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const entry = await prisma.doNotCallEntry.upsert({
      where: {
        accountId_phoneNumber: { accountId, phoneNumber },
      },
      update: { reason: reason || 'manual' },
      create: {
        accountId,
        phoneNumber,
        reason: reason || 'manual',
        source: 'manual',
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error adding DNC entry:', error);
    return NextResponse.json({ error: 'Failed to add entry' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    await prisma.doNotCallEntry.deleteMany({
      where: { id, accountId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error removing DNC entry:', error);
    return NextResponse.json({ error: 'Failed to remove entry' }, { status: 500 });
  }
}
