import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

/**
 * GET /api/integrations/status
 * Returns the current user's integration connection status
 * (Google Calendar, PMS, etc.)
 *
 * PMS records may be linked to any account owned by the user (personal or
 * non-personal), so we query across all of them.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get ALL accounts owned by this user (personal and non-personal)
    const accounts = await prisma.account.findMany({
      where: { primaryOwnerId: session.id },
      select: {
        id: true,
        isPersonalAccount: true,
        googleCalendarConnected: true,
        googleCalendarEmail: true,
        setupProgress: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Use the personal account for Google Calendar status
    const personalAccount = accounts.find((a) => a.isPersonalAccount) ?? accounts[0]!;
    const allAccountIds = accounts.map((a) => a.id);

    // Check PMS from setupProgress (legacy)
    const progress = (personalAccount.setupProgress as Record<string, any>) ?? {};
    let pmsConnected = !!progress.pmsProvider || !!progress.pmsConnected;
    let pmsProvider = progress.pmsProvider as string | undefined;
    let pmsStatus: string | undefined;

    // Check the PmsIntegration table across ALL user accounts
    try {
      const pmsIntegration = await prisma.pmsIntegration.findFirst({
        where: { accountId: { in: allAccountIds } },
        select: {
          provider: true,
          providerName: true,
          status: true,
          metadata: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (pmsIntegration) {
        pmsConnected = true;
        // Show the actual PMS name (e.g. "Dentrix", "Eaglesoft") from metadata,
        // not "Sikka" which is just the middleware. Fall back to nothing.
        const meta = pmsIntegration.metadata as any;
        pmsProvider = (meta?.actualPmsType && meta.actualPmsType !== 'Unknown')
          ? meta.actualPmsType
          : meta?.practiceName || null;
        pmsStatus = pmsIntegration.status;
      }
    } catch {
      // PmsIntegration table may not exist yet
    }

    return NextResponse.json({
      googleCalendar: personalAccount.googleCalendarConnected,
      googleCalendarEmail: personalAccount.googleCalendarEmail,
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
