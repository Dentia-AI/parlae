import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';

export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch all active templates
    const templates = await prisma.agentTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        version: true,
        category: true,
        isDefault: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { category: 'asc' },
        { displayName: 'asc' },
      ],
    });

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('[list-templates] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch templates',
      },
      { status: 500 }
    );
  }
}
