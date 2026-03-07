import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getEffectiveUserId } from '~/lib/auth/get-session';

export async function GET() {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ connected: false });
    }

    const allAccountIds = [account.id];
    const teamAccounts = await prisma.account.findMany({
      where: {
        memberships: { some: { userId } },
        id: { not: account.id },
      },
      select: { id: true },
    });
    allAccountIds.push(...teamAccounts.map((a) => a.id));

    const integration = await prisma.pmsIntegration.findFirst({
      where: { accountId: { in: allAccountIds }, status: 'ACTIVE' },
      select: { provider: true, providerName: true, config: true, metadata: true },
    });

    if (!integration) {
      return NextResponse.json({ connected: false });
    }

    const config = integration.config as Record<string, any> | null;
    const meta = (integration as any).metadata as Record<string, any> | null;

    const actualPmsType = meta?.actualPmsType || config?.actualPmsType;
    const practiceName = meta?.practiceName || config?.practiceName;

    // Prefer the real PMS name from metadata/config, then providerName,
    // then practiceName. Never return the raw enum (e.g. "SIKKA") as display.
    const displayProvider =
      (actualPmsType && actualPmsType !== 'Unknown')
        ? actualPmsType
        : integration.providerName || practiceName || null;

    return NextResponse.json({
      connected: true,
      providerName: displayProvider,
      practiceName: practiceName || undefined,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
