import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';
import {
  deployRetellConversationFlow,
  teardownRetellConversationFlow,
} from '@kit/shared/retell/templates/conversation-flow/flow-deploy-utils';

/**
 * POST /api/admin/retell-deploy-flow
 *
 * Deploy a Retell conversation flow agent for an account.
 * This is a PARALLEL experiment -- it does NOT touch the existing squad deployment.
 *
 * Body:
 * {
 *   accountId: string
 *   voiceId?: string        // default: retell-Chloe
 *   teardownOnly?: boolean  // if true, only tears down existing flow agent
 * }
 *
 * The conversation flow agent ID and flow ID are stored in the account's
 * phoneIntegrationSettings under the `retellConversationFlow` key.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'POST /api/admin/retell-deploy-flow';

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, voiceId, teardownOnly = false } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json(
        { error: 'RETELL_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        brandingBusinessName: true,
        brandingContactPhone: true,
        phoneIntegrationSettings: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const settings = (account.phoneIntegrationSettings as Record<string, any>) || {};
    const existingFlow = settings.retellConversationFlow as {
      agentId: string;
      conversationFlowId: string;
      version: string;
    } | undefined;

    // Teardown existing flow agent if present
    if (existingFlow?.agentId && existingFlow?.conversationFlowId) {
      logger.info(
        { funcName, accountId, agentId: existingFlow.agentId },
        '[Flow Deploy] Tearing down existing conversation flow',
      );
      try {
        await teardownRetellConversationFlow(
          retell,
          existingFlow.agentId,
          existingFlow.conversationFlowId,
        );
      } catch (err) {
        logger.warn(
          { funcName, error: err instanceof Error ? err.message : err },
          '[Flow Deploy] Non-fatal: teardown failed, continuing',
        );
      }

      // Clear the stored flow data
      await prisma.account.update({
        where: { id: accountId },
        data: {
          phoneIntegrationSettings: {
            ...settings,
            retellConversationFlow: null,
          },
        },
      });
    }

    if (teardownOnly) {
      return NextResponse.json({ success: true, teardown: true });
    }

    // Deploy the conversation flow
    const clinicName = account.brandingBusinessName || account.name;
    const clinicPhone = account.brandingContactPhone || undefined;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';
    const webhookSecret =
      process.env.RETELL_WEBHOOK_SECRET ||
      process.env.VAPI_WEBHOOK_SECRET ||
      process.env.VAPI_SERVER_SECRET ||
      '';

    logger.info({ funcName, accountId, clinicName }, '[Flow Deploy] Deploying conversation flow');

    const knowledgeBaseIds = settings.retellKnowledgeBaseId
      ? [settings.retellKnowledgeBaseId as string]
      : undefined;

    const result = await deployRetellConversationFlow(retell, {
      clinicName,
      clinicPhone,
      webhookUrl: backendUrl,
      webhookSecret,
      accountId,
      voiceId: voiceId || 'retell-Chloe',
      knowledgeBaseIds,
    });

    // Persist the flow agent IDs in phoneIntegrationSettings
    await prisma.account.update({
      where: { id: accountId },
      data: {
        phoneIntegrationSettings: {
          ...settings,
          retellConversationFlow: {
            agentId: result.agentId,
            conversationFlowId: result.conversationFlowId,
            version: result.version,
            deployedAt: new Date().toISOString(),
          },
        },
      },
    });

    logger.info(
      { funcName, accountId, agentId: result.agentId, flowId: result.conversationFlowId },
      '[Flow Deploy] Complete',
    );

    return NextResponse.json({
      success: true,
      agentId: result.agentId,
      conversationFlowId: result.conversationFlowId,
      version: result.version,
    });
  } catch (error) {
    logger.error(
      { funcName, error: error instanceof Error ? error.message : error },
      '[Flow Deploy] Failed',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deployment failed' },
      { status: 500 },
    );
  }
}
