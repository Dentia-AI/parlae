import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { fetchRetellConfigsFromAccount } from '../fetch-from-account/route';

/**
 * PATCH /api/admin/retell-templates/update
 *
 * Update an existing Retell agent template.
 *
 * Two modes:
 *   1. From account: { id, sourceAccountId, version? }
 *      → Replaces configs with fresh data from a deployed account
 *   2. Direct: { id, llmConfigs?, agentConfigs?, version?, ... }
 *      → Updates only the provided fields
 */
export async function PATCH(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { id, sourceAccountId, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Template ID is required' }, { status: 400 });
    }

    const existing = await prisma.retellAgentTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    if (updates.isDefault) {
      await prisma.retellAgentTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // If sourceAccountId is provided, fetch configs server-side
    let configUpdates: Record<string, any> = {};
    if (sourceAccountId) {
      logger.info(
        { sourceAccountId, templateId: id },
        '[Retell Templates] Fetching configs from account for template update',
      );
      const configs = await fetchRetellConfigsFromAccount(sourceAccountId);
      configUpdates = {
        llmConfigs: configs.llmConfigs,
        agentConfigs: configs.agentConfigs,
        swapConfig: configs.swapConfig,
      };
    }

    const template = await prisma.retellAgentTemplate.update({
      where: { id },
      data: {
        ...(updates.displayName !== undefined && { displayName: updates.displayName }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.version !== undefined && { version: updates.version }),
        ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
        // Direct config updates (overridden by sourceAccountId if provided)
        ...(updates.llmConfigs !== undefined && { llmConfigs: updates.llmConfigs }),
        ...(updates.agentConfigs !== undefined && { agentConfigs: updates.agentConfigs }),
        ...(updates.swapConfig !== undefined && { swapConfig: updates.swapConfig }),
        ...(updates.toolsConfig !== undefined && { toolsConfig: updates.toolsConfig }),
        // Server-side fetched configs take priority
        ...configUpdates,
      },
    });

    logger.info(
      { templateId: template.id, name: template.name },
      '[Retell Templates] Updated template',
    );

    return NextResponse.json({ success: true, template: { id: template.id, name: template.name } });
  } catch (error) {
    logger.error({ error }, '[Retell Templates] Update failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update template' },
      { status: 500 },
    );
  }
}
