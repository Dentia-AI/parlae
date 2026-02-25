import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

export async function PATCH(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { id, ...updates } = body;

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

    const template = await prisma.retellAgentTemplate.update({
      where: { id },
      data: {
        ...(updates.displayName !== undefined && { displayName: updates.displayName }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.version !== undefined && { version: updates.version }),
        ...(updates.llmConfigs !== undefined && { llmConfigs: updates.llmConfigs }),
        ...(updates.agentConfigs !== undefined && { agentConfigs: updates.agentConfigs }),
        ...(updates.swapConfig !== undefined && { swapConfig: updates.swapConfig }),
        ...(updates.toolsConfig !== undefined && { toolsConfig: updates.toolsConfig }),
        ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      },
    });

    logger.info(
      { templateId: template.id, name: template.name },
      '[Retell Templates] Updated template',
    );

    return NextResponse.json({ success: true, template });
  } catch (error) {
    logger.error({ error }, '[Retell Templates] Update failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update template' },
      { status: 500 },
    );
  }
}
