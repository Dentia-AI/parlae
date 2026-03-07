import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getEffectiveUserId } from '~/lib/auth/get-session';

export async function POST() {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await prisma.account.update({
      where: { id: account.id },
      data: {
        googleCalendarConnected: false,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarId: null,
        googleCalendarEmail: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect Google Calendar:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google Calendar' },
      { status: 500 },
    );
  }
}
