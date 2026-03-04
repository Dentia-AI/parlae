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
 * Body (mode 1 - include): { templateId: string, accountIds: string[] }
 * Body (mode 2 - deploy all): { templateId: string, deployAll: true, excludeAccountIds?: string[], filters?: { search?, templateId?, version? } }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { templateId, deployAll, excludeAccountIds, filters } = body;
    let { accountIds } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 },
      );
    }

    if (deployAll) {
      const { buildAccountSearchWhere, excludeFromIds } = await import('~/api/admin/_lib/admin-pagination');
      const accountWhere: Record<string, unknown> = {};
      if (filters?.templateId) accountWhere.retellFlowTemplateId = filters.templateId;
      if (filters?.version) accountWhere.retellFlowTemplate = { version: filters.version };
      const where = buildAccountSearchWhere(filters?.search || '', accountWhere);

      const allMatching = await prisma.account.findMany({
        where: where as any,
        select: { id: true },
      });
      accountIds = excludeFromIds(
        allMatching.map((a) => a.id),
        excludeAccountIds || [],
      );
    }

    if (!accountIds?.length) {
      return NextResponse.json(
        { error: 'No accounts to deploy to' },
        { status: 400 },
      );
    }

    const template = await prisma.retellConversationFlowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Pre-filter accounts by payment status — only deploy to accounts with verified payment
    const allAccounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, paymentMethodVerified: true },
    });

    const paymentVerifiedIds = allAccounts
      .filter((a) => a.paymentMethodVerified)
      .map((a) => a.id);

    const skippedNoPayment = allAccounts
      .filter((a) => !a.paymentMethodVerified)
      .map((a) => a.id);

    if (skippedNoPayment.length > 0) {
      logger.info(
        { templateId, skippedCount: skippedNoPayment.length, skippedAccountIds: skippedNoPayment },
        '[Flow Templates] Skipped accounts without verified payment method',
      );
    }

    // Assign template only to accounts with verified payment
    const result = await prisma.account.updateMany({
      where: { id: { in: paymentVerifiedIds } },
      data: { retellFlowTemplateId: templateId },
    });

    logger.info(
      { templateId, accountCount: result.count, templateName: template.name },
      '[Flow Templates] Bulk assigned flow template to accounts',
    );

    // Trigger redeploy for each account with verified payment
    const deployResults: Array<{ accountId: string; success: boolean; skipped?: boolean; error?: string }> = [];

    for (const skippedId of skippedNoPayment) {
      deployResults.push({
        accountId: skippedId,
        success: false,
        skipped: true,
        error: 'Payment method not verified — skipped',
      });
    }

    for (const accountId of paymentVerifiedIds) {
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

        // Update phone number record in DB
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
        } catch (phoneDbErr) {
          logger.warn(
            { accountId, error: phoneDbErr instanceof Error ? phoneDbErr.message : phoneDbErr },
            '[Flow Templates] Failed to update phone DB record',
          );
        }

        // Re-link phone number in Retell to the new agent
        if (settings.phoneNumber) {
          const e164 = settings.phoneNumber.startsWith('+') ? settings.phoneNumber : `+${settings.phoneNumber}`;
          try {
            await retell.updatePhoneNumber(e164, {
              inbound_agent_id: flowResult.agentId,
              nickname: `${businessName} - Conversation Flow (${flowResult.version})`,
            });
          } catch (updateErr) {
            logger.warn(
              { accountId, phone: e164, error: updateErr instanceof Error ? updateErr.message : updateErr },
              '[Flow Templates] updatePhoneNumber failed, attempting re-import',
            );
            try {
              const retellPhone = await prisma.retellPhoneNumber.findFirst({
                where: { accountId, isActive: true },
                select: { retellPhoneId: true },
              });
              const terminationUri = settings.sipTerminationUri || settings.terminationUri;
              if (terminationUri) {
                await retell.importPhoneNumber({
                  phoneNumber: e164,
                  terminationUri,
                  inboundAgentId: flowResult.agentId,
                  nickname: `${businessName} - Conversation Flow (${flowResult.version})`,
                });
              } else {
                logger.error(
                  { accountId, phone: e164 },
                  '[Flow Templates] No terminationUri available for re-import; phone not linked',
                );
              }
            } catch (importErr) {
              logger.error(
                { accountId, phone: e164, error: importErr instanceof Error ? importErr.message : importErr },
                '[Flow Templates] Phone re-import also failed; phone not linked to new agent',
              );
            }
          }
        }

        deployResults.push({ accountId, success: true });
      } catch (err: any) {
        logger.error({ error: err?.message, accountId }, '[Flow Templates] Deploy failed for account');
        deployResults.push({ accountId, success: false, error: err?.message });
      }
    }

    const skippedCount = deployResults.filter((r) => r.skipped).length;

    return NextResponse.json({
      success: true,
      assigned: result.count,
      skippedNoPayment: skippedCount,
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
