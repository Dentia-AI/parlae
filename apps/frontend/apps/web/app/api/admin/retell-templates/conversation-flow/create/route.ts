import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getSessionUser } from '@kit/shared/auth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/retell-templates/conversation-flow/create
 *
 * Create a new conversation flow template.
 *
 * Modes:
 *   1. From built-in: { fromBuiltIn: true } — seeds from code templates
 *   2. From account: { fromAccount: true, sourceAccountId, name, displayName, version, ... }
 *   3. Direct: { name, displayName, version, globalPrompt, nodePrompts, nodeTools, edgeConfig, modelConfig }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();
    const session = await getSessionUser();
    const body = await request.json();

    if (body.fromBuiltIn) {
      const { seedDefaultFlowTemplate } = await import(
        '@kit/shared/retell/templates/conversation-flow/flow-template-seed'
      );
      const templateId = await seedDefaultFlowTemplate(prisma, session?.id);

      logger.info({ templateId }, '[Flow Templates] Seeded from built-in');
      return NextResponse.json({ success: true, templateId });
    }

    if (body.fromAccount && body.sourceAccountId) {
      const { fetchFlowConfigFromAccount } = await import(
        '../fetch-from-account/route'
      );
      const config = await fetchFlowConfigFromAccount(body.sourceAccountId);

      const name = body.name || `flow-from-account-${Date.now()}`;
      const displayName = body.displayName || 'Flow Template (from account)';
      const version = body.version || 'cf-v1.0';
      const isDefault = body.isDefault ?? false;

      if (isDefault) {
        await prisma.retellConversationFlowTemplate.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const template = await prisma.retellConversationFlowTemplate.create({
        data: {
          name,
          displayName,
          description: body.description || null,
          version,
          isDefault,
          globalPrompt: config.globalPrompt,
          nodePrompts: config.nodePrompts,
          nodeTools: config.nodeTools,
          edgeConfig: config.edgeConfig,
          modelConfig: config.modelConfig,
          createdBy: session?.id ?? 'system',
        },
      });

      logger.info(
        { templateId: template.id, sourceAccountId: body.sourceAccountId },
        '[Flow Templates] Created from account config',
      );

      return NextResponse.json({ success: true, template: { id: template.id, name: template.name } });
    }

    const { name, displayName, description, version, isDefault, globalPrompt, nodePrompts, nodeTools, edgeConfig, modelConfig } = body;

    if (!name || !displayName || !version || !globalPrompt) {
      return NextResponse.json(
        { error: 'Missing required fields: name, displayName, version, globalPrompt' },
        { status: 400 },
      );
    }

    if (isDefault) {
      await prisma.retellConversationFlowTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.retellConversationFlowTemplate.create({
      data: {
        name,
        displayName,
        description: description || null,
        version,
        isDefault: isDefault ?? false,
        globalPrompt,
        nodePrompts: nodePrompts || {},
        nodeTools: nodeTools || {},
        edgeConfig: edgeConfig || {},
        modelConfig: modelConfig || { model: 'gpt-4.1', type: 'cascading' },
        createdBy: session?.id ?? 'system',
      },
    });

    logger.info(
      { templateId: template.id, name: template.name },
      '[Flow Templates] Created new template',
    );

    return NextResponse.json({ success: true, template: { id: template.id, name: template.name } });
  } catch (error) {
    logger.error({ error }, '[Flow Templates] Create failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flow template' },
      { status: 500 },
    );
  }
}
