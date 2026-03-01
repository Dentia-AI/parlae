import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@kit/prisma';
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
 * Saves the KB config to the account, then attaches the existing Retell KB
 * to all deployed conversation flows (inbound + outbound) in the background.
 *
 * Body: { knowledgeBaseConfig, websiteUrl? }
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

    const allFileIds = Object.values(knowledgeBaseConfig).flat().filter(Boolean);
    const realFileIds = allFileIds.filter(
      (id) => !id.startsWith('retell-scraped-'),
    );
    const provider = await getAccountProvider(account.id);

    logger.info(
      { accountId: account.id, totalFiles: allFileIds.length, realFiles: realFileIds.length, categories: Object.keys(knowledgeBaseConfig).length, provider },
      '[KB API] Updating knowledge base',
    );

    const queryToolId = settings.queryToolId;
    const queryToolName = settings.queryToolName;
    const retellKnowledgeBaseId = settings.retellKnowledgeBaseId;

    // Save to DB immediately — heavy Retell sync runs in background
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
      '[KB API] Knowledge base config saved, starting background sync',
    );

    // Return immediately — heavy work happens after response
    const response = NextResponse.json({
      success: true,
      provider,
      queryToolId,
      queryToolName,
      retellKnowledgeBaseId,
      totalFiles: allFileIds.length,
    });

    // Attach KB to conversation flows in background (after response)
    after(async () => {
      const bgLogger = await getLogger();

      try {
        if (provider === 'RETELL' && retellKnowledgeBaseId) {
          const { createRetellService } = await import(
            '@kit/shared/retell/retell.service'
          );
          const retell = createRetellService();
          const kbIds = [retellKnowledgeBaseId as string];
          const flowsUpdated: string[] = [];

          const inboundFlowId =
            (updatedSettings.retellConversationFlow as any)
              ?.conversationFlowId ||
            (updatedSettings.conversationFlowId as string | undefined);
          if (inboundFlowId) {
            await retell.updateConversationFlow(inboundFlowId, {
              knowledge_base_ids: kbIds,
            });
            flowsUpdated.push(`inbound:${inboundFlowId}`);
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
              bgLogger.warn(
                { error: agentErr?.message, agentId },
                '[KB API] [bg] Failed to update outbound flow (non-fatal)',
              );
            }
          }

          if (flowsUpdated.length > 0) {
            bgLogger.info(
              { accountId: account.id, flowsUpdated, kbId: retellKnowledgeBaseId },
              '[KB API] [bg] Attached KB to conversation flows',
            );
          }
        }
      } catch (bgErr: any) {
        bgLogger.error(
          { error: bgErr?.message, accountId: account.id },
          '[KB API] [bg] Background sync failed',
        );
      }
    });

    return response;
  } catch (error: any) {
    logger.error({ error: error?.message }, '[KB API] Failed to update knowledge base');
    return NextResponse.json(
      { error: error?.message || 'Failed to update knowledge base' },
      { status: 500 },
    );
  }
}
