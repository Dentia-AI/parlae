import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';

/**
 * POST /api/admin/retell-templates/conversation-flow/fetch-from-account
 *
 * Fetch the live conversation flow config from a deployed account's Retell agent.
 * Returns a summary for the UI and, when called server-side via the export,
 * the full parsed template shape.
 *
 * Body: { accountId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'FlowFetchFromAccount';

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
        phoneIntegrationSettings: true,
        retellFlowTemplateId: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const conversationFlowId = settings.conversationFlowId;
    const agentId = settings.retellReceptionistAgentId;

    if (!conversationFlowId || !agentId) {
      return NextResponse.json(
        { error: 'No conversation flow agent deployed for this account' },
        { status: 404 },
      );
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json(
        { error: 'Retell service is not enabled' },
        { status: 500 },
      );
    }

    const [flow, agent] = await Promise.all([
      retell.getConversationFlow(conversationFlowId),
      retell.getAgent(agentId),
    ]);

    if (!flow) {
      return NextResponse.json(
        { error: 'Failed to fetch conversation flow from Retell' },
        { status: 502 },
      );
    }

    const flowData = flow as any;
    const agentData = agent as any;

    const nodes: string[] = (flowData.nodes || [])
      .filter((n: any) => n.type === 'conversation')
      .map((n: any) => n.id);

    const businessName =
      account.brandingBusinessName || account.name || 'Clinic';

    logger.info(
      { funcName, accountId, nodeCount: nodes.length, flowId: conversationFlowId },
      '[Flow Fetch] Fetched account flow summary',
    );

    return NextResponse.json({
      success: true,
      accountName: businessName,
      conversationFlowId,
      agentId,
      nodeCount: nodes.length,
      nodes,
      model: flowData.model_choice?.model || 'unknown',
      voiceId: agentData?.voice_id || 'unknown',
      version: settings.retellVersion || 'unknown',
      currentTemplateId: account.retellFlowTemplateId,
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
            : 'Failed to fetch flow config',
      },
      { status: 500 },
    );
  }
}

/**
 * Fetch full conversation flow config from a deployed account.
 * Called server-side only (from the create/update routes).
 *
 * Returns the DB template shape: globalPrompt, nodePrompts, nodeTools, edgeConfig, modelConfig.
 */
export async function fetchFlowConfigFromAccount(accountId: string) {
  const logger = await getLogger();

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      phoneIntegrationSettings: true,
    },
  });

  const settings = (account?.phoneIntegrationSettings as any) ?? {};
  const conversationFlowId = settings.conversationFlowId;
  const agentId = settings.retellReceptionistAgentId;

  if (!conversationFlowId) {
    throw new Error('No conversation flow deployed for this account');
  }

  const retell = createRetellService();
  if (!retell.isEnabled()) {
    throw new Error('Retell service is not enabled');
  }

  const [flow, agent] = await Promise.all([
    retell.getConversationFlow(conversationFlowId),
    agentId ? retell.getAgent(agentId) : Promise.resolve(null),
  ]);

  if (!flow) {
    throw new Error('Failed to fetch conversation flow from Retell');
  }

  const flowData = flow as any;
  const agentData = agent as any;

  const globalPrompt: string = flowData.global_prompt || '';

  const nodePrompts: Record<string, string> = {};
  const nodeTools: Record<string, string[]> = {};
  const edgeConfig: Record<string, Array<{ condition: string; destination: string }>> = {};

  for (const node of flowData.nodes || []) {
    if (node.type !== 'conversation') continue;

    const nodeId = node.id as string;
    const prompt =
      node.instruction?.type === 'prompt'
        ? node.instruction.text
        : '';
    nodePrompts[nodeId] = prompt || '';

    nodeTools[nodeId] = node.tool_ids || [];

    edgeConfig[nodeId] = (node.edges || []).map((e: any) => ({
      condition:
        e.transition_condition?.type === 'prompt'
          ? e.transition_condition.prompt
          : e.transition_condition?.type || '',
      destination: e.destination_node_id,
    }));
  }

  const modelConfig = {
    model: flowData.model_choice?.model || 'gpt-4.1',
    type: flowData.model_choice?.type || 'cascading',
  };

  const agentConfig = agentData
    ? {
        voiceId: agentData.voice_id,
        voiceModel: agentData.voice_model,
        language: agentData.language,
        agentName: agentData.agent_name,
      }
    : undefined;

  logger.info(
    {
      accountId,
      flowId: conversationFlowId,
      nodeCount: Object.keys(nodePrompts).length,
    },
    '[Flow Fetch] Extracted full flow config from account',
  );

  return {
    globalPrompt,
    nodePrompts,
    nodeTools,
    edgeConfig,
    modelConfig,
    agentConfig,
  };
}
