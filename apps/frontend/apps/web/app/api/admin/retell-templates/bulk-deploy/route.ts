import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/retell-templates/bulk-deploy
 *
 * Deploy a Retell template to selected accounts.
 * This updates each account's retellAgentTemplateId and triggers
 * a redeploy of Retell agents using the template config.
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
        { success: false, error: 'templateId and accountIds are required' },
        { status: 400 },
      );
    }

    const template = await prisma.retellAgentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Assign template to accounts
    const result = await prisma.account.updateMany({
      where: { id: { in: accountIds } },
      data: { retellAgentTemplateId: templateId },
    });

    logger.info(
      { templateId, accountCount: result.count, templateName: template.name },
      '[Retell Templates] Bulk assigned template to accounts',
    );

    // Trigger redeploy for each account (non-blocking)
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
          },
        });

        if (!account) {
          deployResults.push({ accountId, success: false, error: 'Account not found' });
          continue;
        }

        const settings = (account.phoneIntegrationSettings as any) ?? {};
        const businessName = account.brandingBusinessName || account.name || 'Clinic';

        const { deployRetellSquad } = await import(
          '@kit/shared/retell/templates/retell-template-utils'
        );

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

        const deployConfig = {
          clinicName: businessName,
          clinicPhone: settings.phoneNumber || '',
          webhookUrl: backendUrl,
          webhookSecret: process.env.RETELL_WEBHOOK_SECRET || '',
          accountId,
          webhookBaseUrl: backendUrl,
          knowledgeBaseIds: settings.retellKnowledgeBaseId ? [settings.retellKnowledgeBaseId] : undefined,
        };

        const deployResult = await deployRetellSquad(retell, deployConfig);

        if (deployResult?.agents) {
          await prisma.account.update({
            where: { id: accountId },
            data: {
              phoneIntegrationSettings: {
                ...settings,
                retellReceptionistAgentId: deployResult.agents.receptionist?.agent_id,
                retellAgentIds: Object.values(deployResult.agents)
                  .map((a: any) => a?.agent_id)
                  .filter(Boolean),
              },
            },
          });
        }

        deployResults.push({ accountId, success: true });
      } catch (err: any) {
        logger.error({ error: err?.message, accountId }, '[Retell Templates] Deploy failed for account');
        deployResults.push({ accountId, success: false, error: err?.message });
      }
    }

    return NextResponse.json({
      success: true,
      assigned: result.count,
      deployResults,
    });
  } catch (error) {
    logger.error({ error }, '[Retell Templates] Bulk deploy failed');
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Bulk deploy failed' },
      { status: 500 },
    );
  }
}
