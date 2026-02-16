import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

/**
 * GET /api/pms/connection-status?accountId=xxx
 * Check the status of a PMS integration connection.
 *
 * Looks across all accounts owned by the authenticated user to find
 * PMS records (they may be linked to a non-personal account).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json(
        { isConnected: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const accountId = request.nextUrl.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { isConnected: false, error: 'Missing accountId parameter' },
        { status: 400 },
      );
    }

    // Verify the requested account belongs to this user
    const requestedAccount = await prisma.account.findFirst({
      where: { id: accountId, primaryOwnerId: session.id },
      select: { id: true },
    });

    if (!requestedAccount) {
      return NextResponse.json(
        { isConnected: false, error: 'Account not found' },
        { status: 404 },
      );
    }

    // Find PMS integration across all accounts owned by this user
    const allUserAccounts = await prisma.account.findMany({
      where: { primaryOwnerId: session.id },
      select: { id: true },
    });
    const allAccountIds = allUserAccounts.map((a) => a.id);

    let pmsIntegration = null;
    try {
      pmsIntegration = await prisma.pmsIntegration.findFirst({
        where: { accountId: { in: allAccountIds } },
        select: {
          id: true,
          provider: true,
          providerName: true,
          status: true,
          lastSyncAt: true,
          lastError: true,
          config: true,
          features: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      // Table may not exist yet
    }

    if (!pmsIntegration) {
      return NextResponse.json({
        isConnected: false,
        status: 'not_configured',
        provider: null,
      });
    }

    const isConnected = pmsIntegration.status === 'ACTIVE';

    return NextResponse.json({
      isConnected,
      status: pmsIntegration.status,
      provider: pmsIntegration.providerName || pmsIntegration.provider,
      lastSync: pmsIntegration.lastSyncAt,
      error: pmsIntegration.lastError,
      features: pmsIntegration.features,
    });
  } catch (error) {
    console.error('Error checking PMS connection status:', error);
    return NextResponse.json(
      { isConnected: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
