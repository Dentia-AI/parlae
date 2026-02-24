import 'server-only';

import { getLogger } from '@kit/shared/logger';

const logger = getLogger();

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
  post_call_analysis_setting: { target: string };
  webhook_setting?: { target: string };
  keep_current_voice?: boolean;
}

export interface RetellAgentConfig {
  agent_name?: string;
  response_engine: {
    type: 'retell-llm';
    llm_id: string;
    version?: number;
  };
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
  normalize_for_speech?: boolean;
  boosted_keywords?: string[];
  end_call_after_silence_ms?: number;
  max_call_duration_ms?: number;
  post_call_analysis_data?: Array<{
    name: string;
    type: 'string' | 'enum' | 'boolean' | 'number';
    description: string;
    examples?: string[];
    options?: string[];
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
  response_engine: { type: string; llm_id: string; version?: number };
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
  start_timestamp?: number;
  end_timestamp?: number;
  transcript?: string;
  recording_url?: string;
  call_analysis?: Record<string, unknown>;
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
    terminationUri?: string;
    sipTrunkId?: string;
    inboundAgentId?: string;
    outboundAgentId?: string;
    nickname?: string;
  }): Promise<RetellPhoneNumberResponse | null> {
    logger.info({ phoneNumber: opts.phoneNumber }, '[Retell] Importing phone number');
    return this.request<RetellPhoneNumberResponse>('POST', '/create-phone-number', {
      phone_number: opts.phoneNumber,
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
    return this.request<RetellCallResponse>('GET', `/get-call/${callId}`);
  }

  async listCalls(opts?: {
    filter_criteria?: Record<string, unknown>;
    sort_order?: 'ascending' | 'descending';
    limit?: number;
  }): Promise<RetellCallResponse[]> {
    const result = await this.request<RetellCallResponse[]>('POST', '/list-calls', opts || {});
    return result || [];
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
