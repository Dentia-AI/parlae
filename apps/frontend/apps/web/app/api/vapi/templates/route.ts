import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/vapi/templates
 * 
 * List all available squad and assistant templates
 * 
 * Authentication: Required
 * 
 * Response:
 * {
 *   success: true,
 *   squads: [...],
 *   assistants: [...]
 * }
 */
export async function GET(request: Request) {
  const logger = await getLogger();

  try {
    // Authentication
    const session = await requireSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get active squad templates
    const squads = await prisma.vapiSquadTemplate.findMany({
      where: { status: 'active' },
      orderBy: [
        { isDefault: 'desc' },
        { displayName: 'asc' }
      ]
    });

    // Get active assistant templates
    const assistants = await prisma.vapiAssistantTemplate.findMany({
      where: { status: 'active' },
      orderBy: [
        { isDefault: 'desc' },
        { displayName: 'asc' }
      ]
    });

    return NextResponse.json({
      success: true,
      squads: squads || [],
      assistants: assistants || [],
    });

  } catch (error) {
    logger.error({ error }, '[Vapi Templates] Exception');
    return NextResponse.json(
      { success: false, message: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
