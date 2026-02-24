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
import { RETELL_AGENT_ROLES, type RetellAgentRole } from '@kit/shared/retell/templates/dental-clinic.retell-template';

/**
 * POST /api/admin/retell-deploy
 *
 * Admin-only endpoint to deploy the Retell AI agent squad for an account.
 * Creates 6 Retell LLMs + 6 Agents, wires agent_swap tools, and optionally
 * provisions a Retell phone number.
 *
 * Body:
 * {
 *   accountId: string           // Required
 *   phoneNumber?: string        // E.164 phone number to import into Retell
 *   deleteExisting?: boolean    // Delete previous Retell agents first (default: false)
 *   voiceId?: string            // Retell voice ID (default: 11labs-Adrian)
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
        retellPhoneNumbers: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const clinicName = account.brandingBusinessName || account.name;
    const clinicPhone = account.brandingContactPhone || undefined;

    // Optionally teardown existing Retell agents
    if (deleteExisting && account.retellPhoneNumbers.length > 0) {
      const existing = account.retellPhoneNumbers[0];
      const agentIds = existing.retellAgentIds as Record<RetellAgentRole, { agentId: string; llmId: string }> | null;
      if (agentIds) {
        logger.info({ funcName, accountId }, '[Retell Deploy] Tearing down existing agents');
        await teardownRetellSquad(retell, agentIds);
      }
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

    const deployConfig: RetellDeploymentConfig = {
      clinicName,
      clinicPhone,
      webhookUrl: backendUrl,
      webhookSecret: process.env.RETELL_WEBHOOK_SECRET || process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET || '',
      accountId,
      voiceId: voiceId || '11labs-Adrian',
      webhookBaseUrl: backendUrl,
    };

    logger.info({ funcName, accountId, clinicName }, '[Retell Deploy] Deploying squad');
    const result = await deployRetellSquad(retell, deployConfig);

    // Import phone number if provided
    let retellPhoneId: string | undefined;
    if (phoneNumber) {
      logger.info({ funcName, phoneNumber }, '[Retell Deploy] Importing phone number');
      const phoneResult = await retell.importPhoneNumber({
        phoneNumber,
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
      await prisma.retellPhoneNumber.upsert({
        where: { phoneNumber: phoneNumber || retellPhoneId! },
        create: {
          accountId,
          retellPhoneId: retellPhoneId || phoneNumber,
          phoneNumber: phoneNumber || retellPhoneId!,
          retellAgentId: result.agents.receptionist.agentId,
          retellAgentIds: agentIds,
          retellLlmIds: llmIds,
          name: `${clinicName} - Retell`,
        },
        update: {
          retellAgentId: result.agents.receptionist.agentId,
          retellAgentIds: agentIds,
          retellLlmIds: llmIds,
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
    });
  } catch (error) {
    logger.error({ funcName, error: error instanceof Error ? error.message : error }, '[Retell Deploy] Failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deployment failed' },
      { status: 500 },
    );
  }
}
