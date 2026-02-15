import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';

/**
 * GET /api/admin/billing/clinics
 * Returns all clinic accounts with their billing configuration
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
      where: {
        isPersonalAccount: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        publicData: true,
      },
      orderBy: { name: 'asc' },
    });

    const clinics = accounts.map((account) => {
      const publicData = (account.publicData as Record<string, unknown>) ?? {};
      const billingConfig = publicData.billingConfig as Record<string, unknown> | undefined;
      const billingEnabled = publicData.billingEnabled === true;

      return {
        accountId: account.id,
        accountName: account.name,
        accountEmail: account.email,
        billingEnabled,
        billingConfig: billingConfig
          ? {
              basePricePerLocation: (billingConfig.basePricePerLocation as number) ?? 149,
              additionalLocationMultiplier: (billingConfig.additionalLocationMultiplier as number) ?? 0.5,
              includedMinutes: (billingConfig.includedMinutes as number) ?? 500,
              overageRate: (billingConfig.overageRate as number) ?? 0.15,
              installationFee: (billingConfig.installationFee as number) ?? 5,
              featurePricing: (billingConfig.featurePricing as Record<string, number>) ?? {},
              currency: (billingConfig.currency as string) ?? 'CAD',
              notes: (billingConfig.notes as string) ?? '',
            }
          : null,
      };
    });

    return NextResponse.json({ clinics });
  } catch (error) {
    console.error('Error fetching clinics for billing:', error);

    if (error instanceof Error && error.message === 'Admin access required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 },
    );
  }
}
