import 'server-only';

import { getLogger } from '@kit/shared/logger';

/**
 * Vapi Assistant Configuration
 */
export interface VapiAssistantConfig {
  name: string;
  voice: {
    provider: '11labs' | 'elevenlabs' | 'playht' | 'azure' | 'deepgram' | 'openai' | 'cartesia' | 'rime-ai';
    voiceId: string;
    stability?: number;
    similarityBoost?: number;
  };
  model: {
    provider: 'openai' | 'anthropic' | 'groq';
    model: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
    knowledgeBase?: {
      provider: 'canonical';
      topK?: number;
      fileIds?: string[];
    };
    /** @deprecated model.messages is used by buildAssistantPayload; prefer systemPrompt */
    messages?: Array<{ role: string; content: string }>;
  };
  firstMessage?: string;
  firstMessageMode?: 'assistant-speaks-first' | 'assistant-waits-for-user' | 'assistant-speaks-first-with-model-generated-message';
  /** Function tools, transferCall tools, etc. — placed at the assistant top level in Vapi API */
  tools?: any[];
  endCallFunctionEnabled?: boolean;
  recordingEnabled?: boolean;
  serverUrl?: string;
  serverUrlSecret?: string;
  /** @deprecated Use analysisPlan instead */
  analysisSchema?: {
    type: 'object';
    properties: Record<string, any>;
  };
  /** Full Vapi analysisPlan object with structuredDataPlan, summaryPlan, etc. */
  analysisPlan?: Record<string, unknown>;
  startSpeakingPlan?: {
    waitSeconds?: number;
    smartEndpointingPlan?: { provider: string };
  };
  stopSpeakingPlan?: {
    numWords?: number;
    voiceSeconds?: number;
    backoffSeconds?: number;
  };
}

/**
 * Vapi Tool Definition
 */
export interface VapiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
  async?: boolean;
  messages?: Array<{
    type: 'request-start' | 'request-response-delayed' | 'request-failed' | 'request-complete';
    content: string;
  }>;
  server?: {
    url: string;
    secret?: string;
    timeoutSeconds?: number;
  };
}

/**
 * Vapi Squad Configuration
 */
export interface VapiSquadConfig {
  name: string;
  members: Array<{
    assistantId?: string; // Reference existing assistant by ID
    assistant?: VapiAssistantConfig; // Or provide inline assistant config
    assistantDestinations?: Array<{
      type: 'assistant';
      assistantName: string;
      message?: string;
      description?: string;
    }>;
  }>;
}

/**
 * Vapi Knowledge Base File
 */
export interface VapiKnowledgeFile {
  name: string;
  url?: string;
  content?: string;
  type?: 'url' | 'text' | 'file';
}

/**
 * Vapi Assistant
 */
export interface VapiAssistant {
  id: string;
  name: string;
  voice: any;
  model: any;
  createdAt: string;
  updatedAt: string;
}

/**
 * Vapi Phone Number
 */
export interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: 'twilio';
  twilioPhoneNumber: string;
  twilioAccountSid: string;
  assistantId?: string;
}

/**
 * Vapi Call — full shape returned by GET /call/{id}
 */
export interface VapiCall {
  id: string;
  orgId?: string;
  assistantId?: string;
  squadId?: string;
  phoneNumberId?: string;
  type?: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  cost?: number;
  costBreakdown?: {
    stt?: number;
    llm?: number;
    tts?: number;
    vapi?: number;
    total?: number;
    transport?: number;
    analysisCostBreakdown?: Record<string, number>;
  };
  customer?: {
    number?: string;
    name?: string;
  };
  phoneNumber?: {
    id?: string;
    number?: string;
  };
  // Artifact contains transcript, recording, etc.
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    messages?: Array<{
      role: string;
      message: string;
      time: number;
      endTime?: number;
    }>;
  };
  // Analysis contains AI-extracted structured data
  analysis?: {
    summary?: string;
    structuredData?: Record<string, any>;
    successEvaluation?: string;
  };
  // Legacy fields (may appear at top level in some Vapi versions)
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
}

