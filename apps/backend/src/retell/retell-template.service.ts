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
