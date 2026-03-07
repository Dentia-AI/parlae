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
      select: {
        googleCalendarConnected: true,
        googleCalendarEmail: true,
      },
    });

    if (!account) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: account.googleCalendarConnected || false,
      email: account.googleCalendarEmail || undefined,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
