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
      select: { provider: true, config: true },
    });

    if (!integration) {
      return NextResponse.json({ connected: false });
    }

    const config = integration.config as Record<string, any> | null;

    return NextResponse.json({
      connected: true,
      providerName: integration.provider,
      practiceName: config?.practiceName || undefined,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
