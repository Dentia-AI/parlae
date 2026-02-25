import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/retell-templates/conversation-flow/bulk-deploy
 *
 * Deploy a conversation flow template to selected accounts.
 * Assigns the template and triggers a redeploy of the conversation flow agent.
 *
 * Body: { templateId: string, accountIds: string[] }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const { templateId, accountIds } = await request.json();

    if (!templateId || !accountIds?.length) {
      return NextResponse.json(
        { error: 'templateId and accountIds are required' },
        { status: 400 },
      );
    }

    const template = await prisma.retellConversationFlowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Assign template to accounts
    const result = await prisma.account.updateMany({
      where: { id: { in: accountIds } },
      data: { retellFlowTemplateId: templateId },
    });

    logger.info(
      { templateId, accountCount: result.count, templateName: template.name },
      '[Flow Templates] Bulk assigned flow template to accounts',
    );

    // Trigger redeploy for each account
    const deployResults: Array<{ accountId: string; success: boolean; error?: string }> = [];

    for (const accountId of accountIds) {
      try {
        const { createRetellService } = await import('@kit/shared/retell/retell.service');
        const retell = createRetellService();

        if (!retell.isEnabled()) {
          deployResults.push({ accountId, success: false, error: 'Retell not enabled' });
          continue;
        }

        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: {
            brandingBusinessName: true,
            name: true,
            phoneIntegrationSettings: true,
            brandingContactPhone: true,
          },
        });

        if (!account) {
          deployResults.push({ accountId, success: false, error: 'Account not found' });
          continue;
        }

        const settings = (account.phoneIntegrationSettings as any) ?? {};
        const businessName = account.brandingBusinessName || account.name || 'Clinic';

        // Teardown existing flow agent if present
        const {
          deployRetellConversationFlow,
          teardownRetellConversationFlow,
        } = await import(
          '@kit/shared/retell/templates/conversation-flow/flow-deploy-utils'
        );

        if (settings.retellReceptionistAgentId && settings.conversationFlowId) {
          try {
            await teardownRetellConversationFlow(
              retell,
              settings.retellReceptionistAgentId,
              settings.conversationFlowId,
            );
          } catch {
            // Best effort teardown
          }
        }

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';
        const clinicPhone = settings.staffDirectNumber || settings.clinicNumber || account.brandingContactPhone || undefined;

        const flowResult = await deployRetellConversationFlow(retell, {
          clinicName: businessName,
          clinicPhone,
          webhookUrl: backendUrl,
          webhookSecret: process.env.RETELL_WEBHOOK_SECRET || '',
          accountId,
          voiceId: settings.voiceConfig?.voiceId || 'retell-Chloe',
          knowledgeBaseIds: settings.retellKnowledgeBaseId ? [settings.retellKnowledgeBaseId] : undefined,
        });

        // Update account settings
        await prisma.account.update({
          where: { id: accountId },
          data: {
            phoneIntegrationSettings: {
              ...settings,
              retellReceptionistAgentId: flowResult.agentId,
              conversationFlowId: flowResult.conversationFlowId,
              retellVersion: flowResult.version,
              deployType: 'conversation_flow',
              deployedAt: new Date().toISOString(),
            },
          },
        });

        // Update phone number record
        try {
          if (settings.phoneNumber) {
            await prisma.retellPhoneNumber.updateMany({
              where: { accountId, isActive: true },
              data: {
                retellAgentId: flowResult.agentId,
                retellAgentIds: { conversationFlow: { agentId: flowResult.agentId, flowId: flowResult.conversationFlowId } } as any,
              },
            });
          }
        } catch {
          // Best effort
        }

        // Re-import phone to Retell with new agent
        if (settings.phoneNumber) {
          try {
            const e164 = settings.phoneNumber.startsWith('+') ? settings.phoneNumber : `+${settings.phoneNumber}`;
            await retell.importPhoneNumber({
              phoneNumber: e164,
              inboundAgentId: flowResult.agentId,
              nickname: `${businessName} - Conversation Flow`,
            });
          } catch {
            // Phone may already be imported
          }
        }

        deployResults.push({ accountId, success: true });
      } catch (err: any) {
        logger.error({ error: err?.message, accountId }, '[Flow Templates] Deploy failed for account');
        deployResults.push({ accountId, success: false, error: err?.message });
      }
    }

    return NextResponse.json({
      success: true,
      assigned: result.count,
      deployResults,
    });
  } catch (error) {
    logger.error({ error }, '[Flow Templates] Bulk deploy failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk deploy failed' },
      { status: 500 },
    );
  }
}
