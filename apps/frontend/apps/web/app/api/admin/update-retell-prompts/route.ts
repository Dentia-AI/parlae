import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/update-retell-prompts
 *
 * Update Retell LLM prompts for a specific account's deployed agents.
 * This patches the LLMs directly via the Retell API without full redeployment.
 *
 * Body:
 * {
 *   accountId: string,
 *   promptUpdates: { [role: string]: { general_prompt?: string, model?: string } }
 * }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId, promptUpdates } = await request.json();

    if (!accountId || !promptUpdates || typeof promptUpdates !== 'object') {
      return NextResponse.json(
        { success: false, error: 'accountId and promptUpdates are required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { phoneIntegrationSettings: true, brandingBusinessName: true, name: true },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};

    // Get the Retell phone number record to find LLM IDs
    const retellPhone = await prisma.retellPhoneNumber.findFirst({
      where: { accountId },
      select: { retellLlmIds: true, retellAgentIds: true },
    });

    const llmIds = (retellPhone?.retellLlmIds as any) ?? {};

    if (Object.keys(llmIds).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No Retell LLM IDs found for this account. Deploy agents first.' },
        { status: 400 },
      );
    }

    const { createRetellService } = await import('@kit/shared/retell/retell.service');
    const retell = createRetellService();

    const results: Array<{ role: string; success: boolean; error?: string }> = [];

    for (const [role, updates] of Object.entries(promptUpdates)) {
      const llmId = (llmIds as any)[role];
      if (!llmId) {
        results.push({ role, success: false, error: `No LLM ID for role: ${role}` });
        continue;
      }

      try {
        await retell.updateRetellLlm(llmId, updates as any);
        results.push({ role, success: true });
        logger.info({ accountId, role, llmId }, '[Retell Prompts] Updated LLM');
      } catch (err: any) {
        results.push({ role, success: false, error: err?.message });
        logger.error({ error: err?.message, accountId, role }, '[Retell Prompts] Update failed');
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      updated: successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    logger.error({ error }, '[Retell Prompts] Failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update prompts' },
      { status: 500 },
    );
  }
}
