import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * PATCH /api/admin/retell-templates/conversation-flow/update
 *
 * Update an existing conversation flow template.
 * Body: { id, ...fields }
 */
export async function PATCH(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    if (updates.isDefault) {
      await prisma.retellConversationFlowTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const template = await prisma.retellConversationFlowTemplate.update({
      where: { id },
      data: updates,
    });

    logger.info({ templateId: id }, '[Flow Templates] Updated template');

    return NextResponse.json({ success: true, template });
  } catch (error) {
    logger.error({ error }, '[Flow Templates] Update failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update flow template' },
      { status: 500 },
    );
  }
}
