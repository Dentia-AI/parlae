import { NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';

/**
 * GET /api/admin/accounts
 * List all accounts (for admin dropdowns)
 */
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error('[Admin Accounts] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list accounts' },
      { status: 500 },
    );
  }
}
