import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/retell-templates/fetch-from-account
 *
 * Fetches the live Retell agent + LLM configs from a deployed account
 * so they can be saved as a new template or used to update an existing one.
 *
 * Body: { accountId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'RetellFetchFromAccount';

  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        phoneIntegrationSettings: true,
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

    const { createRetellService } = await import(
      '@kit/shared/retell/retell.service'
    );
    const retell = createRetellService();

    if (!retell.isEnabled()) {
      return NextResponse.json(
        { error: 'Retell service is not enabled' },
        { status: 503 },
      );
    }

    const llmConfigs: Record<string, any> = {};
    const agentConfigs: Record<string, any> = {};
    let swapConfig: any = {};
    const roles: string[] = [];

    for (const [role, ids] of Object.entries(agentIdsMap)) {
      roles.push(role);

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
              post_call_analysis_data: agent.post_call_analysis_data,
            };

            // Check if the agent has agent_swap as a general_tool (swap routing)
            if (
              role === 'receptionist' &&
              agent.response_engine?.type === 'retell-llm'
            ) {
              // We'll build swap config from the LLM's swap tools later
            }
          }
        }
      } catch (err) {
        logger.warn(
          { error: err instanceof Error ? err.message : err, role },
          `[${funcName}] Failed to fetch config for role`,
        );
      }
    }

    // Build swap config from LLM configs
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

    const businessName =
      account.brandingBusinessName || account.name || 'Clinic';

    logger.info(
      { funcName, accountId, roles },
      '[Retell] Fetched configs from deployed account',
    );

    return NextResponse.json({
      success: true,
      accountName: businessName,
      roles,
      llmConfigs,
      agentConfigs,
      swapConfig,
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
