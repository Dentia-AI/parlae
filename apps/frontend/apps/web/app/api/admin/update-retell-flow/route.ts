import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';
import { buildDentalClinicFlow } from '@kit/shared/retell/templates/conversation-flow/dental-clinic.flow-template';

/**
 * POST /api/admin/update-retell-flow
 *
 * Rebuild and PATCH the existing conversation flow for an account.
 * This re-generates the flow definition from the current template
 * (picking up normalizeToE164, prompt changes, etc.) and patches
 * the Retell conversation flow in-place without creating a new agent.
 *
 * Body: { accountId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'POST /api/admin/update-retell-flow';

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId } = body;

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

    if (!existingFlow?.conversationFlowId) {
      return NextResponse.json(
        { error: 'No conversation flow deployed for this account' },
        { status: 400 },
      );
    }

    const clinicName = account.brandingBusinessName || account.name;
    const clinicPhone = account.brandingContactPhone || undefined;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';
    const webhookSecret =
      process.env.RETELL_WEBHOOK_SECRET ||
      process.env.VAPI_WEBHOOK_SECRET ||
      process.env.VAPI_SERVER_SECRET ||
      '';

    const retellKbId = settings.retellKnowledgeBaseId as string | undefined;

    if (!retellKbId) {
      logger.warn(
        { funcName, accountId },
        '[Flow Update] No retellKnowledgeBaseId found — flow will be rebuilt without KB',
      );
    }

    logger.info(
      { funcName, accountId, flowId: existingFlow.conversationFlowId, clinicName, hasKb: !!retellKbId },
      '[Flow Update] Rebuilding flow definition from template',
    );

    const flowConfig = buildDentalClinicFlow({
      clinicName,
      clinicPhone,
      webhookUrl: backendUrl,
      webhookSecret,
      accountId,
      knowledgeBaseIds: retellKbId ? [retellKbId] : undefined,
    });

    const updated = await retell.updateConversationFlow(
      existingFlow.conversationFlowId,
      flowConfig,
    );

    if (!updated) {
      throw new Error('Retell API returned null for conversation flow update');
    }

    logger.info(
      { funcName, accountId, flowId: existingFlow.conversationFlowId },
      '[Flow Update] Successfully patched conversation flow',
    );

    return NextResponse.json({
      success: true,
      conversationFlowId: existingFlow.conversationFlowId,
      agentId: existingFlow.agentId,
      message: 'Conversation flow updated in-place with latest template',
    });
  } catch (error) {
    logger.error(
      { funcName, error: error instanceof Error ? error.message : error },
      '[Flow Update] Failed',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 },
    );
  }
}