/**
 * Parameters for listing calls from Vapi API
 */
export interface VapiListCallsParams {
  phoneNumberId?: string;
  assistantId?: string;
  limit?: number;
  createdAtGe?: string;
  createdAtLe?: string;
  createdAtGt?: string;
  createdAtLt?: string;
}

/**
 * Parameters for Vapi analytics query
 */
export interface VapiAnalyticsQuery {
  queries: Array<{
    table: 'call';
    name: string;
    operations?: Array<{
      operation: 'sum' | 'avg' | 'count' | 'min' | 'max';
      column?: string;
      alias?: string;
    }>;
    groupBy?: string[];
    timeRange?: {
      start: string;
      end: string;
      step?: 'minute' | 'hour' | 'day' | 'week' | 'month';
      timezone?: string;
    };
  }>;
}

/**
 * Vapi Service for AI Voice Agent Management
 */
class VapiService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.vapi.ai';
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.VAPI_API_KEY || '';
    this.enabled = !!this.apiKey;
  }

  /**
   * Check if Vapi integration is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get auth header
   */
  private getAuthHeader(): string {
    return `Bearer ${this.apiKey}`;
  }

  /**
   * Upload knowledge base file
   */
  async uploadKnowledgeFile(file: VapiKnowledgeFile): Promise<string | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        fileName: file.name,
        type: file.type || 'text',
      }, '[Vapi] Uploading knowledge file');

      let response;

      if (file.url) {
        // Upload from URL
        response = await fetch(`${this.baseUrl}/file`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: file.name,
            url: file.url,
          }),
        });
      } else if (file.content) {
        // Upload text content
        response = await fetch(`${this.baseUrl}/file`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: file.name,
            content: file.content,
          }),
        });
      } else {
        logger.error('[Vapi] No file content or URL provided');
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to upload knowledge file');
        return null;
      }

      const result = await response.json();
      const fileId = result.id;

      logger.info({
        fileId,
        fileName: file.name,
      }, '[Vapi] Successfully uploaded knowledge file');

      return fileId;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while uploading knowledge file');

      return null;
    }
  }

  /**
   * Upload binary file to Vapi
   * For actual file uploads (PDF, DOC, etc.)
   */
  async uploadBinaryFile(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        fileName,
        mimeType,
        size: fileBuffer.length,
      }, '[Vapi] Uploading binary file');

      // Use native FormData and Blob (available in Node.js 18+)
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append('file', blob, fileName);

      const response = await fetch(`${this.baseUrl}/file`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          // Don't set Content-Type - let fetch set it with boundary
        },
        body: formData as any, // Type assertion needed for Node.js FormData
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          fileName,
        }, '[Vapi] Failed to upload binary file');
        return null;
      }

      const result = await response.json();
      const fileId = result.id;

      logger.info({
        fileId,
        fileName,
      }, '[Vapi] Successfully uploaded binary file');

      return fileId;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        fileName,
      }, '[Vapi] Exception while uploading binary file');

      return null;
    }
  }

  /**
   * Create a squad (multi-assistant workflow).
   *
   * Vapi's squad endpoint does NOT support inline assistants with tools,
   * analysisSchema, or extra voice properties. So we create each assistant
   * individually first via /assistant, then assemble the squad using
   * assistantId references.
   */
  async createSquad(config: VapiSquadConfig): Promise<any | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        name: config.name,
        memberCount: config.members.length,
      }, '[Vapi] Creating squad');

      // Step 1: Create each inline assistant individually
      const createdAssistantIds: string[] = [];
      const members: Array<{
        assistantId: string;
        assistantDestinations?: any[];
      }> = [];

      for (const member of config.members) {
        let assistantId = member.assistantId;

        if (!assistantId && member.assistant) {
          const assistantConfig = member.assistant;
          const toolCount = assistantConfig.tools?.length || 0;
          const hasAnalysis = !!(assistantConfig.analysisPlan || assistantConfig.analysisSchema);

          logger.info({
            assistantName: assistantConfig.name,
            toolCount,
            hasAnalysis,
            serverUrl: assistantConfig.serverUrl,
            toolNames: assistantConfig.tools?.map((t: any) => t.function?.name || t.type).slice(0, 5),
          }, '[Vapi] Creating assistant for squad member');

          // Create the assistant via the standalone endpoint (supports full config)
          const assistant = await this.createAssistant(assistantConfig);
          if (!assistant) {
            // Cleanup: delete any assistants we already created
            for (const id of createdAssistantIds) {
              try { await this.deleteAssistant(id); } catch { /* best effort */ }
            }
            throw new Error(`Failed to create assistant: ${assistantConfig.name}`);
          }
          assistantId = assistant.id;
          createdAssistantIds.push(assistant.id);

          logger.info({
            assistantId,
            assistantName: assistantConfig.name,
            toolCount,
          }, '[Vapi] Assistant created for squad');
        }

        if (assistantId) {
          members.push({
            assistantId,
            ...(member.assistantDestinations && {
              assistantDestinations: member.assistantDestinations,
            }),
          });
        }
      }

      // Step 2: Create the squad with assistantId references
      const response = await fetch(`${this.baseUrl}/squad`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: config.name,
          members,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to create squad');
        return null;
      }

      const squad = await response.json();

      logger.info({
        squadId: squad.id,
        name: squad.name,
        assistantIds: createdAssistantIds,
      }, '[Vapi] Successfully created squad');

      return squad;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[Vapi] Exception while creating squad');

      return null;
    }
  }

  /**
   * Build assistant payload for Vapi API.
   *
   * IMPORTANT: In modern Vapi API (v2+):
   * - Function tools go at the ASSISTANT level (`payload.tools`), NOT inside `model.tools`.
   *   Each function tool can have its own `server.url` and `server.secret`.
   * - `analysisPlan` goes at the assistant level with `structuredDataPlan.schema`.
   * - `model` only contains provider, model name, messages, temperature, maxTokens, knowledgeBase.
   */
  private buildAssistantPayload(config: VapiAssistantConfig) {
    // Clean voice: strip stability/similarityBoost, map elevenlabs → 11labs
    const voice: Record<string, unknown> = {
      provider: config.voice?.provider === 'elevenlabs' ? '11labs' : config.voice?.provider,
      voiceId: config.voice?.voiceId,
    };

    // Filter out transferCall tools with invalid E.164 phone numbers
    const allTools: unknown[] = config.tools && config.tools.length > 0
      ? config.tools.filter((tool: any) => {
          if (tool.type === 'transferCall' && tool.destinations) {
            const validDests = tool.destinations.filter((d: any) =>
              d.type !== 'number' || /^\+\d{10,15}$/.test(d.number),
            );
            if (validDests.length === 0) return false;
            tool.destinations = validDests;
          }
          return true;
        })
      : [];

    // Build model config — tools do NOT go here
    const systemPrompt = config.model?.systemPrompt || config.model?.messages?.[0]?.content || '';
    const modelConfig: Record<string, unknown> = {
      provider: config.model?.provider,
      model: config.model?.model,
      messages: [{
        role: 'system',
        content: systemPrompt,
      }],
      temperature: config.model?.temperature || 0.7,
      maxTokens: config.model?.maxTokens || 500,
    };

    if (config.model?.knowledgeBase) {
      modelConfig.knowledgeBase = config.model.knowledgeBase;
    }

    const payload: Record<string, unknown> = {
      name: config.name,
      voice,
      model: modelConfig,
      endCallFunctionEnabled: config.endCallFunctionEnabled ?? true,
      recordingEnabled: config.recordingEnabled ?? true,
    };

    // Tools at the ASSISTANT level (not inside model)
    if (allTools.length > 0) {
      payload.tools = allTools;
    }

    if (config.firstMessage !== undefined) {
      payload.firstMessage = config.firstMessage;
    }
    if (config.firstMessageMode) {
      payload.firstMessageMode = config.firstMessageMode;
    }
    if (config.serverUrl) {
      payload.serverUrl = config.serverUrl;
    }
    if (config.serverUrlSecret) {
      payload.serverUrlSecret = config.serverUrlSecret;
    }
    if (config.startSpeakingPlan) {
      payload.startSpeakingPlan = config.startSpeakingPlan;
    }
    if (config.stopSpeakingPlan) {
      payload.stopSpeakingPlan = config.stopSpeakingPlan;
    }

    // Analysis plan: support both old `analysisSchema` and new `analysisPlan` object
    if (config.analysisPlan) {
      // Template-utils now sends the full analysisPlan object
      payload.analysisPlan = config.analysisPlan;
    } else if (config.analysisSchema) {
      // Legacy: wrap raw schema in the correct Vapi structure
      payload.analysisPlan = {
        structuredDataPlan: {
          enabled: true,
          schema: config.analysisSchema,
          timeoutSeconds: 30,
        },
        summaryPlan: { enabled: true },
        successEvaluationPlan: { enabled: false },
      };
    }

    return payload;
  }

  /**
   * Create an AI assistant
   */
  async createAssistant(config: VapiAssistantConfig): Promise<VapiAssistant | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const builtPayload = this.buildAssistantPayload(config);

      logger.info({
        name: config.name,
        hasToolsInPayload: !!(builtPayload as any).tools?.length,
        toolCountInPayload: (builtPayload as any).tools?.length || 0,
        hasAnalysisPlan: !!(builtPayload as any).analysisPlan,
        serverUrl: (builtPayload as any).serverUrl,
      }, '[Vapi] Creating assistant — sending to Vapi API');

      const response = await fetch(`${this.baseUrl}/assistant`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(builtPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to create assistant');
        return null;
      }

      const assistant = await response.json();

      logger.info({
        assistantId: assistant.id,
        name: assistant.name,
      }, '[Vapi] Successfully created assistant');

      return assistant;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[Vapi] Exception while creating assistant');

      return null;
    }
  }

  /**
   * Get an assistant
   */
  async getAssistant(assistantId: string): Promise<VapiAssistant | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          assistantId,
        }, '[Vapi] Failed to get assistant');
        return null;
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        assistantId,
      }, '[Vapi] Exception while getting assistant');

      return null;
    }
  }

  /**
   * Update an assistant
   */
  async updateAssistant(
    assistantId: string,
    config: Partial<VapiAssistantConfig>
  ): Promise<VapiAssistant | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const updateData: any = {};
      
      if (config.name) updateData.name = config.name;
      if (config.voice) updateData.voice = config.voice;
      if (config.model) {
        updateData.model = {
          provider: config.model.provider,
          model: config.model.model,
          messages: [{
            role: 'system',
            content: config.model.systemPrompt,
          }],
          temperature: config.model.temperature,
          maxTokens: config.model.maxTokens,
        };
      }
      if (config.firstMessage) updateData.firstMessage = config.firstMessage;
      if (config.knowledgeBase) updateData.knowledgeBase = config.knowledgeBase;
      if (config.analysisSchema) updateData.analysisSchema = config.analysisSchema;

      const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          assistantId,
        }, '[Vapi] Failed to update assistant');
        return null;
      }

      const assistant = await response.json();

      logger.info({
        assistantId,
      }, '[Vapi] Successfully updated assistant');

      return assistant;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        assistantId,
      }, '[Vapi] Exception while updating assistant');

      return null;
    }
  }

  /**
   * Delete an assistant
   */
  async deleteAssistant(assistantId: string): Promise<boolean> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          assistantId,
        }, '[Vapi] Failed to delete assistant');
        return false;
      }

      logger.info({
        assistantId,
      }, '[Vapi] Successfully deleted assistant');

      return true;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        assistantId,
      }, '[Vapi] Exception while deleting assistant');

      return false;
    }
  }

  /**
   * Delete a squad
   */
  async deleteSquad(squadId: string): Promise<boolean> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/squad/${squadId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          squadId,
        }, '[Vapi] Failed to delete squad');
        return false;
      }

      logger.info({
        squadId,
      }, '[Vapi] Successfully deleted squad');

      return true;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        squadId,
      }, '[Vapi] Exception while deleting squad');

      return false;
    }
  }

  /**
   * List all squads in the Vapi account
   */
  async listSquads(): Promise<any[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/squad`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to list squads');
        return [];
      }

      const squads = await response.json();
      logger.info({ count: squads.length }, '[Vapi] Listed squads');
      return squads;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing squads');
      return [];
    }
  }

  /**
   * Get a squad by ID
   */
  async getSquad(squadId: string): Promise<any | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/squad/${squadId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          squadId,
        }, '[Vapi] Failed to get squad');
        return null;
      }

      const squad = await response.json();

      logger.info({
        squadId: squad.id,
        name: squad.name,
      }, '[Vapi] Successfully fetched squad');

      return squad;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        squadId,
      }, '[Vapi] Exception while fetching squad');

      return null;
    }
  }

  /**
   * Import a Twilio phone number into Vapi
   * Can link to either an assistant OR a squad (not both)
   */
  async importPhoneNumber(
    twilioPhoneNumber: string,
    twilioAccountSid: string,
    twilioAuthToken: string,
    assistantIdOrSquadId?: string,
    isSquad: boolean = false
  ): Promise<VapiPhoneNumber | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        phoneNumber: twilioPhoneNumber,
        assistantId: !isSquad ? assistantIdOrSquadId : undefined,
        squadId: isSquad ? assistantIdOrSquadId : undefined,
      }, '[Vapi] Importing Twilio phone number');

      const response = await fetch(`${this.baseUrl}/phone-number`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'twilio',
          number: twilioPhoneNumber, // Vapi expects "number" not "twilioPhoneNumber"
          twilioAccountSid,
          twilioAuthToken,
          ...(assistantIdOrSquadId && {
            [isSquad ? 'squadId' : 'assistantId']: assistantIdOrSquadId
          }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          phoneNumber: twilioPhoneNumber,
        }, '[Vapi] Failed to import phone number');
        return null;
      }

      const phoneNumber = await response.json();

      logger.info({
        phoneNumberId: phoneNumber.id,
        number: phoneNumber.number,
        assistantId: !isSquad ? assistantIdOrSquadId : undefined,
        squadId: isSquad ? assistantIdOrSquadId : undefined,
      }, '[Vapi] Successfully imported phone number');

      return phoneNumber;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        phoneNumber: twilioPhoneNumber,
      }, '[Vapi] Exception while importing phone number');

      return null;
    }
  }

  /**
   * List phone numbers in Vapi
   */
  async listPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      logger.info('[Vapi] Listing phone numbers');

      const response = await fetch(`${this.baseUrl}/phone-number`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to list phone numbers');
        return [];
      }

      const phoneNumbers = await response.json();

      logger.info({
        count: phoneNumbers.length,
      }, '[Vapi] Successfully listed phone numbers');

      return phoneNumbers;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing phone numbers');

      return [];
    }
  }

  /**
   * Update an existing phone number in Vapi
   */
  async updatePhoneNumber(
    phoneNumberId: string,
    assistantIdOrSquadId?: string,
    isSquad: boolean = false
  ): Promise<VapiPhoneNumber | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        phoneNumberId,
        assistantId: !isSquad ? assistantIdOrSquadId : undefined,
        squadId: isSquad ? assistantIdOrSquadId : undefined,
      }, '[Vapi] Updating phone number');

      const response = await fetch(`${this.baseUrl}/phone-number/${phoneNumberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(assistantIdOrSquadId && {
            [isSquad ? 'squadId' : 'assistantId']: assistantIdOrSquadId
          }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          phoneNumberId,
        }, '[Vapi] Failed to update phone number');
        return null;
      }

      const phoneNumber = await response.json();

      logger.info({
        phoneNumberId: phoneNumber.id,
        number: phoneNumber.number,
        assistantId: !isSquad ? assistantIdOrSquadId : undefined,
        squadId: isSquad ? assistantIdOrSquadId : undefined,
      }, '[Vapi] Successfully updated phone number');

      return phoneNumber;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        phoneNumberId,
      }, '[Vapi] Exception while updating phone number');

      return null;
    }
  }

  /**
   * Get call details and transcript
   */
  async getCall(callId: string): Promise<VapiCall | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/call/${callId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          callId,
        }, '[Vapi] Failed to get call');
        return null;
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        callId,
      }, '[Vapi] Exception while getting call');

      return null;
    }
  }

  /**
   * Get file details from Vapi
   */
  async getFile(fileId: string): Promise<any | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/file/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          fileId,
        }, '[Vapi] Failed to get file');
        return null;
      }

      const file = await response.json();

      logger.info({
        fileId,
        fileName: file.name,
      }, '[Vapi] Successfully retrieved file');

      return file;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        fileId,
      }, '[Vapi] Exception while getting file');

      return null;
    }
  }

  /**
   * Delete a file from Vapi
   */
  async deleteFile(fileId: string): Promise<boolean> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return false;
    }

    try {
      logger.info({
        fileId,
      }, '[Vapi] Deleting file');

      const response = await fetch(`${this.baseUrl}/file/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          fileId,
        }, '[Vapi] Failed to delete file');
        return false;
      }

      logger.info({
        fileId,
      }, '[Vapi] Successfully deleted file');

      return true;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        fileId,
      }, '[Vapi] Exception while deleting file');

      return false;
    }
  }

  /**
   * List all files in Vapi
   */
  async listFiles(): Promise<any[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/file`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to list files');
        return [];
      }

      const files = await response.json();

      logger.info({
        count: files.length,
      }, '[Vapi] Successfully listed files');

      return files;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing files');

      return [];
    }
  }

  /**
   * List calls from Vapi with optional filters.
   * Used for call logs and recent calls pages.
   */
  async listCalls(params: VapiListCallsParams = {}): Promise<VapiCall[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      const searchParams = new URLSearchParams();
      if (params.phoneNumberId) searchParams.set('phoneNumberId', params.phoneNumberId);
      if (params.assistantId) searchParams.set('assistantId', params.assistantId);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.createdAtGe) searchParams.set('createdAtGe', params.createdAtGe);
      if (params.createdAtLe) searchParams.set('createdAtLe', params.createdAtLe);
      if (params.createdAtGt) searchParams.set('createdAtGt', params.createdAtGt);
      if (params.createdAtLt) searchParams.set('createdAtLt', params.createdAtLt);

      const url = `${this.baseUrl}/call?${searchParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to list calls');
        return [];
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing calls');

      return [];
    }
  }

  /**
   * Query Vapi analytics endpoint.
   * POST /analytics
   */
  async getCallAnalytics(query: VapiAnalyticsQuery): Promise<any | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/analytics`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to query analytics');
        return null;
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while querying analytics');

      return null;
    }
  }

  /**
   * List all assistants
   */
  async listAssistants(): Promise<VapiAssistant[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/assistant`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Vapi] Failed to list assistants');
        return [];
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing assistants');

      return [];
    }
  }
}

/**
 * Export a singleton instance
 */
export function createVapiService() {
  return new VapiService();
}
