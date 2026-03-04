import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { auth } from '@kit/shared/auth/nextauth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ connected: false }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: session.user.id },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ connected: false });
    }

    const allAccountIds = [account.id];
    const teamAccounts = await prisma.account.findMany({
      where: {
        memberships: { some: { userId: session.user.id } },
        id: { not: account.id },
      },
      select: { id: true },
    });
    allAccountIds.push(...teamAccounts.map((a) => a.id));

    const integration = await prisma.pmsIntegration.findFirst({
      where: { accountId: { in: allAccountIds }, status: 'ACTIVE' },
      select: { provider: true, config: true, metadata: true },
    });

    if (!integration) {
      return NextResponse.json({ connected: false });
    }

    const config = integration.config as Record<string, any> | null;
    const meta = (integration as any).metadata as Record<string, any> | null;

    const actualPmsType = meta?.actualPmsType || config?.actualPmsType;
    const practiceName = meta?.practiceName || config?.practiceName;

    const displayProvider =
      (actualPmsType && actualPmsType !== 'Unknown')
        ? actualPmsType
        : practiceName || integration.provider;

    return NextResponse.json({
      connected: true,
      providerName: displayProvider,
      practiceName: practiceName || undefined,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
