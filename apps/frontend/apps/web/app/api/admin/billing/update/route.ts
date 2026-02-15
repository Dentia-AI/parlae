import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';

/**
 * POST /api/admin/billing/update
 * Updates billing configuration for a specific clinic account
 *
 * Body:
 * - accountId: string
 * - billingEnabled: boolean
 * - billingConfig: { basePricePerLocation, additionalLocationMultiplier, includedMinutes, overageRate, installationFee, featurePricing, currency, notes }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, billingEnabled, billingConfig } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, publicData: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    const existingPublicData =
      (account.publicData as Record<string, unknown>) ?? {};

    await prisma.account.update({
      where: { id: accountId },
      data: {
        publicData: {
          ...existingPublicData,
          billingEnabled: billingEnabled ?? false,
          billingConfig: billingConfig
            ? {
                basePricePerLocation: billingConfig.basePricePerLocation ?? 149,
                additionalLocationMultiplier:
                  billingConfig.additionalLocationMultiplier ?? 0.5,
                includedMinutes: billingConfig.includedMinutes ?? 500,
                overageRate: billingConfig.overageRate ?? 0.15,
                installationFee: billingConfig.installationFee ?? 5,
                featurePricing: billingConfig.featurePricing ?? {},
                currency: billingConfig.currency ?? 'CAD',
                notes: billingConfig.notes ?? '',
                updatedAt: new Date().toISOString(),
              }
            : existingPublicData.billingConfig,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating billing config:', error);

    if (error instanceof Error && error.message === 'Admin access required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Failed to update billing configuration' },
      { status: 500 },
    );
  }
}
