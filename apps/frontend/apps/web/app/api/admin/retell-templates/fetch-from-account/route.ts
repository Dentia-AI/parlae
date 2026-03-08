import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';

/**
 * POST /api/admin/retell-templates/fetch-from-account
 *
 * Returns a lightweight summary of the deployed Retell agents for an account.
 * Full configs are fetched server-side only when actually creating/updating a template.
 *
 * Body: { accountId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'RetellFetchFromAccount';

  try {
    await requireAdmin();

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        brandingBusinessName: true,
        retellAgentTemplateId: true,
        retellPhoneNumbers: {
          select: {
            retellAgentId: true,
            retellAgentIds: true,
          },
          take: 1,
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    const retellEntry = account.retellPhoneNumbers[0];
    const agentIdsMap = retellEntry?.retellAgentIds as Record<
      string,
      { agentId: string; llmId: string }
    > | null;

    if (!agentIdsMap || Object.keys(agentIdsMap).length === 0) {
      return NextResponse.json(
        { error: 'No Retell agents deployed for this account' },
        { status: 404 },
      );
    }

    const roles = Object.keys(agentIdsMap);
    const businessName =
      account.brandingBusinessName || account.name || 'Clinic';

    logger.info(
      { funcName, accountId, roles },
      '[Retell] Fetched account summary for template',
    );

    return NextResponse.json({
      success: true,
      accountName: businessName,
      roles,
      agentCount: roles.length,
      currentTemplateId: account.retellAgentTemplateId,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      `[${funcName}] Failed`,
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch Retell configs',
      },
      { status: 500 },
    );
  }
}

/**
 * Fetch full Retell configs from a deployed account. Called server-side only
 * (from the create/update routes), never from the client.
 */
export async function fetchRetellConfigsFromAccount(accountId: string) {
  const logger = await getLogger();

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      retellPhoneNumbers: {
        select: { retellAgentIds: true },
        take: 1,
      },
    },
  });

  const agentIdsMap = account?.retellPhoneNumbers[0]?.retellAgentIds as Record<
    string,
    { agentId: string; llmId: string }
  > | null;

  if (!agentIdsMap || Object.keys(agentIdsMap).length === 0) {
    throw new Error('No Retell agents deployed for this account');
  }

  const retell = createRetellService();
  if (!retell.isEnabled()) {
    throw new Error('Retell service is not enabled');
  }

  const llmConfigs: Record<string, any> = {};
  const agentConfigs: Record<string, any> = {};
  let swapConfig: any = {};

  for (const [role, ids] of Object.entries(agentIdsMap)) {
    try {
      if (ids.llmId) {
        const llm = await retell.getRetellLlm(ids.llmId);
        if (llm) {
          llmConfigs[role] = {
            general_prompt: llm.general_prompt,
            general_tools: llm.general_tools,
            states: llm.states,
            starting_state: llm.starting_state,
            model: llm.model,
            model_temperature: llm.model_temperature,
            tool_call_strict_mode: llm.tool_call_strict_mode,
            knowledge_base_ids: llm.knowledge_base_ids,
            begin_message: llm.begin_message,
          };
        }
      }

      if (ids.agentId) {
        const agent = await retell.getAgent(ids.agentId);
        if (agent) {
          agentConfigs[role] = {
            voice_id: agent.voice_id,
            voice_model: agent.voice_model,
            language: agent.language,
            responsiveness: agent.responsiveness,
            interruption_sensitivity: agent.interruption_sensitivity,
            enable_backchannel: agent.enable_backchannel,
            boosted_keywords: agent.boosted_keywords,
            ambient_sound: agent.ambient_sound,
            ambient_sound_volume: agent.ambient_sound_volume,
            stt_mode: (agent as any).stt_mode,
            denoising_mode: (agent as any).denoising_mode,
            post_call_analysis_data: agent.post_call_analysis_data,
          };
        }
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : err, role },
        '[RetellFetchConfigs] Failed to fetch config for role',
      );
    }
  }

  for (const [role, llmConfig] of Object.entries(llmConfigs)) {
    const swapTools = (llmConfig.general_tools || []).filter(
      (t: any) => t.type === 'agent_swap',
    );
    if (swapTools.length > 0) {
      swapConfig = {
        sourceRole: role,
        swapTools: swapTools.map((t: any) => ({
          description: t.description,
          swap_to_agent_id: t.swap_to_agent_id,
        })),
      };
    }
  }

  return { llmConfigs, agentConfigs, swapConfig };
}
