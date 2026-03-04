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
        { success: false, error: 'templateId is required' },
        { status: 400 },
      );
    }

    if (deployAll) {
      const { buildAccountSearchWhere, excludeFromIds } = await import('~/app/api/admin/_lib/admin-pagination');
      const accountWhere: Record<string, unknown> = {};
      if (filters?.templateId) accountWhere.retellAgentTemplateId = filters.templateId;
      if (filters?.version) accountWhere.retellAgentTemplate = { version: filters.version };
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
        { success: false, error: 'No accounts to deploy to' },
        { status: 400 },
      );
    }

    const template = await prisma.retellAgentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
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
        '[Retell Templates] Skipped accounts without verified payment method',
      );
    }

    // Assign template only to accounts with verified payment
    const result = await prisma.account.updateMany({
      where: { id: { in: paymentVerifiedIds } },
      data: { retellAgentTemplateId: templateId },
    });

    logger.info(
      { templateId, accountCount: result.count, templateName: template.name },
      '[Retell Templates] Bulk assigned template to accounts',
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

    const skippedCount = deployResults.filter((r) => r.skipped).length;

    return NextResponse.json({
      success: true,
      assigned: result.count,
      skippedNoPayment: skippedCount,
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
