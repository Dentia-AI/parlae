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
} from '@kit/shared/retell/templates/dental-clinic.retell-template';

/**
 * POST /api/admin/outbound-templates/bulk-deploy
 *
 * Deploy an outbound agent template to selected accounts.
 * Creates per-account Retell agents from the template's flow config.
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

        const flowConfig = {
          ...(template.flowConfig as Record<string, unknown>),
        };
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
          voice_id: 'retell-Chloe',
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

        await prisma.outboundSettings.upsert({
          where: { accountId },
          update: {
            [agentIdField]: agent.agent_id,
            [enabledField]: true,
            outboundTemplateVersion: template.version,
            timezone: tz,
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

        results.push({ accountId, success: true, agentId: agent.agent_id });

        logger.info(
          { accountId, agentId: agent.agent_id, templateVersion: template.version },
          `[Outbound] Deployed ${groupLabel} agent`,
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
