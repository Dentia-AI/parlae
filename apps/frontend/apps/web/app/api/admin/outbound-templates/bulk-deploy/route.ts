import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import {
  createRetellService,
  type RetellAgentConfig,
} from '@kit/shared/retell/retell.service';
import {
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_POST_CALL_ANALYSIS,
  ALLOWED_OUTBOUND_COUNTRIES,
} from '@kit/shared/retell/templates/dental-clinic.retell-template';
import { createTwilioService } from '@kit/shared/twilio/twilio.service';

function resolveVoiceModel(voiceId: string): string | undefined {
  const prefix = voiceId.split('-')[0]?.toLowerCase();
  switch (prefix) {
    case '11labs':
      return 'eleven_turbo_v2_5';
    case 'cartesia':
      return 'sonic-3';
    case 'minimax':
      return 'speech-02-turbo';
    default:
      return undefined;
  }
}

/**
 * POST /api/admin/outbound-templates/bulk-deploy
 *
 * Deploy an outbound agent template to selected accounts.
 * Creates per-account Retell agents from the template's flow config.
 * Voice, knowledge base, and phone number are mirrored from the
 * account's inbound agent configuration.
 *
 * Body (mode 1 - include): { templateId: string, accountIds: string[] }
 * Body (mode 2 - deploy all): { templateId: string, deployAll: true, excludeAccountIds?: string[], filters?: { search?, version? } }
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
      const accountWhere: Record<string, unknown> = { isPersonalAccount: true };
      const where = buildAccountSearchWhere(filters?.search || '', accountWhere);

      // Filter by version via outboundSettings if specified
      let matchedIds: string[] | null = null;
      if (filters?.version) {
        const settingsWithVersion = await prisma.outboundSettings.findMany({
          where: { outboundTemplateVersion: filters.version },
          select: { accountId: true },
        });
        matchedIds = settingsWithVersion.map((s) => s.accountId);
        (where as any).id = { in: matchedIds };
      }

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

    const template = await prisma.outboundAgentTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json({ error: 'Retell service is not enabled' }, { status: 500 });
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

    const agentIdField =
      template.agentGroup === 'PATIENT_CARE'
        ? 'patientCareRetellAgentId'
        : 'financialRetellAgentId';

    const enabledField =
      template.agentGroup === 'PATIENT_CARE'
        ? 'patientCareEnabled'
        : 'financialEnabled';

    const groupLabel =
      template.agentGroup === 'PATIENT_CARE' ? 'Patient Care' : 'Financial';

    const results: Array<{ accountId: string; success: boolean; skipped?: boolean; agentId?: string; error?: string }> = [];

    for (const accountId of accountIds) {
      try {
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: {
            name: true,
            brandingBusinessName: true,
            brandingTimezone: true,
            phoneIntegrationSettings: true,
            paymentMethodVerified: true,
          },
        });

        if (!account) {
          results.push({ accountId, success: false, error: 'Account not found' });
          continue;
        }

        if (!account.paymentMethodVerified) {
          logger.info(
            { accountId },
            '[Outbound] Skipped account without verified payment method',
          );
          results.push({
            accountId,
            success: false,
            skipped: true,
            error: 'Payment method not verified — skipped',
          });
          continue;
        }

        const clinicName = account.brandingBusinessName || account.name || 'Dental Clinic';

        const integrationSettings =
          (account.phoneIntegrationSettings as any) ?? {};
        const retellKbId = integrationSettings.retellKnowledgeBaseId as
          | string
          | undefined;

        // Mirror voice from inbound agent config; fall back to default
        const voiceId: string =
          integrationSettings.voiceConfig?.voiceId || 'retell-Chloe';
        const voiceModel = resolveVoiceModel(voiceId);

        const webhookSecret = process.env.RETELL_WEBHOOK_SECRET || '';

        // Hydrate tool URL placeholders in the flow config
        let flowConfigStr = JSON.stringify(template.flowConfig);
        flowConfigStr = flowConfigStr
          .replace(/\{\{webhookUrl\}\}/g, backendUrl)
          .replace(/\{\{secret\}\}/g, webhookSecret)
          .replace(/\{\{accountId\}\}/g, accountId);
        const flowConfig = JSON.parse(flowConfigStr) as Record<string, unknown>;

        if (retellKbId) {
          flowConfig.knowledge_base_ids = [retellKbId];
        }
        const flow = await retell.createConversationFlow(flowConfig as any);
        if (!flow) {
          results.push({ accountId, success: false, error: 'Flow creation failed' });
          continue;
        }

        const agentName = `${clinicName} - Outbound ${groupLabel} (${template.version})`;

        const agentConfig: RetellAgentConfig = {
          agent_name: agentName,
          response_engine: {
            type: 'conversation-flow',
            conversation_flow_id: flow.conversation_flow_id,
          },
          voice_id: voiceId,
          ...(voiceModel ? { voice_model: voiceModel } : {}),
          ...SHARED_RETELL_AGENT_CONFIG,
          webhook_url: backendUrl ? `${backendUrl}/retell/webhook` : undefined,
          webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
          post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
          boosted_keywords: [clinicName, 'appointment', 'dentist', 'dental'],
          metadata: {
            accountId,
            agentGroup: template.agentGroup,
            templateId: template.id,
            templateVersion: template.version,
            deployType: 'outbound_conversation_flow',
            knowledgeBaseIds: retellKbId || '',
          },
        };

        const agent = await retell.createAgent(agentConfig as any);
        if (!agent) {
          try { await retell.deleteConversationFlow(flow.conversation_flow_id); } catch {}
          results.push({ accountId, success: false, error: 'Agent creation failed' });
          continue;
        }

        const existing = await prisma.outboundSettings.findUnique({ where: { accountId } });
        const prevHistory = (existing?.outboundUpgradeHistory as unknown[]) || [];
        const previousAgentId = existing ? (existing as any)[agentIdField] : null;

        const tz = (account as any).brandingTimezone || 'America/New_York';

        // Auto-set fromPhoneNumberId from inbound phone if not already configured
        let fromPhoneNumberId = existing?.fromPhoneNumberId || undefined;
        if (!fromPhoneNumberId) {
          const inboundPhone = await prisma.retellPhoneNumber.findFirst({
            where: { accountId, isActive: true },
            select: { id: true, phoneNumber: true },
          });
          if (inboundPhone) {
            fromPhoneNumberId = inboundPhone.id;
          }
        }

        // Ensure Retell IP whitelist is configured on the Twilio SIP trunk
        const trunkSid = integrationSettings.twilioSipTrunkSid as string | undefined;
        if (trunkSid) {
          try {
            const twilio = createTwilioService();
            await twilio.ensureRetellIpWhitelist(trunkSid);
          } catch (err) {
            logger.warn(
              { accountId, trunkSid, error: err instanceof Error ? err.message : err },
              '[Outbound] Failed to ensure Retell IP whitelist on SIP trunk',
            );
          }
        }

        // Always register outbound agent on the Retell phone number
        const phoneRecord = await prisma.retellPhoneNumber.findFirst({
          where: { accountId, isActive: true },
          select: { phoneNumber: true },
        });
        if (phoneRecord?.phoneNumber) {
          try {
            await retell.updatePhoneNumber(phoneRecord.phoneNumber, {
              outbound_agent_id: agent.agent_id,
              allowed_outbound_country_list: ALLOWED_OUTBOUND_COUNTRIES,
            });
            logger.info(
              { accountId, phoneNumber: phoneRecord.phoneNumber, agentId: agent.agent_id },
              '[Outbound] Set outbound_agent_id and allowed countries on Retell phone number',
            );
          } catch (err) {
            logger.warn(
              { accountId, phoneNumber: phoneRecord.phoneNumber, error: err instanceof Error ? err.message : err },
              '[Outbound] Failed to set outbound_agent_id on Retell phone number',
            );
          }
        } else {
          logger.warn(
            { accountId },
            '[Outbound] No active retellPhoneNumber found for account — outbound agent not attached to any phone number',
          );
        }

        // Persist new agent to DB first, then clean up old one
        await prisma.outboundSettings.upsert({
          where: { accountId },
          update: {
            [agentIdField]: agent.agent_id,
            [enabledField]: true,
            outboundTemplateVersion: template.version,
            timezone: tz,
            ...(fromPhoneNumberId && !existing?.fromPhoneNumberId
              ? { fromPhoneNumberId }
              : {}),
            outboundUpgradeHistory: [
              ...prevHistory,
              {
                version: template.version,
                agentId: agent.agent_id,
                conversationFlowId: flow.conversation_flow_id,
                previousAgentId,
                group: template.agentGroup,
                action: 'bulk_deploy',
                timestamp: new Date().toISOString(),
              },
            ],
          },
          create: {
            accountId,
            [agentIdField]: agent.agent_id,
            [enabledField]: true,
            outboundTemplateVersion: template.version,
            timezone: tz,
            ...(fromPhoneNumberId ? { fromPhoneNumberId } : {}),
            outboundUpgradeHistory: [
              {
                version: template.version,
                agentId: agent.agent_id,
                conversationFlowId: flow.conversation_flow_id,
                group: template.agentGroup,
                action: 'bulk_deploy',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        });

        // New agent persisted — now clean up old Retell agent + flow
        if (previousAgentId && previousAgentId !== agent.agent_id) {
          try {
            const oldAgent = await retell.getAgent(previousAgentId);
            const oldFlowId = oldAgent?.response_engine?.conversation_flow_id;
            await retell.deleteAgent(previousAgentId);
            if (oldFlowId) {
              await retell.deleteConversationFlow(oldFlowId);
            }
            logger.info(
              { accountId, oldAgentId: previousAgentId, oldFlowId },
              '[Outbound] Deleted previous agent and flow',
            );
          } catch (err) {
            logger.warn(
              { accountId, previousAgentId, error: err instanceof Error ? err.message : err },
              '[Outbound] Failed to clean up previous agent (may already be deleted)',
            );
          }
        }

        results.push({ accountId, success: true, agentId: agent.agent_id });

        logger.info(
          {
            accountId,
            agentId: agent.agent_id,
            templateVersion: template.version,
            voiceId,
            voiceModel: voiceModel || 'default',
            knowledgeBase: retellKbId || 'none',
            fromPhoneNumberId: fromPhoneNumberId || 'none',
          },
          `[Outbound] Deployed ${groupLabel} agent (mirrored inbound config)`,
        );
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : err, accountId },
          `[Outbound] Bulk deploy failed for account`,
        );
        results.push({
          accountId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;

    const parts = [`Deployed to ${succeeded} account(s)`];
    if (skipped > 0) parts.push(`${skipped} skipped (no payment)`);
    if (failed > 0) parts.push(`${failed} failed`);

    return NextResponse.json({
      success: true,
      message: parts.join(', '),
      skippedNoPayment: skipped,
      results,
    });
  } catch (error) {
    logger.error({ error }, '[Outbound] Bulk deploy failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk deploy failed' },
      { status: 500 },
    );
  }
}
