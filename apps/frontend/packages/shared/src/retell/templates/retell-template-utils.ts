/**
 * Retell Template Utilities
 *
 * Hydrates the Retell dental clinic template with clinic-specific values,
 * creates LLMs and agents on Retell, and wires agent_swap tools.
 *
 * Deployment is a two-pass process:
 *   Pass 1: Create 6 LLMs (with prompts + PMS tools, no agent_swap yet)
 *           Create 6 Agents (with voice + LLM references)
 *   Pass 2: Update LLMs to add agent_swap tools with real agent IDs
 */

import { getLogger } from '@kit/shared/logger';

const loggerPromise = getLogger();
const logger = {
  info: (...args: any[]) => loggerPromise.then((l) => l.info(...args)).catch(() => {}),
  warn: (...args: any[]) => loggerPromise.then((l) => l.warn(...args)).catch(() => {}),
  error: (...args: any[]) => loggerPromise.then((l) => l.error(...args)).catch(() => {}),
};

import {
  type RetellService,
  type RetellLlmConfig,
  type RetellAgentConfig,
  type RetellCustomTool,
  type RetellAgentSwapTool,
  type RetellEndCallTool,
  type RetellTransferCallTool,
  type RetellTool,
  type RetellLlmResponse,
  type RetellAgentResponse,
} from '../retell.service';

import {
  RETELL_AGENT_DEFINITIONS,
  RETELL_AGENT_ROLES,
  RETELL_POST_CALL_ANALYSIS,
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_DENTAL_CLINIC_VERSION,
  type RetellAgentRole,
  type RetellAgentDefinition,
} from './dental-clinic.retell-template';

import {
  RETELL_BOOKING_TOOLS,
  RETELL_APPOINTMENT_MGMT_TOOLS,
  RETELL_RECEPTIONIST_TOOLS,
  RETELL_PATIENT_RECORDS_TOOLS,
  RETELL_INSURANCE_BILLING_TOOLS,
  RETELL_EMERGENCY_TOOLS,
} from '../retell-pms-tools.config';

import { hydratePlaceholders } from '../../vapi/templates/template-utils';

// ---------------------------------------------------------------------------
// Voice model resolution — each Retell voice provider requires a specific
// voice_model value. Passing the wrong one causes a 400 error.
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
    // retell-*, inworld-*, and others: let Retell pick the provider default
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetellDeploymentConfig {
  clinicName: string;
  clinicPhone?: string;
  webhookUrl: string;
  webhookSecret: string;
  accountId: string;
  voiceId?: string;
  voiceModel?: string;
  webhookBaseUrl?: string;
  /** Retell knowledge base IDs to attach to all LLMs */
  knowledgeBaseIds?: string[];
}

export interface RetellDeploymentResult {
  agents: Record<RetellAgentRole, { agentId: string; llmId: string }>;
  version: string;
}

// ---------------------------------------------------------------------------
// Tool Group Resolver
// ---------------------------------------------------------------------------

const TOOL_GROUP_MAP: Record<string, RetellCustomTool[]> = {
  receptionist: RETELL_RECEPTIONIST_TOOLS,
  booking: RETELL_BOOKING_TOOLS,
  appointmentMgmt: RETELL_APPOINTMENT_MGMT_TOOLS,
  patientRecords: RETELL_PATIENT_RECORDS_TOOLS,
  insuranceBilling: RETELL_INSURANCE_BILLING_TOOLS,
  emergency: RETELL_EMERGENCY_TOOLS,
};

function resolveToolGroup(groupName: string): RetellCustomTool[] {
  return TOOL_GROUP_MAP[groupName] || [];
}

// ---------------------------------------------------------------------------
// Hydrate tool URLs and secrets
// ---------------------------------------------------------------------------

