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
        googleCalendarConnected: true,
        googleCalendarEmail: true,
        setupProgress: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check PMS from setupProgress
    const progress = (account.setupProgress as Record<string, any>) ?? {};
    const pmsConnected = !!progress.pmsProvider || !!progress.pmsConnected;
    const pmsProvider = progress.pmsProvider as string | undefined;

    return NextResponse.json({
      googleCalendar: account.googleCalendarConnected,
      googleCalendarEmail: account.googleCalendarEmail,
      pms: pmsConnected,
      pmsProvider: pmsProvider,
    });
  } catch (error) {
    console.error('Error fetching integration status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integration status' },
      { status: 500 },
    );
  }
}
