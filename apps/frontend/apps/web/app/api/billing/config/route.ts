import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

/**
 * GET /api/billing/config
 * Returns the current user's billing configuration (set by admin)
 * and their saved plan preferences
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: session.id,
        isPersonalAccount: true,
      },
      select: {
        publicData: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const publicData = (account.publicData as Record<string, unknown>) ?? {};

    return NextResponse.json({
      billingEnabled: publicData.billingEnabled === true,
      billingConfig: publicData.billingConfig ?? null,
      billingPlan: publicData.billingPlan ?? null,
    });
  } catch (error) {
    console.error('Error fetching billing config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing configuration' },
      { status: 500 },
    );
  }
}