function hydrateTools(
  tools: RetellCustomTool[],
  config: RetellDeploymentConfig,
): RetellCustomTool[] {
  return tools.map((tool) => ({
    ...tool,
    url: tool.url
      .replace('{{webhookUrl}}', config.webhookUrl)
      .replace(/\/retell\/tools\//, '/retell/tools/'),
    headers: {
      ...tool.headers,
      'x-retell-secret': (tool.headers?.['x-retell-secret'] || '').replace(
        '{{secret}}',
        config.webhookSecret,
      ),
      'x-account-id': (tool.headers?.['x-account-id'] || '').replace(
        '{{accountId}}',
        config.accountId,
      ),
    },
  }));
}

// ---------------------------------------------------------------------------
// Build agent_swap tools from definitions
// ---------------------------------------------------------------------------

function buildAgentSwapTools(
  def: RetellAgentDefinition,
  agentIdMap: Record<RetellAgentRole, string>,
): RetellAgentSwapTool[] {
  return def.swapTargets.map((target) => ({
    type: 'agent_swap' as const,
    name: target.toolName,
    description: target.description,
    agent_id: agentIdMap[target.role],
    speak_during_execution: false,
    post_call_analysis_setting: 'both_agents',
    keep_current_voice: true,
  }));
}

// ---------------------------------------------------------------------------
// Build end_call tool
// ---------------------------------------------------------------------------

function buildEndCallTool(): RetellEndCallTool {
  return {
    type: 'end_call',
    name: 'end_call',
    description: 'End the call when the caller is done or says goodbye.',
    speak_during_execution: true,
    execution_message_description: 'Thank you for calling. Have a great day!',
    execution_message_type: 'static_text',
  };
}

// ---------------------------------------------------------------------------
// Build transfer_call tool (for Emergency agent → clinic phone)
// ---------------------------------------------------------------------------

function buildTransferToClinicTool(clinicPhone: string): RetellTransferCallTool {
  return {
    type: 'transfer_call',
    name: 'transfer_to_clinic',
    description:
      'Transfer the caller directly to clinic staff for immediate assistance. Use for emergencies that need human intervention.',
    transfer_destination: {
      type: 'predefined',
      number: clinicPhone,
    },
    transfer_option: {
      type: 'warm_transfer',
      show_transferee_as_caller: false,
    },
    speak_during_execution: true,
    execution_message_description:
      'Let me connect you with our clinic staff right away.',
    execution_message_type: 'static_text',
  };
}

// ---------------------------------------------------------------------------
// Main Deployment Function
// ---------------------------------------------------------------------------

export async function deployRetellSquad(
  retell: RetellService,
  config: RetellDeploymentConfig,
): Promise<RetellDeploymentResult> {
  const funcName = 'deployRetellSquad';
  logger.info({ funcName, clinicName: config.clinicName }, '[Retell Deploy] Starting');

  const templateVars: Record<string, string> = {
    clinicName: config.clinicName,
    clinicPhone: config.clinicPhone || '',
    accountId: config.accountId,
  };

  const defaultVoiceId = config.voiceId || 'retell-Chloe';
  const defaultVoiceModel = config.voiceModel ?? resolveVoiceModel(defaultVoiceId);
  const webhookUrl = config.webhookBaseUrl || config.webhookUrl;

  // ── Pass 1: Create LLMs and Agents ────────────────────────────────────

  const llmMap: Record<string, RetellLlmResponse> = {};
  const agentMap: Record<string, RetellAgentResponse> = {};
  const originalToolsMap: Record<string, RetellTool[]> = {};

  for (const def of RETELL_AGENT_DEFINITIONS) {
    const hydratedPrompt = hydratePlaceholders(def.systemPrompt, templateVars);
    const hydratedBeginMessage = hydratePlaceholders(def.beginMessage, templateVars);

    const pmsTools = hydrateTools(resolveToolGroup(def.toolGroup), config);

    const baseTools: RetellTool[] = [
      ...pmsTools,
      buildEndCallTool(),
      ...(def.transferToClinic && config.clinicPhone
        ? [buildTransferToClinicTool(config.clinicPhone)]
        : []),
    ];
    originalToolsMap[def.role] = baseTools;

    const llmConfig: RetellLlmConfig = {
      general_prompt: hydratedPrompt,
      general_tools: baseTools,
      model: 'gpt-4.1',
      model_temperature: 0.3,
      tool_call_strict_mode: true,
      start_speaker: def.startSpeaker,
      begin_message: hydratedBeginMessage,
      default_dynamic_variables: {
        customer_phone: '{{call.from_number}}',
      },
      ...(config.knowledgeBaseIds && config.knowledgeBaseIds.length > 0
        ? { knowledge_base_ids: config.knowledgeBaseIds }
        : {}),
    };

    logger.info({ funcName, role: def.role }, '[Retell Deploy] Creating LLM');
    const llm = await retell.createRetellLlm(llmConfig);
    if (!llm) throw new Error(`Failed to create LLM for ${def.role}`);
    llmMap[def.role] = llm;

    await sleep(500);

    const agentConfig: RetellAgentConfig = {
      agent_name: `${config.clinicName} - ${def.name}`,
      response_engine: {
        type: 'retell-llm',
        llm_id: llm.llm_id,
      },
      voice_id: defaultVoiceId,
      ...(defaultVoiceModel ? { voice_model: defaultVoiceModel } : {}),
      ...SHARED_RETELL_AGENT_CONFIG,
      webhook_url: `${webhookUrl}/retell/webhook`,
      webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
      post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
      boosted_keywords: [
        config.clinicName,
        'appointment', 'cleaning', 'exam', 'consultation',
        'dentist', 'dental', 'insurance', 'billing',
      ],
      metadata: {
        accountId: config.accountId,
        role: def.role,
        version: RETELL_DENTAL_CLINIC_VERSION,
      },
    };

    logger.info({ funcName, role: def.role }, '[Retell Deploy] Creating Agent');
    const agent = await retell.createAgent(agentConfig);
    if (!agent) throw new Error(`Failed to create Agent for ${def.role}`);
    agentMap[def.role] = agent;

    await sleep(500);
  }

  // ── Pass 2: Wire agent_swap tools ─────────────────────────────────────
  // Use our original tool definitions (not API response) to avoid schema
  // mismatch — the API response includes extra fields that break oneOf.

  const agentIdMap: Record<RetellAgentRole, string> = {} as any;
  for (const role of RETELL_AGENT_ROLES) {
    agentIdMap[role] = agentMap[role].agent_id;
  }

  for (const def of RETELL_AGENT_DEFINITIONS) {
    if (def.swapTargets.length === 0) continue;

    const swapTools = buildAgentSwapTools(def, agentIdMap);
    const baseTools = originalToolsMap[def.role] || [];
    const updatedTools: RetellTool[] = [...baseTools, ...swapTools];

    logger.info(
      { funcName, role: def.role, swapCount: swapTools.length },
      '[Retell Deploy] Wiring agent_swap tools on LLM',
    );

    await retell.updateRetellLlm(llmMap[def.role].llm_id, {
      general_tools: updatedTools,
    });

    await sleep(300);
  }

  // ── Build result ──────────────────────────────────────────────────────

  const result: RetellDeploymentResult = {
    agents: {} as any,
    version: RETELL_DENTAL_CLINIC_VERSION,
  };

  for (const role of RETELL_AGENT_ROLES) {
    result.agents[role] = {
      agentId: agentMap[role].agent_id,
      llmId: llmMap[role].llm_id,
    };
  }

  logger.info(
    { funcName, agents: Object.keys(result.agents).length },
    '[Retell Deploy] Deployment complete',
  );

  return result;
}

// ---------------------------------------------------------------------------
// Teardown (for cleanup)
// ---------------------------------------------------------------------------

export async function teardownRetellSquad(
  retell: RetellService,
  agentIds: Record<RetellAgentRole, { agentId: string; llmId: string }>,
): Promise<void> {
  const funcName = 'teardownRetellSquad';
  logger.info({ funcName }, '[Retell Teardown] Starting');

  for (const role of RETELL_AGENT_ROLES) {
    const entry = agentIds[role];
    if (!entry) continue;

    try {
      await retell.deleteAgent(entry.agentId);
      await sleep(300);
      await retell.deleteRetellLlm(entry.llmId);
      await sleep(300);
    } catch (err) {
      logger.error(
        { funcName, role, error: err instanceof Error ? err.message : err },
        '[Retell Teardown] Error cleaning up',
      );
    }
  }

  logger.info({ funcName }, '[Retell Teardown] Complete');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
