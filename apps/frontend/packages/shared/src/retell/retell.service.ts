import 'server-only';

import { getLogger } from '@kit/shared/logger';

const loggerPromise = getLogger();
const logger = {
  info: (...args: any[]) => loggerPromise.then((l) => l.info(...args)).catch(() => {}),
  warn: (...args: any[]) => loggerPromise.then((l) => l.warn(...args)).catch(() => {}),
  error: (...args: any[]) => loggerPromise.then((l) => l.error(...args)).catch(() => {}),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetellLlmConfig {
  general_prompt: string;
  general_tools?: RetellTool[];
  states?: RetellState[];
  starting_state?: string;
  model?: string;
  model_temperature?: number;
  tool_call_strict_mode?: boolean;
  knowledge_base_ids?: string[];
  start_speaker?: 'user' | 'agent';
  begin_message?: string;
  begin_after_user_silence_ms?: number;
  default_dynamic_variables?: Record<string, string>;
}

export interface RetellState {
  name: string;
  state_prompt?: string;
  edges?: Array<{ destination_state_name: string; description: string }>;
  tools?: RetellTool[];
}

export type RetellTool =
  | RetellCustomTool
  | RetellEndCallTool
  | RetellTransferCallTool
  | RetellAgentSwapTool;

export interface RetellCustomTool {
  type: 'custom';
  name: string;
  url: string;
  description: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  execution_message_description?: string;
  execution_message_type?: 'prompt' | 'static_text';
  timeout_ms?: number;
}

export interface RetellEndCallTool {
  type: 'end_call';
  name: string;
  description: string;
  speak_during_execution?: boolean;
  execution_message_description?: string;
  execution_message_type?: 'prompt' | 'static_text';
}

export interface RetellTransferCallTool {
  type: 'transfer_call';
  name: string;
  description: string;
  transfer_destination: {
    type: 'predefined';
    number: string;
    ignore_e164_validation?: boolean;
  };
  transfer_option: {
    type: 'cold_transfer' | 'warm_transfer';
    show_transferee_as_caller?: boolean;
  };
  speak_during_execution?: boolean;
  execution_message_description?: string;
  execution_message_type?: 'prompt' | 'static_text';
}

export interface RetellAgentSwapTool {
  type: 'agent_swap';
  name: string;
  description: string;
  agent_id: string;
  agent_version?: number;
  speak_during_execution?: boolean;
  execution_message_description?: string;
  execution_message_type?: 'prompt' | 'static_text';
  post_call_analysis_setting: 'both_agents' | 'only_destination_agent';
  webhook_setting?: 'both_agents' | 'only_source_agent';
  keep_current_voice?: boolean;
}

// ---------------------------------------------------------------------------
// Conversation Flow Types
// ---------------------------------------------------------------------------

export interface ConversationFlowEquation {
  left: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'not_contains' | 'exists' | 'not_exist';
  right?: string;
}

export interface ConversationFlowPromptCondition {
  type: 'prompt';
  prompt: string;
}

export interface ConversationFlowEquationCondition {
  type: 'equation';
  equations: ConversationFlowEquation[];
  operator: '||' | '&&';
}

export type ConversationFlowTransitionCondition =
  | ConversationFlowPromptCondition
  | ConversationFlowEquationCondition;

export interface ConversationFlowEdge {
  id: string;
  description?: string;
  transition_condition: ConversationFlowTransitionCondition;
  destination_node_id: string;
}

export interface ConversationFlowNodeBase {
  id: string;
  edges?: ConversationFlowEdge[];
  else_edge?: { destination_node_id: string };
}

export interface ConversationFlowConversationNode extends ConversationFlowNodeBase {
  type: 'conversation';
  instruction: { type: 'prompt'; text: string };
  tool_ids?: string[];
  global_tool_ids?: string[];
  knowledge_base_ids?: string[];
  model_choice?: {
    type: 'cascading';
    model: string;
    high_priority?: boolean;
  };
}

export interface ConversationFlowFunctionNode extends ConversationFlowNodeBase {
  type: 'function';
  tool_id: string;
  tool_type: 'local' | 'shared';
  wait_for_result?: boolean;
  speak_during_execution?: boolean;
  instruction?: { type: 'prompt'; text: string };
}

export interface ConversationFlowTransferCallNode extends ConversationFlowNodeBase {
  type: 'transfer_call';
  transfer_destination: {
    type: 'predefined';
    number: string;
    ignore_e164_validation?: boolean;
  };
  transfer_option: {
    type: 'cold_transfer' | 'warm_transfer';
    show_transferee_as_caller?: boolean;
  };
  edge: ConversationFlowEdge;
  speak_during_execution?: boolean;
  instruction?: { type: 'prompt'; text: string };
}

export interface ConversationFlowEndNode extends ConversationFlowNodeBase {
  type: 'end';
  speak_during_execution?: boolean;
  instruction?: { type: 'prompt'; text: string };
}

export type ConversationFlowNode =
  | ConversationFlowConversationNode
  | ConversationFlowFunctionNode
  | ConversationFlowTransferCallNode
  | ConversationFlowEndNode;

export interface ConversationFlowTool {
  type: 'custom';
  tool_id: string;
  name: string;
  description: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  execution_message_description?: string;
  execution_message_type?: 'prompt' | 'static_text';
  timeout_ms?: number;
  response_variables?: Record<string, string>;
}

export interface ConversationFlowConfig {
  start_speaker: 'user' | 'agent';
  model_choice: {
    type: 'cascading';
    model: string;
    high_priority?: boolean;
  };
  global_prompt?: string;
  default_dynamic_variables?: Record<string, string>;
  tools?: ConversationFlowTool[];
  start_node_id: string;
  nodes: ConversationFlowNode[];
  knowledge_base_ids?: string[];
}

export interface ConversationFlowResponse {
  conversation_flow_id: string;
  version: number;
  last_modification_timestamp: number;
}

// ---------------------------------------------------------------------------
// Agent Types
// ---------------------------------------------------------------------------

export type RetellResponseEngine =
  | { type: 'retell-llm'; llm_id: string; version?: number }
  | { type: 'conversation-flow'; conversation_flow_id: string; version?: number };

export interface RetellAgentConfig {
  agent_name?: string;
  response_engine: RetellResponseEngine;
  voice_id: string;
  voice_model?: string;
  language?: string;
  webhook_url?: string;
  webhook_events?: string[];
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_backchannel?: boolean;
  reminder_trigger_ms?: number;
  reminder_max_count?: number;
  vocab_specialization?: 'general' | 'medical';
  stt_mode?: 'fast' | 'accurate' | 'custom';
  denoising_mode?: 'no-denoise' | 'noise-cancellation' | 'noise-and-background-speech-cancellation';
  normalize_for_speech?: boolean;
  boosted_keywords?: string[];
  end_call_after_silence_ms?: number;
  max_call_duration_ms?: number;
  enable_voicemail_detection?: boolean;
  voicemail_message?: string;
  post_call_analysis_data?: Array<{
    name: string;
    type: 'string' | 'enum' | 'boolean' | 'number';
    description: string;
    examples?: string[];
    choices?: string[];
  }>;
  metadata?: Record<string, unknown>;
}

export interface RetellLlmResponse {
  llm_id: string;
  version: number;
  is_published: boolean;
  last_modification_timestamp: number;
  general_prompt?: string;
  general_tools?: RetellTool[];
  model?: string;
  begin_message?: string;
  start_speaker?: string;
}

export interface RetellAgentResponse {
  agent_id: string;
  version: number;
  agent_name?: string;
  response_engine: { type: string; llm_id?: string; conversation_flow_id?: string; version?: number };
  voice_id: string;
  language?: string;
  webhook_url?: string;
  last_modification_timestamp: number;
}

export interface RetellPhoneNumberResponse {
  phone_number: string;
  phone_number_pretty: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  area_code?: number;
  nickname?: string;
  last_modification_timestamp: number;
}

export interface RetellCallResponse {
  call_id: string;
  agent_id: string;
  call_status: string;
  call_type?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: string;
  transcript_object?: Array<{
    role: string;
    content: string;
    words?: Array<{ word: string; start: number; end: number }>;
  }>;
  recording_url?: string;
  public_log_url?: string;
  call_analysis?: Record<string, unknown>;
  disconnection_reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RetellKnowledgeBaseSource {
  type: 'document' | 'text' | 'url';
  source_id: string;
  filename?: string;
  file_url?: string;
  title?: string;
  content_url?: string;
  url?: string;
}

export interface RetellKnowledgeBaseResponse {
  knowledge_base_id: string;
  knowledge_base_name: string;
  status: 'in_progress' | 'complete' | 'error' | 'refreshing_in_progress';
  knowledge_base_sources?: RetellKnowledgeBaseSource[];
  enable_auto_refresh?: boolean;
  last_refreshed_timestamp?: number;
}

export interface RetellKnowledgeBaseCreateOpts {
  name: string;
  texts?: Array<{ title: string; text: string }>;
  urls?: string[];
  files?: Array<{ name: string; buffer: Buffer; contentType?: string }>;
  enableAutoRefresh?: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;
const BASE_URL = 'https://api.retellai.com';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class RetellService {
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.RETELL_API_KEY || '';
    this.enabled = !!this.apiKey;
    if (!this.enabled) {
      logger.warn('[RetellService] RETELL_API_KEY not set — service disabled');
    }
  }

  private getAuthHeader(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | null> {
    if (!this.enabled) {
      logger.warn(`[RetellService] Skipping ${method} ${path} — disabled`);
      return null;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: this.getAuthHeader(),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (res.status === 429) {
          const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          logger.warn(`[RetellService] Rate limited on ${path}, retrying in ${waitMs}ms`);
          if (attempt < MAX_RETRIES) {
            await sleep(waitMs);
            continue;
          }
        }

        if (res.status === 204) return null;

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Retell ${method} ${path} (${res.status}): ${text}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        if (attempt < MAX_RETRIES && err instanceof Error && err.message.includes('429')) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Retell ${method} ${path}: max retries exceeded`);
  }

  // ── LLM Management ──────────────────────────────────────────────────────

  async createRetellLlm(config: RetellLlmConfig): Promise<RetellLlmResponse | null> {
    const funcName = 'createRetellLlm';
    logger.info({ funcName }, '[Retell] Creating LLM');
    return this.request<RetellLlmResponse>('POST', '/create-retell-llm', config);
  }

  async getRetellLlm(llmId: string): Promise<RetellLlmResponse | null> {
    return this.request<RetellLlmResponse>('GET', `/get-retell-llm/${llmId}`);
  }

  async updateRetellLlm(
    llmId: string,
    updates: Partial<RetellLlmConfig>,
  ): Promise<RetellLlmResponse | null> {
    logger.info({ llmId }, '[Retell] Updating LLM');
    return this.request<RetellLlmResponse>('PATCH', `/update-retell-llm/${llmId}`, updates);
  }

  async deleteRetellLlm(llmId: string): Promise<void> {
    logger.info({ llmId }, '[Retell] Deleting LLM');
    await this.request('DELETE', `/delete-retell-llm/${llmId}`);
  }

  // ── Agent Management ────────────────────────────────────────────────────

  async createAgent(config: RetellAgentConfig): Promise<RetellAgentResponse | null> {
    const funcName = 'createAgent';
    logger.info({ funcName, name: config.agent_name }, '[Retell] Creating agent');
    return this.request<RetellAgentResponse>('POST', '/create-agent', config);
  }

  async getAgent(agentId: string): Promise<RetellAgentResponse | null> {
    return this.request<RetellAgentResponse>('GET', `/get-agent/${agentId}`);
  }

  async updateAgent(
    agentId: string,
    updates: Partial<RetellAgentConfig>,
  ): Promise<RetellAgentResponse | null> {
    logger.info({ agentId }, '[Retell] Updating agent');
    return this.request<RetellAgentResponse>('PATCH', `/update-agent/${agentId}`, updates);
  }

  async deleteAgent(agentId: string): Promise<void> {
    logger.info({ agentId }, '[Retell] Deleting agent');
    await this.request('DELETE', `/delete-agent/${agentId}`);
  }

  async listAgents(): Promise<RetellAgentResponse[]> {
    const result = await this.request<RetellAgentResponse[]>('GET', '/list-agents');
    return result || [];
  }

  // ── Phone Number Management ─────────────────────────────────────────────

  async importPhoneNumber(opts: {
    phoneNumber: string;
    terminationUri: string;
    sipTrunkAuthUsername?: string;
    sipTrunkAuthPassword?: string;
    inboundAgentId?: string;
    outboundAgentId?: string;
    nickname?: string;
  }): Promise<RetellPhoneNumberResponse | null> {
    logger.info(
      { phoneNumber: opts.phoneNumber, terminationUri: opts.terminationUri },
      '[Retell] Importing phone number via /import-phone-number',
    );
    return this.request<RetellPhoneNumberResponse>('POST', '/import-phone-number', {
      phone_number: opts.phoneNumber,
      termination_uri: opts.terminationUri,
      ...(opts.sipTrunkAuthUsername ? { sip_trunk_auth_username: opts.sipTrunkAuthUsername } : {}),
      ...(opts.sipTrunkAuthPassword ? { sip_trunk_auth_password: opts.sipTrunkAuthPassword } : {}),
      ...(opts.inboundAgentId ? { inbound_agent_id: opts.inboundAgentId } : {}),
      ...(opts.outboundAgentId ? { outbound_agent_id: opts.outboundAgentId } : {}),
      ...(opts.nickname ? { nickname: opts.nickname } : {}),
    });
  }

  async listPhoneNumbers(): Promise<RetellPhoneNumberResponse[]> {
    const result = await this.request<RetellPhoneNumberResponse[]>('GET', '/list-phone-numbers');
    return result || [];
  }

  async updatePhoneNumber(
    phoneNumber: string,
    updates: {
      inbound_agent_id?: string;
      outbound_agent_id?: string;
      nickname?: string;
      allowed_outbound_country_list?: string[];
    },
  ): Promise<RetellPhoneNumberResponse | null> {
    logger.info({ phoneNumber }, '[Retell] Updating phone number');
    return this.request<RetellPhoneNumberResponse>(
      'PATCH',
      `/update-phone-number/${encodeURIComponent(phoneNumber)}`,
      updates,
    );
  }

  async deletePhoneNumber(phoneNumber: string): Promise<void> {
    logger.info({ phoneNumber }, '[Retell] Deleting phone number');
    await this.request('DELETE', `/delete-phone-number/${encodeURIComponent(phoneNumber)}`);
  }

  // ── Call Management ─────────────────────────────────────────────────────

  async getCall(callId: string): Promise<RetellCallResponse | null> {
    return this.request<RetellCallResponse>('GET', `/v2/get-call/${callId}`);
  }

  async listCalls(opts?: {
    filter_criteria?: Record<string, unknown>;
    sort_order?: 'ascending' | 'descending';
    limit?: number;
  }): Promise<RetellCallResponse[]> {
    const result = await this.request<RetellCallResponse[]>('POST', '/v2/list-calls', opts || {});
    return result || [];
  }

  /**
   * Create an outbound phone call via Retell AI.
   *
   * Uses POST /v2/create-phone-call. The `override_agent_id` selects which
   * conversation flow handles the call, and `retell_llm_dynamic_variables`
   * injects patient/context data (including `call_type` for router node).
   */
  async createOutboundCall(opts: {
    fromNumber: string;
    toNumber: string;
    overrideAgentId?: string;
    dynamicVariables?: Record<string, string>;
    metadata?: Record<string, unknown>;
    voicemailMessage?: string;
    maxCallDurationMs?: number;
  }): Promise<RetellCallResponse | null> {
    logger.info(
      { from: opts.fromNumber, to: opts.toNumber, agentId: opts.overrideAgentId },
      '[Retell] Creating outbound phone call',
    );

    const body: Record<string, unknown> = {
      from_number: opts.fromNumber,
      to_number: opts.toNumber,
    };

    if (opts.overrideAgentId) {
      body.override_agent_id = opts.overrideAgentId;
    }
    if (opts.dynamicVariables && Object.keys(opts.dynamicVariables).length > 0) {
      body.retell_llm_dynamic_variables = opts.dynamicVariables;
    }
    if (opts.metadata && Object.keys(opts.metadata).length > 0) {
      body.metadata = opts.metadata;
    }
    if (opts.voicemailMessage !== undefined) {
      body.agent_override = {
        agent: {
          enable_voicemail_detection: true,
          voicemail_message: opts.voicemailMessage,
        },
      };
    }
    if (opts.maxCallDurationMs) {
      body.agent_override = {
        ...(body.agent_override as Record<string, unknown> || {}),
        agent: {
          ...((body.agent_override as Record<string, unknown>)?.agent as Record<string, unknown> || {}),
          max_call_duration_ms: opts.maxCallDurationMs,
        },
      };
    }

    return this.request<RetellCallResponse>('POST', '/v2/create-phone-call', body);
  }

  // ── Knowledge Base Management ─────────────────────────────────────────

  /**
   * Create a knowledge base via multipart form upload.
   * Supports text snippets, URLs, and file buffers.
   */
  async createKnowledgeBase(
    opts: RetellKnowledgeBaseCreateOpts,
  ): Promise<RetellKnowledgeBaseResponse | null> {
    if (!this.enabled) {
      logger.warn('[RetellService] Skipping createKnowledgeBase — disabled');
      return null;
    }

    logger.info({ name: opts.name }, '[Retell] Creating knowledge base');

    const formData = new FormData();
    formData.append('knowledge_base_name', opts.name);

    if (opts.texts && opts.texts.length > 0) {
      formData.append('knowledge_base_texts', JSON.stringify(opts.texts));
    }

    if (opts.urls && opts.urls.length > 0) {
      formData.append('knowledge_base_urls', JSON.stringify(opts.urls));
    }

    if (opts.files && opts.files.length > 0) {
      for (const file of opts.files) {
        const blob = new Blob([file.buffer], {
          type: file.contentType || 'application/octet-stream',
        });
        formData.append('knowledge_base_files', blob, file.name);
      }
    }

    if (opts.enableAutoRefresh) {
      formData.append('enable_auto_refresh', 'true');
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${BASE_URL}/create-knowledge-base`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: formData,
        });

        if (res.status === 429) {
          const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          logger.warn(`[RetellService] Rate limited on createKnowledgeBase, retrying in ${waitMs}ms`);
          if (attempt < MAX_RETRIES) {
            await sleep(waitMs);
            continue;
          }
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Retell POST /create-knowledge-base (${res.status}): ${text}`);
        }

        return (await res.json()) as RetellKnowledgeBaseResponse;
      } catch (err) {
        if (attempt < MAX_RETRIES && err instanceof Error && err.message.includes('429')) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }

    throw new Error('Retell POST /create-knowledge-base: max retries exceeded');
  }

  async getKnowledgeBase(kbId: string): Promise<RetellKnowledgeBaseResponse | null> {
    return this.request<RetellKnowledgeBaseResponse>('GET', `/get-knowledge-base/${kbId}`);
  }

  async listKnowledgeBases(): Promise<RetellKnowledgeBaseResponse[]> {
    const result = await this.request<RetellKnowledgeBaseResponse[]>('GET', '/list-knowledge-bases');
    return result || [];
  }

  async deleteKnowledgeBase(kbId: string): Promise<void> {
    logger.info({ kbId }, '[Retell] Deleting knowledge base');
    await this.request('DELETE', `/delete-knowledge-base/${kbId}`);
  }

  /**
   * Poll a knowledge base until its status is 'complete' or 'error'.
   * Returns the final status.
   */
  async waitForKnowledgeBase(
    kbId: string,
    timeoutMs = 120_000,
    pollIntervalMs = 3000,
  ): Promise<RetellKnowledgeBaseResponse | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const kb = await this.getKnowledgeBase(kbId);
      if (!kb) return null;

      if (kb.status === 'complete' || kb.status === 'error') {
        return kb;
      }

      await sleep(pollIntervalMs);
    }

    logger.warn({ kbId }, '[Retell] Knowledge base polling timed out');
    return this.getKnowledgeBase(kbId);
  }

  // ── Conversation Flow Management ──────────────────────────────────────

  async createConversationFlow(
    config: ConversationFlowConfig,
  ): Promise<ConversationFlowResponse | null> {
    logger.info('[Retell] Creating conversation flow');
    return this.request<ConversationFlowResponse>(
      'POST',
      '/create-conversation-flow',
      config,
    );
  }

  async getConversationFlow(
    flowId: string,
  ): Promise<ConversationFlowResponse | null> {
    return this.request<ConversationFlowResponse>(
      'GET',
      `/get-conversation-flow/${flowId}`,
    );
  }

  async updateConversationFlow(
    flowId: string,
    config: Partial<ConversationFlowConfig>,
  ): Promise<ConversationFlowResponse | null> {
    logger.info({ flowId }, '[Retell] Updating conversation flow');
    return this.request<ConversationFlowResponse>(
      'PATCH',
      `/update-conversation-flow/${flowId}`,
      config,
    );
  }

  /**
   * Attach KB to specific conversation nodes instead of the whole flow.
   * This avoids Retell running a KB vector search on every user turn in every node,
   * which adds ~2-3s latency. By scoping KB to only nodes where the caller might
   * ask general questions (e.g. receptionist, faq), booking/scheduling nodes
   * stay fast.
   */
  async attachKbToFlowNodes(
    flowId: string,
    kbIds: string[],
    targetNodeIds: string[] = ['receptionist', 'faq'],
  ): Promise<boolean> {
    const flow = await this.getConversationFlow(flowId);
    if (!flow) return false;

    const nodes = (flow as any).nodes as any[] | undefined;
    if (!nodes?.length) return false;

    let modified = false;
    for (const node of nodes) {
      if (node.type === 'conversation' && targetNodeIds.includes(node.id)) {
        node.knowledge_base_ids = kbIds;
        modified = true;
      } else if (node.knowledge_base_ids) {
        delete node.knowledge_base_ids;
        modified = true;
      }
    }

    if (!modified) return false;

    await this.updateConversationFlow(flowId, {
      knowledge_base_ids: [],
      nodes,
    } as any);

    logger.info(
      { flowId, targetNodeIds, kbCount: kbIds.length },
      '[Retell] Attached KB to specific flow nodes (cleared flow-level KB)',
    );
    return true;
  }

  async deleteConversationFlow(flowId: string): Promise<void> {
    logger.info({ flowId }, '[Retell] Deleting conversation flow');
    await this.request('DELETE', `/delete-conversation-flow/${flowId}`);
  }

  // ── Web Call Management ────────────────────────────────────────────────

  async createWebCall(opts: {
    agentId: string;
    agentVersion?: number;
    metadata?: Record<string, unknown>;
    dynamicVariables?: Record<string, string>;
  }): Promise<{ call_id: string; access_token: string } | null> {
    logger.info({ agentId: opts.agentId }, '[Retell] Creating web call');
    return this.request<{ call_id: string; access_token: string }>(
      'POST',
      '/v2/create-web-call',
      {
        agent_id: opts.agentId,
        ...(opts.agentVersion ? { agent_version: opts.agentVersion } : {}),
        ...(opts.metadata ? { metadata: opts.metadata } : {}),
        ...(opts.dynamicVariables
          ? { retell_llm_dynamic_variables: opts.dynamicVariables }
          : {}),
      },
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

// Factory
let _instance: RetellService | null = null;

export function createRetellService(): RetellService {
  if (!_instance) {
    _instance = new RetellService();
  }
  return _instance;
}
