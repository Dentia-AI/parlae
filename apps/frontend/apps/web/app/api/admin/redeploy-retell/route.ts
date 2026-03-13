import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/redeploy-retell
 *
 * Full redeployment of Retell agents for a specific account.
 * Destroys existing agents and recreates from template + account config.
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
      return NextResponse.json({ success: false, error: 'accountId is required' }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        brandingBusinessName: true,
        name: true,
        phoneIntegrationSettings: true,
      },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const { createRetellService } = await import('@kit/shared/retell/retell.service');
    const retell = createRetellService();

    if (!retell.isEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Retell API key not configured' },
        { status: 400 },
      );
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const businessName = account.brandingBusinessName || account.name || 'Clinic';
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

    const { deployRetellSquad } = await import(
      '@kit/shared/retell/templates/retell-template-utils'
    );

    const deployConfig = {
      clinicName: businessName,
      clinicPhone: settings.phoneNumber || '',
      webhookUrl: backendUrl,
      webhookSecret: process.env.RETELL_WEBHOOK_SECRET || '',
      accountId,
      webhookBaseUrl: backendUrl,
      knowledgeBaseIds: settings.retellKnowledgeBaseId
        ? [settings.retellKnowledgeBaseId]
        : undefined,
    };

    logger.info(
      { accountId, clinicName: businessName },
      '[Retell Redeploy] Starting full redeployment',
    );

    const result = await deployRetellSquad(retell, deployConfig);

    if (result?.agents) {
      // Update phone integration settings with new agent IDs
      await prisma.account.update({
        where: { id: accountId },
        data: {
          phoneIntegrationSettings: {
            ...settings,
            retellReceptionistAgentId: result.agents.receptionist?.agent_id,
            retellAgentIds: Object.values(result.agents)
              .map((a: any) => a?.agent_id)
              .filter(Boolean),
          },
        },
      });

      // Update the single active RetellPhoneNumber for this account
      await prisma.retellPhoneNumber.updateMany({
        where: { accountId, isActive: true },
        data: {
          retellAgentId: result.agents.receptionist?.agent_id,
          retellAgentIds: result.agents as any,
          retellLlmIds: result.llms || null,
        },
      });
    }

    logger.info(
      { accountId, version: result?.version },
      '[Retell Redeploy] Completed',
    );

    return NextResponse.json({
      success: true,
      version: result?.version,
      agentCount: result?.agents ? Object.keys(result.agents).length : 0,
    });
  } catch (error) {
    logger.error({ error }, '[Retell Redeploy] Failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Redeploy failed' },
      { status: 500 },
    );
  }
}
