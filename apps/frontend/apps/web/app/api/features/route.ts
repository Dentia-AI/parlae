import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/features
 * Returns the feature settings for the current user's account.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    const account = userId
      ? await prisma.account.findFirst({
          where: { primaryOwnerId: userId, isPersonalAccount: true },
          select: { id: true, featureSettings: true },
        })
      : null;

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      featureSettings: (account.featureSettings as Record<string, boolean>) ?? {},
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching feature settings:', error);
    return NextResponse.json({ error: 'Failed to fetch feature settings' }, { status: 500 });
  }
}

/**
 * PUT /api/features
 * Updates the feature settings for the current user's account.
 * Body: { featureSettings: Record<string, boolean> }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    const body = await request.json();
    const { featureSettings } = body;

    if (!featureSettings || typeof featureSettings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid feature settings' },
        { status: 400 },
      );
    }

    const account = userId
      ? await prisma.account.findFirst({
          where: { primaryOwnerId: userId, isPersonalAccount: true },
          select: { id: true },
        })
      : null;

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { featureSettings },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error updating feature settings:', error);
    return NextResponse.json({ error: 'Failed to update feature settings' }, { status: 500 });
  }
}
