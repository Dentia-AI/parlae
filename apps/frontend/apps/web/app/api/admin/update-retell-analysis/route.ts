import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { RETELL_POST_CALL_ANALYSIS } from '@kit/shared/retell/templates/dental-clinic.retell-template';

/**
 * POST /api/admin/update-retell-analysis
 *
 * Sync the post-call analysis schema to deployed Retell agents.
 * Accepts either { agentIds: string[] } to patch specific agents,
 * or { accountId: string } to patch all agents for an account.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, agentIds: directAgentIds } = body as {
      accountId?: string;
      agentIds?: string[];
    };

    let uniqueAgentIds: string[];

    if (Array.isArray(directAgentIds) && directAgentIds.length > 0) {
      uniqueAgentIds = [...new Set(directAgentIds)];
    } else if (accountId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { phoneIntegrationSettings: true },
      });

      if (!account) {
        return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
      }

      const settings = (account.phoneIntegrationSettings as any) ?? {};
      const ids: string[] = [];
      if (settings.retellReceptionistAgentId) ids.push(settings.retellReceptionistAgentId);
      if (settings.retellAgentIds && Array.isArray(settings.retellAgentIds)) {
        ids.push(...settings.retellAgentIds);
      }
      uniqueAgentIds = [...new Set(ids)];
    } else {
      return NextResponse.json(
        { success: false, error: 'Either agentIds or accountId is required' },
        { status: 400 },
      );
    }

    if (uniqueAgentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No Retell agent IDs resolved' },
        { status: 400 },
      );
    }

    const { createRetellService } = await import('@kit/shared/retell/retell.service');
    const retell = createRetellService();

    const results: Array<{ agentId: string; success: boolean; error?: string }> = [];

    for (const agentId of uniqueAgentIds) {
      try {
        await retell.updateAgent(agentId, {
          post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
        } as any);
        results.push({ agentId, success: true });
        logger.info({ agentId }, '[Retell Analysis] Updated post-call analysis schema');
      } catch (err: any) {
        results.push({ agentId, success: false, error: err?.message });
        logger.error(
          { error: err?.message, agentId },
          '[Retell Analysis] Failed to update',
        );
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      updated: successCount,
      total: results.length,
      schema: RETELL_POST_CALL_ANALYSIS.map((f) => f.name),
      results,
    });
  } catch (error) {
    logger.error({ error }, '[Retell Analysis] Failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 },
    );
  }
}
