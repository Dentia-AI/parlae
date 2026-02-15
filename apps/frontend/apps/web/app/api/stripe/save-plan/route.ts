import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { locations, features, estimatedCallVolume, currency } = body;

    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: session.id,
        isPersonalAccount: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Store plan preferences in publicData JSON field
    // This will be used for Stripe metered billing configuration
    const existingPublicData = (account.publicData as Record<string, unknown>) ?? {};

    await prisma.account.update({
      where: { id: account.id },
      data: {
        publicData: {
          ...existingPublicData,
          billingPlan: {
            locations,
            features,
            estimatedCallVolume,
            currency,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving plan preferences:', error);
    return NextResponse.json(
      { error: 'Failed to save plan preferences' },
      { status: 500 },
    );
  }
}
