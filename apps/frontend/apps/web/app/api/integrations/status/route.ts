import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

/**
 * GET /api/integrations/status
 * Returns the current user's integration connection status
 * (Google Calendar, PMS, etc.)
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
        id: true,
        googleCalendarConnected: true,
        googleCalendarEmail: true,
        setupProgress: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check PMS from setupProgress (legacy) AND from PmsIntegration model
    const progress = (account.setupProgress as Record<string, any>) ?? {};
    let pmsConnected = !!progress.pmsProvider || !!progress.pmsConnected;
    let pmsProvider = progress.pmsProvider as string | undefined;
    let pmsStatus: string | undefined;

    // Also check the PmsIntegration table (the real source of truth)
    try {
      const pmsIntegration = await prisma.pmsIntegration.findFirst({
        where: { accountId: account.id },
        select: {
          provider: true,
          providerName: true,
          status: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (pmsIntegration) {
        pmsConnected = true;
        pmsProvider = pmsIntegration.providerName || pmsIntegration.provider;
        pmsStatus = pmsIntegration.status;
      }
    } catch {
      // PmsIntegration table may not exist yet
    }

    return NextResponse.json({
      googleCalendar: account.googleCalendarConnected,
      googleCalendarEmail: account.googleCalendarEmail,
      pms: pmsConnected,
      pmsProvider: pmsProvider,
      pmsStatus: pmsStatus,
    });
  } catch (error) {
    console.error('Error fetching integration status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integration status' },
      { status: 500 },
    );
  }
}
