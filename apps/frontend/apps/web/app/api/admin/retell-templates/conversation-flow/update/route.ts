import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * PATCH /api/admin/retell-templates/conversation-flow/update
 *
 * Update an existing conversation flow template.
 *
 * Modes:
 *   1. From account: { id, sourceAccountId, version? } — replaces prompts/tools/edges from live account
 *   2. Direct: { id, ...fields } — updates provided fields
 */
export async function PATCH(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();
    const body = await request.json();
    const { id, sourceAccountId, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    if (sourceAccountId) {
      const { fetchFlowConfigFromAccount } = await import(
        '../fetch-from-account/route'
      );
      const config = await fetchFlowConfigFromAccount(sourceAccountId);

      const data: Record<string, any> = {
        globalPrompt: config.globalPrompt,
        nodePrompts: config.nodePrompts,
        nodeTools: config.nodeTools,
        edgeConfig: config.edgeConfig,
        modelConfig: config.modelConfig,
      };

      if (updates.version) data.version = updates.version;
      if (updates.isDefault !== undefined) data.isDefault = updates.isDefault;

      if (data.isDefault) {
        await prisma.retellConversationFlowTemplate.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const template = await prisma.retellConversationFlowTemplate.update({
        where: { id },
        data,
      });

      logger.info(
        { templateId: id, sourceAccountId },
        '[Flow Templates] Updated template from account config',
      );

      return NextResponse.json({ success: true, template });
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
