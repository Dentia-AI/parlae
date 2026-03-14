import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';
import {
  deployRetellSquad,
  teardownRetellSquad,
  type RetellDeploymentConfig,
} from '@kit/shared/retell/templates/retell-template-utils';
import { RETELL_AGENT_ROLES, DEFAULT_VOICE_ID, type RetellAgentRole } from '@kit/shared/retell/templates/dental-clinic.retell-template';
import { ensureRetellKnowledgeBase } from '@kit/shared/retell/retell-kb.service';

/**
 * POST /api/admin/retell-deploy
 *
 * Admin-only endpoint to deploy the Retell AI agent squad for an account.
 * Creates 6 Retell LLMs + 6 Agents, wires agent_swap tools, and optionally
 * provisions a Retell phone number.
 *
 * Existing agents for the account are automatically torn down before redeploying.
 *
 * Body:
 * {
 *   accountId: string           // Required
 *   phoneNumber?: string        // E.164 phone number to import into Retell
 *   voiceId?: string            // Retell voice ID (default: retell-Chloe)
 * }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'POST /api/admin/retell-deploy';

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, phoneNumber, deleteExisting = false, voiceId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json(
        { error: 'RETELL_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        brandingBusinessName: true,
        brandingContactPhone: true,
        phoneIntegrationSettings: true,
        retellPhoneNumbers: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const clinicName = account.brandingBusinessName || account.name;
    const clinicPhone = account.brandingContactPhone || undefined;

    // Always teardown existing Retell agents on redeploy to prevent duplicates
    if (account.retellPhoneNumbers.length > 0) {
      const existing = account.retellPhoneNumbers[0];
      const agentIds = existing.retellAgentIds as Record<RetellAgentRole, { agentId: string; llmId: string }> | null;
      if (agentIds) {
        logger.info({ funcName, accountId }, '[Retell Deploy] Tearing down existing agents before redeploy');
        try {
          await teardownRetellSquad(retell, agentIds);
        } catch (teardownErr) {
          logger.warn(
            { error: teardownErr instanceof Error ? teardownErr.message : teardownErr },
            '[Retell Deploy] Non-fatal: teardown of old agents failed, continuing with fresh deploy',
          );
        }
      }
    }

    // Sync Vapi knowledge base to Retell if the account has KB files
    const settings = (account.phoneIntegrationSettings as Record<string, any>) || {};
    const knowledgeBaseIds: string[] = [];

    const vapiKBFileIds: string[] = (() => {
      const config = settings.knowledgeBaseConfig as Record<string, string[]> | undefined;
      if (config) {
        return Object.values(config).flat().filter(Boolean);
      }
      return (settings.knowledgeBaseFileIds as string[]) || [];
    })();

    if (vapiKBFileIds.length > 0) {
      logger.info(
        { funcName, accountId, fileCount: vapiKBFileIds.length },
        '[Retell Deploy] Syncing Vapi KB to Retell',
      );

      const existingRetellKbId = (account.retellPhoneNumbers[0] as any)?.retellKnowledgeBaseId;
      try {
        const kbId = await ensureRetellKnowledgeBase(
          accountId,
          vapiKBFileIds,
          clinicName,
          existingRetellKbId,
        );
        if (kbId) {
          knowledgeBaseIds.push(kbId);
          logger.info({ funcName, kbId }, '[Retell Deploy] KB synced');
        }
      } catch (kbErr) {
        logger.warn(
          { error: kbErr instanceof Error ? kbErr.message : kbErr },
          '[Retell Deploy] Non-fatal: KB sync failed, deploying without KB',
        );
      }
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

    const deployConfig: RetellDeploymentConfig = {
      clinicName,
      clinicPhone,
      webhookUrl: backendUrl,
      webhookSecret: process.env.RETELL_WEBHOOK_SECRET || process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET || '',
      accountId,
      voiceId: voiceId || DEFAULT_VOICE_ID,
      webhookBaseUrl: backendUrl,
      knowledgeBaseIds: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
    };

    logger.info({ funcName, accountId, clinicName }, '[Retell Deploy] Deploying squad');
    const result = await deployRetellSquad(retell, deployConfig);

    // Import phone number if provided (must be E.164 format)
    let retellPhoneId: string | undefined;
    if (phoneNumber) {
      const e164Phone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      logger.info({ funcName, phoneNumber: e164Phone }, '[Retell Deploy] Importing phone number');
      const phoneResult = await retell.importPhoneNumber({
        phoneNumber: e164Phone,
        inboundAgentId: result.agents.receptionist.agentId,
        nickname: `${clinicName} - Retell Backup`,
      });
      retellPhoneId = phoneResult?.phone_number;
    }

    // Save to database
    const agentIds: Record<string, { agentId: string; llmId: string }> = {};
    const llmIds: Record<string, string> = {};
    for (const role of RETELL_AGENT_ROLES) {
      agentIds[role] = result.agents[role];
      llmIds[role] = result.agents[role].llmId;
    }

    if (retellPhoneId || phoneNumber) {
      const e164Phone = phoneNumber || retellPhoneId!;

      // Deactivate stale records for this account
      await prisma.retellPhoneNumber.updateMany({
        where: { accountId, phoneNumber: { not: e164Phone } },
        data: { isActive: false },
      });

      await prisma.retellPhoneNumber.upsert({
        where: { phoneNumber: e164Phone },
        create: {
          accountId,
          retellPhoneId: retellPhoneId || phoneNumber,
          phoneNumber: e164Phone,
          retellAgentId: result.agents.receptionist.agentId,
          retellAgentIds: agentIds,
          retellLlmIds: llmIds,
          name: `${clinicName} - Retell`,
          isActive: true,
        },
        update: {
          accountId,
          retellAgentId: result.agents.receptionist.agentId,
          retellAgentIds: agentIds,
          retellLlmIds: llmIds,
          isActive: true,
        },
      });
    } else {
      // Even without a phone number, store the agent IDs for later
      // We create a placeholder record so we can track the deployment
      const placeholderPhone = `retell-pending-${accountId}`;
      await prisma.retellPhoneNumber.upsert({
        where: { retellPhoneId: `pending-${accountId}` },
        create: {
          accountId,
          retellPhoneId: `pending-${accountId}`,
          phoneNumber: placeholderPhone,
          retellAgentId: result.agents.receptionist.agentId,
          retellAgentIds: agentIds,
          retellLlmIds: llmIds,
          name: `${clinicName} - Retell (no phone)`,
          isActive: false,
        },
        update: {
          retellAgentId: result.agents.receptionist.agentId,
          retellAgentIds: agentIds,
          retellLlmIds: llmIds,
        },
      });
    }

    // Link account to the default Retell template (or the one specified)
    const templateId = body.templateId as string | undefined;
    try {
      let assignedTemplateId = templateId;

      if (!assignedTemplateId) {
        const defaultTemplate = await prisma.retellAgentTemplate.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        });
        assignedTemplateId = defaultTemplate?.id ?? undefined;
      }

      if (assignedTemplateId) {
        await prisma.account.update({
          where: { id: accountId },
          data: { retellAgentTemplateId: assignedTemplateId },
        });
        logger.info({ funcName, accountId, templateId: assignedTemplateId }, '[Retell Deploy] Linked account to template');
      }
    } catch (templateLinkErr) {
      logger.warn(
        { error: templateLinkErr instanceof Error ? templateLinkErr.message : templateLinkErr },
        '[Retell Deploy] Non-fatal: could not link template to account',
      );
    }

    logger.info({ funcName, accountId, version: result.version }, '[Retell Deploy] Complete');

    return NextResponse.json({
      success: true,
      version: result.version,
      agents: Object.fromEntries(
        RETELL_AGENT_ROLES.map((role) => [
          role,
          { agentId: result.agents[role].agentId },
        ]),
      ),
      phoneNumber: retellPhoneId || phoneNumber || null,
      knowledgeBaseIds: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
    });
  } catch (error) {
    logger.error({ funcName, error: error instanceof Error ? error.message : error }, '[Retell Deploy] Failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deployment failed' },
      { status: 500 },
    );
  }
}
