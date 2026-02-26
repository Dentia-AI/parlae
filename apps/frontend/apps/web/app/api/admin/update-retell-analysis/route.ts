import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { RETELL_POST_CALL_ANALYSIS } from '@kit/shared/retell/templates/dental-clinic.retell-template';

/**
 * POST /api/admin/update-retell-analysis
 *
 * Sync the post-call analysis schema to all deployed Retell agents for an account.
 * This patches agents via the Retell API without full redeployment.
 *
 * Body: { accountId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'accountId is required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { phoneIntegrationSettings: true },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};

    const agentIds: string[] = [];
    if (settings.retellReceptionistAgentId) agentIds.push(settings.retellReceptionistAgentId);
    if (settings.retellAgentIds && Array.isArray(settings.retellAgentIds)) {
      agentIds.push(...settings.retellAgentIds);
    }

    const uniqueAgentIds = [...new Set(agentIds)];

    if (uniqueAgentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No Retell agents found for this account' },
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
        logger.info({ accountId, agentId }, '[Retell Analysis] Updated post-call analysis schema');
      } catch (err: any) {
        results.push({ agentId, success: false, error: err?.message });
        logger.error(
          { error: err?.message, accountId, agentId },
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
