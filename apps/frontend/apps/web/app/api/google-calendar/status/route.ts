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
