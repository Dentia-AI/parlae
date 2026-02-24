import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, displayName, description, version, llmConfigs, agentConfigs, swapConfig, toolsConfig, isDefault } = body;

    if (!name || !displayName || !version || !llmConfigs || !agentConfigs || !swapConfig) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, displayName, version, llmConfigs, agentConfigs, swapConfig' },
        { status: 400 },
      );
    }

    if (isDefault) {
      await prisma.retellAgentTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.retellAgentTemplate.create({
      data: {
        name,
        displayName,
        description: description || null,
        version,
        llmConfigs,
        agentConfigs,
        swapConfig,
        toolsConfig: toolsConfig || null,
        isDefault: isDefault ?? false,
        createdBy: session.id,
      },
    });

    logger.info(
      { templateId: template.id, name: template.name },
      '[Retell Templates] Created new template',
    );

    return NextResponse.json({ success: true, template });
  } catch (error) {
    logger.error({ error }, '[Retell Templates] Create failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 },
    );
  }
}
