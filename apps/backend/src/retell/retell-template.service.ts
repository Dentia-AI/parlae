import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface RetellApiConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Backend service for admin-driven Retell LLM and agent configuration updates.
 *
 * This complements the frontend deployment logic by providing server-side
 * methods to patch Retell LLM prompts, update agent settings, and read
 * the current config from the Retell API for a given account's agents.
 */
@Injectable()
export class RetellTemplateService {
  private readonly logger = new Logger(RetellTemplateService.name);
  private readonly config: RetellApiConfig;

  constructor(private readonly prisma: PrismaService) {
    this.config = {
      apiKey: process.env.RETELL_API_KEY || '',
      baseUrl: 'https://api.retellai.com',
    };
  }

  get isEnabled(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Fetch the current LLM configuration for an account's deployed Retell agents.
   */
  async getAccountLlmConfigs(accountId: string): Promise<Record<string, any> | null> {
    const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
      where: { accountId },
      select: { retellLlmIds: true },
    });

    const llmIds = (retellPhone?.retellLlmIds as Record<string, string>) ?? {};

    if (Object.keys(llmIds).length === 0) return null;

    const configs: Record<string, any> = {};

    for (const [role, llmId] of Object.entries(llmIds)) {
      try {
        const llm = await this.retellRequest('GET', `/get-retell-llm/${llmId}`);
        configs[role] = llm;
      } catch (err: any) {
        this.logger.error(`Failed to fetch LLM ${llmId} for role ${role}: ${err.message}`);
        configs[role] = { error: err.message };
      }
    }

    return configs;
  }

  /**
   * Update a single LLM's prompt or model for a specific role.
   */
  async updateLlmForRole(
    accountId: string,
    role: string,
    updates: { general_prompt?: string; model?: string },
  ): Promise<{ success: boolean; error?: string }> {
    const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
      where: { accountId },
      select: { retellLlmIds: true },
    });

    const llmIds = (retellPhone?.retellLlmIds as Record<string, string>) ?? {};
    const llmId = llmIds[role];

    if (!llmId) {
      return { success: false, error: `No LLM found for role: ${role}` };
    }

    try {
      await this.retellRequest('PATCH', `/update-retell-llm/${llmId}`, updates);
      this.logger.log(`Updated LLM ${llmId} for role ${role} on account ${accountId}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to update LLM ${llmId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Bulk update prompts for all roles in an account.
   */
  async bulkUpdatePrompts(
    accountId: string,
    updates: Record<string, { general_prompt?: string; model?: string }>,
  ): Promise<{ results: Array<{ role: string; success: boolean; error?: string }> }> {
    const results: Array<{ role: string; success: boolean; error?: string }> = [];

    for (const [role, roleUpdates] of Object.entries(updates)) {
      const result = await this.updateLlmForRole(accountId, role, roleUpdates);
      results.push({ role, ...result });
    }

    return { results };
  }

  /**
   * Get all agent IDs for an account.
   */
  async getAccountAgentIds(accountId: string): Promise<Record<string, string> | null> {
    const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
      where: { accountId },
      select: { retellAgentIds: true },
    });

    if (!retellPhone?.retellAgentIds) return null;

    const agents = retellPhone.retellAgentIds as Record<string, any>;
    const result: Record<string, string> = {};

    for (const [role, agentData] of Object.entries(agents)) {
      if (typeof agentData === 'string') {
        result[role] = agentData;
      } else if (agentData?.agent_id) {
        result[role] = agentData.agent_id;
      }
    }

    return result;
  }

  /**
   * List recent calls for the given agent IDs.
   * Uses Retell's POST /v2/list-calls with filter_criteria.
   */
  async listCalls(
    agentIds: string[],
    limit = 10,
  ): Promise<any[]> {
    if (!this.isEnabled || agentIds.length === 0) return [];
    try {
      const result = await this.retellRequest('POST', '/v2/list-calls', {
        filter_criteria: { agent_id: agentIds },
        sort_order: 'descending',
        limit,
      });
      return Array.isArray(result) ? result : [];
    } catch (err: any) {
      this.logger.error(`Failed to list calls: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch a single call by ID (includes call_analysis).
   */
  async getCall(callId: string): Promise<any | null> {
    if (!this.isEnabled || !callId) return null;
    try {
      return await this.retellRequest('GET', `/get-call/${callId}`);
    } catch (err: any) {
      this.logger.error(`Failed to get call ${callId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Create an outbound phone call via Retell AI POST /v2/create-phone-call.
   */
  async createOutboundCall(opts: {
    fromNumber: string;
    toNumber: string;
    overrideAgentId?: string;
    dynamicVariables?: Record<string, string>;
    metadata?: Record<string, unknown>;
    voicemailMessage?: string;
    maxCallDurationMs?: number;
  }): Promise<any | null> {
    if (!this.isEnabled) {
      this.logger.warn('Retell not configured — cannot create outbound call');
      return null;
    }

    this.logger.log({
      from: opts.fromNumber,
      to: opts.toNumber,
      agentId: opts.overrideAgentId,
      msg: 'Creating outbound phone call',
    });

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

    const agentOverride: Record<string, unknown> = {};
    if (opts.voicemailMessage !== undefined) {
      agentOverride.enable_voicemail_detection = true;
      agentOverride.voicemail_message = opts.voicemailMessage;
    }
    if (opts.maxCallDurationMs) {
      agentOverride.max_call_duration_ms = opts.maxCallDurationMs;
    }
    if (Object.keys(agentOverride).length > 0) {
      body.agent_override = { agent: agentOverride };
    }

    try {
      return await this.retellRequest('POST', '/v2/create-phone-call', body);
    } catch (err: any) {
      this.logger.error(`Failed to create outbound call: ${err.message}`);
      return null;
    }
  }

  private async retellRequest(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Retell ${method} ${path} (${res.status}): ${text}`);
    }

    return res.json();
  }
}
