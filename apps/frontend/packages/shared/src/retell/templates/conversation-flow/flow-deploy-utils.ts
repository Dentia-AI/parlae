/**
 * Conversation Flow Deploy Utilities
 *
 * Deploys a Retell conversation flow agent in two API calls:
 *   1. POST /create-conversation-flow  ->  conversation_flow_id
 *   2. POST /create-agent              ->  agent_id (with response_engine = conversation_flow)
 *
 * Completely independent from the existing squad deployment in retell-template-utils.ts.
 */

import { getLogger } from '@kit/shared/logger';

const loggerPromise = getLogger();
const logger = {
  info: (...args: any[]) => loggerPromise.then((l) => l.info(...args)).catch(() => {}),
  warn: (...args: any[]) => loggerPromise.then((l) => l.warn(...args)).catch(() => {}),
  error: (...args: any[]) => loggerPromise.then((l) => l.error(...args)).catch(() => {}),
};

import type { RetellService } from '../../retell.service';

import {
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_POST_CALL_ANALYSIS,
} from '../dental-clinic.retell-template';

import {
  buildDentalClinicFlow,
  CONVERSATION_FLOW_VERSION,
  type ConversationFlowBuildConfig,
} from './dental-clinic.flow-template';

// ---------------------------------------------------------------------------
// Voice model resolution (same logic as retell-template-utils.ts)
// ---------------------------------------------------------------------------

function resolveVoiceModel(voiceId: string): string | undefined {
  const prefix = voiceId.split('-')[0]?.toLowerCase();
  switch (prefix) {
    case '11labs':
      return 'eleven_turbo_v2_5';
    case 'cartesia':
      return 'sonic-3';
    case 'minimax':
      return 'speech-02-turbo';
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowDeploymentConfig extends ConversationFlowBuildConfig {
  voiceId?: string;
}

export interface FlowDeploymentResult {
  agentId: string;
  conversationFlowId: string;
  version: string;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export async function deployRetellConversationFlow(
  retell: RetellService,
  config: FlowDeploymentConfig,
): Promise<FlowDeploymentResult> {
  const funcName = 'deployRetellConversationFlow';
  logger.info({ funcName, clinicName: config.clinicName }, '[ConversationFlow] Starting deployment');

  // 1. Build the flow definition
  const flowConfig = buildDentalClinicFlow(config);

  // 2. Create the conversation flow on Retell
  const flow = await retell.createConversationFlow(flowConfig);
  if (!flow) {
    throw new Error('[ConversationFlow] Failed to create conversation flow');
  }

  logger.info(
    { funcName, flowId: flow.conversation_flow_id },
    '[ConversationFlow] Flow created',
  );

  // 3. Create the agent linked to the conversation flow
  const voiceId = config.voiceId || 'retell-Chloe';
  const voiceModel = resolveVoiceModel(voiceId);

  const agent = await retell.createAgent({
    agent_name: `${config.clinicName} - Conversation Flow (${CONVERSATION_FLOW_VERSION})`,
    response_engine: {
      type: 'conversation-flow',
      conversation_flow_id: flow.conversation_flow_id,
    },
    voice_id: voiceId,
    ...(voiceModel ? { voice_model: voiceModel } : {}),
    ...SHARED_RETELL_AGENT_CONFIG,
    webhook_url: `${config.webhookUrl}/retell/webhook`,
    webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
    post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
    boosted_keywords: [config.clinicName, 'appointment', 'dentist', 'cleaning', 'emergency'],
    metadata: {
      accountId: config.accountId,
      deployType: 'conversation_flow',
      version: CONVERSATION_FLOW_VERSION,
    },
  } as any); // response_engine type union requires 'as any' for the expanded config spread

  if (!agent) {
    // Clean up the orphaned flow
    try {
      await retell.deleteConversationFlow(flow.conversation_flow_id);
    } catch {
      logger.warn({ funcName }, '[ConversationFlow] Failed to clean up orphaned flow');
    }
    throw new Error('[ConversationFlow] Failed to create agent');
  }

  logger.info(
    { funcName, agentId: agent.agent_id, flowId: flow.conversation_flow_id },
    '[ConversationFlow] Deployment complete',
  );

  return {
    agentId: agent.agent_id,
    conversationFlowId: flow.conversation_flow_id,
    version: CONVERSATION_FLOW_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export async function teardownRetellConversationFlow(
  retell: RetellService,
  agentId: string,
  conversationFlowId: string,
): Promise<void> {
  const funcName = 'teardownRetellConversationFlow';
  logger.info(
    { funcName, agentId, conversationFlowId },
    '[ConversationFlow] Tearing down',
  );

  try {
    await retell.deleteAgent(agentId);
    logger.info({ funcName, agentId }, '[ConversationFlow] Agent deleted');
  } catch (err) {
    logger.warn(
      { funcName, error: err instanceof Error ? err.message : err },
      '[ConversationFlow] Failed to delete agent (may already be deleted)',
    );
  }

  try {
    await retell.deleteConversationFlow(conversationFlowId);
    logger.info({ funcName, conversationFlowId }, '[ConversationFlow] Flow deleted');
  } catch (err) {
    logger.warn(
      { funcName, error: err instanceof Error ? err.message : err },
      '[ConversationFlow] Failed to delete flow (may already be deleted)',
    );
  }
}
