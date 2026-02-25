import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { fetchRetellConfigsFromAccount } from '../fetch-from-account/route';

/**
 * POST /api/admin/retell-templates/create
 *
 * Create a new Retell agent template.
 *
 * Two modes:
 *   1. From account: { sourceAccountId, name, displayName, version, ... }
 *      → Configs are fetched server-side from the deployed account's agents
 *   2. Direct: { llmConfigs, agentConfigs, swapConfig, name, displayName, version, ... }
 *      → Configs are provided directly (for programmatic use)
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();
    const session = await getSessionUser();

    const body = await request.json();
    const {
      name,
      displayName,
      description,
      version,
      isDefault,
      sourceAccountId,
      llmConfigs: directLlmConfigs,
      agentConfigs: directAgentConfigs,
      swapConfig: directSwapConfig,
    } = body;

    if (!name || !displayName || !version) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, displayName, version' },
        { status: 400 },
      );
    }

    let llmConfigs: any;
    let agentConfigs: any;
    let swapConfig: any;

    if (sourceAccountId) {
      logger.info(
        { sourceAccountId, templateName: name },
        '[Retell Templates] Fetching configs from account for new template',
      );
      const configs = await fetchRetellConfigsFromAccount(sourceAccountId);
      llmConfigs = configs.llmConfigs;
      agentConfigs = configs.agentConfigs;
      swapConfig = configs.swapConfig;
    } else if (directLlmConfigs && directAgentConfigs) {
      llmConfigs = directLlmConfigs;
      agentConfigs = directAgentConfigs;
      swapConfig = directSwapConfig || {};
    } else {
      return NextResponse.json(
        { success: false, error: 'Either sourceAccountId or llmConfigs+agentConfigs is required' },
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
        swapConfig: swapConfig || {},
        isDefault: isDefault ?? false,
        createdBy: session?.id ?? 'system',
      },
    });

    logger.info(
      { templateId: template.id, name: template.name },
      '[Retell Templates] Created new template',
    );

    return NextResponse.json({ success: true, template: { id: template.id, name: template.name } });
  } catch (error) {
    logger.error({ error }, '[Retell Templates] Create failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 },
    );
  }
}
