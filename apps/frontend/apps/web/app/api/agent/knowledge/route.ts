import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';
import { requireSession } from '~/lib/auth/get-session';
import { getLogger } from '@kit/shared/logger';
import type { KnowledgeBaseConfig } from '@kit/shared/vapi/templates';

/**
 * GET /api/agent/knowledge
 *
 * Returns the current knowledge base configuration for the logged-in user's
 * account, including files organized by category and the Vapi query tool ID.
 */
export async function GET() {
  const logger = await getLogger();

  try {
    const session = await requireSession();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: {
        id: true,
        phoneIntegrationSettings: true,
        brandingBusinessName: true,
        name: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const knowledgeBaseConfig: KnowledgeBaseConfig = settings.knowledgeBaseConfig || {};
    const knowledgeBaseFileIds: string[] = settings.knowledgeBaseFileIds || [];
    const queryToolId: string | undefined = settings.queryToolId;

    return NextResponse.json({
      accountId: account.id,
      businessName: account.brandingBusinessName || account.name,
      knowledgeBaseConfig,
      knowledgeBaseFileIds,
      queryToolId,
      totalFiles: Object.values(knowledgeBaseConfig).flat().filter(Boolean).length ||
        knowledgeBaseFileIds.length,
    });
  } catch (error: any) {
    logger.error({ error: error?.message }, '[KB API] Failed to get knowledge base');
    return NextResponse.json(
      { error: error?.message || 'Failed to get knowledge base' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/agent/knowledge
 *
 * Update the knowledge base configuration. This:
 * 1. Saves the new file-by-category config to the account's phoneIntegrationSettings
 * 2. Merges all file IDs and updates (or creates) the single Vapi query tool
 *
 * No squad recreation required — just a tool PATCH.
 *
 * Body:
 * {
 *   knowledgeBaseConfig: { [categoryId: string]: string[] }
 * }
 */
export async function PUT(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await requireSession();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const knowledgeBaseConfig: KnowledgeBaseConfig = body.knowledgeBaseConfig;

    if (!knowledgeBaseConfig || typeof knowledgeBaseConfig !== 'object') {
      return NextResponse.json(
        { error: 'knowledgeBaseConfig is required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: {
        id: true,
        phoneIntegrationSettings: true,
        brandingBusinessName: true,
        name: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const businessName = account.brandingBusinessName || account.name || 'Clinic';

    // Merge all file IDs across categories
    const allFileIds = Object.values(knowledgeBaseConfig).flat().filter(Boolean);

    logger.info(
      { accountId: account.id, totalFiles: allFileIds.length, categories: Object.keys(knowledgeBaseConfig).length },
      '[KB API] Updating knowledge base',
    );

    // Update or create the Vapi query tool
    const vapiService = createVapiService();
    let queryToolId = settings.queryToolId;
    let queryToolName = settings.queryToolName;

    if (allFileIds.length > 0) {
      const result = await vapiService.ensureClinicQueryTool(
        account.id,
        allFileIds,
        settings.templateVersion || 'v2.0',
        businessName,
      );

      if (result) {
        queryToolId = result.toolId;
        queryToolName = result.toolName;
        logger.info(
          { queryToolId, queryToolName, fileCount: allFileIds.length },
          '[KB API] Clinic query tool updated',
        );
      }
    }

    // Save to DB
    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...settings,
          knowledgeBaseConfig,
          knowledgeBaseFileIds: allFileIds,
          queryToolId,
          queryToolName,
          knowledgeBaseUpdatedAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      { accountId: account.id, queryToolId, totalFiles: allFileIds.length },
      '[KB API] Knowledge base updated successfully',
    );

    return NextResponse.json({
      success: true,
      queryToolId,
      queryToolName,
      totalFiles: allFileIds.length,
    });
  } catch (error: any) {
    logger.error({ error: error?.message }, '[KB API] Failed to update knowledge base');
    return NextResponse.json(
      { error: error?.message || 'Failed to update knowledge base' },
      { status: 500 },
    );
  }
}
