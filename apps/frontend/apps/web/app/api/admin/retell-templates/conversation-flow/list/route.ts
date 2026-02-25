import { NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

/**
 * GET /api/admin/retell-templates/conversation-flow/list
 *
 * List all conversation flow templates with account counts.
 */
export async function GET() {
  try {
    await requireAdmin();

    const templates = await prisma.retellConversationFlowTemplate.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: { accounts: true },
        },
      },
    });

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list flow templates' },
      { status: 500 },
    );
  }
}
