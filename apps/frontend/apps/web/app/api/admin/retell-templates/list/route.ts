import { NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

export async function GET() {
  try {
    await requireAdmin();

    const templates = await prisma.retellAgentTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        version: true,
        isDefault: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { displayName: 'asc' },
      ],
    });

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error('[retell-templates/list] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 },
    );
  }
}
