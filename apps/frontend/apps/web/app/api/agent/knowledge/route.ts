import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';
import { requireSession } from '~/lib/auth/get-session';
import { getLogger } from '@kit/shared/logger';
import { getAccountProvider } from '@kit/shared/voice-provider';
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
        paymentMethodVerified: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const knowledgeBaseConfig: KnowledgeBaseConfig = settings.knowledgeBaseConfig || {};
    const knowledgeBaseFileIds: string[] = settings.knowledgeBaseFileIds || [];
    const queryToolId: string | undefined = settings.queryToolId;
    const websiteUrl: string | undefined =
      settings.websiteScrapedUrl || settings.websiteUrl;
    const websiteScrapedAt: string | undefined = settings.websiteScrapedAt;

    return NextResponse.json({
      accountId: account.id,
      businessName: account.brandingBusinessName || account.name,
      knowledgeBaseConfig,
      knowledgeBaseFileIds,
      queryToolId,
      websiteUrl,
      websiteScrapedAt,
      paymentMethodVerified: account.paymentMethodVerified,
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
    const websiteUrl: string | undefined = body.websiteUrl;

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

    const allFileIds = Object.values(knowledgeBaseConfig).flat().filter(Boolean);
    const provider = await getAccountProvider(account.id);

    logger.info(
      { accountId: account.id, totalFiles: allFileIds.length, categories: Object.keys(knowledgeBaseConfig).length, provider },
      '[KB API] Updating knowledge base',
    );

    let queryToolId = settings.queryToolId;
    let queryToolName = settings.queryToolName;
    let retellKnowledgeBaseId = settings.retellKnowledgeBaseId;

    if (provider === 'RETELL') {
      // PRIMARY: Sync to Retell KB directly
      if (allFileIds.length > 0) {
        try {
          const { syncVapiKBToRetell } = await import(
            '@kit/shared/retell/retell-kb.service'
          );

          const newKbId = await syncVapiKBToRetell(
            account.id,
            allFileIds,
            businessName,
            retellKnowledgeBaseId || undefined,
          );

          if (newKbId) {
            retellKnowledgeBaseId = newKbId;
            logger.info(
              { accountId: account.id, retellKnowledgeBaseId: newKbId, fileCount: allFileIds.length },
              '[KB API] Retell knowledge base updated',
            );
          }
        } catch (retellErr: any) {
          logger.error(
            { error: retellErr?.message, accountId: account.id },
            '[KB API] Retell KB sync failed (non-fatal)',
          );
        }
      }
    } else {
      // FALLBACK: Update Vapi query tool
      const vapiService = createVapiService();

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
            '[KB API] Vapi clinic query tool updated',
          );
        }
      }
    }

    // Save to DB
    const updatedSettings: Record<string, unknown> = {
      ...settings,
      knowledgeBaseConfig,
      knowledgeBaseFileIds: allFileIds,
      queryToolId,
      queryToolName,
      retellKnowledgeBaseId,
      knowledgeBaseUpdatedAt: new Date().toISOString(),
    };

    if (websiteUrl !== undefined) {
      updatedSettings.websiteUrl = websiteUrl;
      updatedSettings.websiteScrapedUrl = websiteUrl || settings.websiteScrapedUrl;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: updatedSettings,
      },
    });

    logger.info(
      { accountId: account.id, queryToolId, totalFiles: allFileIds.length, provider },
      '[KB API] Knowledge base updated successfully',
    );

    // Attach KB to all deployed agents (inbound CF + outbound)
    if (provider === 'RETELL' && retellKnowledgeBaseId) {
      try {
        const { createRetellService } = await import(
          '@kit/shared/retell/retell.service'
        );
        const retell = createRetellService();
        const kbIds = [retellKnowledgeBaseId as string];
        const flowsUpdated: string[] = [];

        const cfData = updatedSettings.retellConversationFlow as
          | { conversationFlowId?: string }
          | undefined;
        if (cfData?.conversationFlowId) {
          await retell.updateConversationFlow(cfData.conversationFlowId, {
            knowledge_base_ids: kbIds,
          });
          flowsUpdated.push(`inbound:${cfData.conversationFlowId}`);
        }

        const outboundSettings = await prisma.outboundSettings.findUnique({
          where: { accountId: account.id },
          select: {
            patientCareRetellAgentId: true,
            financialRetellAgentId: true,
          },
        });

        const outboundAgentIds = [
          outboundSettings?.patientCareRetellAgentId,
          outboundSettings?.financialRetellAgentId,
        ].filter(Boolean) as string[];

        for (const agentId of outboundAgentIds) {
          try {
            const agent = await retell.getAgent(agentId);
            const flowId =
              (agent?.response_engine as any)?.conversation_flow_id;
            if (flowId) {
              await retell.updateConversationFlow(flowId, {
                knowledge_base_ids: kbIds,
              });
              flowsUpdated.push(`outbound:${flowId}`);
            }
          } catch (agentErr: any) {
            logger.warn(
              { error: agentErr?.message, agentId },
              '[KB API] Failed to update outbound agent flow (non-fatal)',
            );
          }
        }

        if (flowsUpdated.length > 0) {
          logger.info(
            { accountId: account.id, flowsUpdated, kbId: retellKnowledgeBaseId },
            '[KB API] Attached KB to conversation flows',
          );
        }
      } catch (attachErr: any) {
        logger.error(
          { error: attachErr?.message, accountId: account.id },
          '[KB API] Failed to attach KB to agents (non-fatal)',
        );
      }
    }

    return NextResponse.json({
      success: true,
      provider,
      queryToolId,
      queryToolName,
      retellKnowledgeBaseId,
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
