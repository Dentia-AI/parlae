import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';

/**
 * GET /api/admin/retell-agents
 *
 * Lists all Retell agents from the Retell API and cross-references them
 * with the database to identify orphaned agents (not linked to any account).
 */
export async function GET() {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json(
        { error: 'RETELL_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const [agents, retellPhoneNumbers, accounts] = await Promise.all([
      retell.listAgents(),
      prisma.retellPhoneNumber.findMany({
        select: {
          retellAgentId: true,
          retellAgentIds: true,
          accountId: true,
          phoneNumber: true,
          account: { select: { name: true, brandingBusinessName: true } },
        },
      }),
      prisma.account.findMany({
        select: {
          id: true,
          name: true,
          brandingBusinessName: true,
          phoneIntegrationSettings: true,
        },
      }),
    ]);

    const linkedAgentIds = new Map<string, { accountName: string; accountId: string; source: string }>();

    for (const rpn of retellPhoneNumbers) {
      const accountName = rpn.account?.brandingBusinessName || rpn.account?.name || 'Unknown';
      if (rpn.retellAgentId) {
        linkedAgentIds.set(rpn.retellAgentId, {
          accountName,
          accountId: rpn.accountId,
          source: 'retellPhoneNumbers',
        });
      }
      const agentIdsObj = rpn.retellAgentIds as Record<string, { agentId: string }> | null;
      if (agentIdsObj) {
        for (const [role, val] of Object.entries(agentIdsObj)) {
          if (val?.agentId) {
            linkedAgentIds.set(val.agentId, {
              accountName: `${accountName} (${role})`,
              accountId: rpn.accountId,
              source: 'retellPhoneNumbers',
            });
          }
        }
      }
    }

    for (const acct of accounts) {
      const settings = acct.phoneIntegrationSettings as Record<string, unknown> | null;
      if (!settings) continue;
      const accountName = acct.brandingBusinessName || acct.name || 'Unknown';
      const agentId = settings.receptionistAgentId as string | undefined;
      if (agentId && !linkedAgentIds.has(agentId)) {
        linkedAgentIds.set(agentId, {
          accountName,
          accountId: acct.id,
          source: 'phoneIntegrationSettings',
        });
      }
      const flowAgentId = settings.retellConversationFlowAgentId as string | undefined;
      if (flowAgentId && !linkedAgentIds.has(flowAgentId)) {
        linkedAgentIds.set(flowAgentId, {
          accountName,
          accountId: acct.id,
          source: 'phoneIntegrationSettings',
        });
      }
    }

    const enrichedAgents = agents.map((agent) => {
      const link = linkedAgentIds.get(agent.agent_id);
      return {
        agentId: agent.agent_id,
        agentName: agent.agent_name || null,
        voiceId: agent.voice_id,
        responseEngineType: agent.response_engine?.type || 'unknown',
        conversationFlowId: agent.response_engine?.conversation_flow_id || null,
        lastModified: agent.last_modification_timestamp,
        isOrphaned: !link,
        linkedAccount: link
          ? { name: link.accountName, id: link.accountId, source: link.source }
          : null,
      };
    });

    enrichedAgents.sort((a, b) => {
      if (a.isOrphaned !== b.isOrphaned) return a.isOrphaned ? -1 : 1;
      return (b.lastModified || 0) - (a.lastModified || 0);
    });

    return NextResponse.json({
      success: true,
      agents: enrichedAgents,
      summary: {
        total: enrichedAgents.length,
        orphaned: enrichedAgents.filter((a) => a.isOrphaned).length,
        linked: enrichedAgents.filter((a) => !a.isOrphaned).length,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      '[admin/retell-agents] Failed to list agents',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list agents' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/retell-agents
 *
 * Bulk-delete Retell agents by IDs.
 * Body: { agentIds: string[] }
 */
export async function DELETE(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { agentIds } = body as { agentIds: string[] };

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json(
        { error: 'agentIds array is required' },
        { status: 400 },
      );
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json(
        { error: 'RETELL_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const results: { agentId: string; success: boolean; error?: string }[] = [];

    for (const agentId of agentIds) {
      try {
        await retell.deleteAgent(agentId);
        results.push({ agentId, success: true });
        logger.info({ agentId }, '[admin/retell-agents] Deleted agent');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ agentId, success: false, error: msg });
        logger.warn({ agentId, error: msg }, '[admin/retell-agents] Failed to delete agent');
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      deleted: succeeded,
      failed,
      results,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      '[admin/retell-agents] Bulk delete failed',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk delete failed' },
      { status: 500 },
    );
  }
}
