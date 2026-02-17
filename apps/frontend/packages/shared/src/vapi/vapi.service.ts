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
  /** Inline tools (transferCall, endCall) — placed in model.tools */
  tools?: any[];
  /** Standalone Vapi tool IDs — placed in model.toolIds */
  toolIds?: string[];
  endCallFunctionEnabled?: boolean;
  recordingEnabled?: boolean;
  serverUrl?: string;
  serverUrlSecret?: string;
  /**
   * Vapi Custom Credential ID for server authentication.
   * When set, Vapi uses this credential (Bearer Token) instead of inline secret.
   * Created in the Vapi dashboard under Custom Credentials.
   */
  credentialId?: string;
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
    // Vapi returns transcript as an array of message objects (role + message + time).
    // Some older calls may have it as a plain string.
    transcript?: string | Array<{
      role: string;
      message: string;
      time: number;
      endTime?: number;
    }>;
    recording?: string;
    recordingUrl?: string;
    messages?: Array<{
      role: string;
      message: string;
      time: number;
      endTime?: number;
    }>;
    messagesOpenAIFormatted?: Array<{
      role: string;
      content: string;
    }>;
    logUrl?: string;
    pcapUrl?: string;
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
  createdAt?: string;
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
 * Parameters for Vapi analytics query.
 * Matches the full POST /analytics API spec.
 *
 * Note: `groupBy` is a single string per the OpenAPI spec, not an array.
 */
export interface VapiAnalyticsQuery {
  queries: Array<{
    table: 'call' | 'subscription';
    name: string;
    operations: Array<{
      operation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'history';
      column: string;
      alias?: string;
    }>;
    groupBy?: 'type' | 'assistantId' | 'endedReason' | 'analysis.successEvaluation' | 'status';
    groupByVariableValue?: Array<{ key: string }>;
    timeRange?: {
      start: string;
      end: string;
      step?: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
      timezone?: string;
    };
  }>;
}

/**
 * Vapi Structured Output — created via POST /structured-output
 */
export interface VapiStructuredOutput {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  schema: Record<string, any>;
  assistantIds?: string[];
  workflowIds?: string[];
  compliancePlan?: { forceStoreOnHipaaEnabled?: boolean };
  createdAt: string;
  updatedAt: string;
}

/**
 * Parameters for creating a Vapi Structured Output
 */
export interface CreateStructuredOutputParams {
  name: string;
  schema: Record<string, any>;
  description?: string;
  assistantIds?: string[];
  compliancePlan?: { forceStoreOnHipaaEnabled?: boolean };
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

      for (let memberIdx = 0; memberIdx < config.members.length; memberIdx++) {
        const member = config.members[memberIdx]!;
        let assistantId = member.assistantId;

        if (!assistantId && member.assistant) {
          // Rate-limit courtesy: wait between assistant creations (skip first)
          if (memberIdx > 0) {
            await new Promise((r) => setTimeout(r, 1500));
          }

          const assistantConfig = member.assistant;
          const inlineToolCount = assistantConfig.tools?.length || 0;
          const standaloneToolCount = assistantConfig.toolIds?.length || 0;
          const hasAnalysis = !!(assistantConfig.analysisPlan || assistantConfig.analysisSchema);

          logger.info({
            assistantName: assistantConfig.name,
            standaloneToolCount,
            inlineToolCount,
            hasAnalysis,
            serverUrl: assistantConfig.serverUrl,
            toolIds: assistantConfig.toolIds?.slice(0, 5),
            inlineToolNames: assistantConfig.tools?.map((t: any) => t.function?.name || t.type).slice(0, 5),
            memberIndex: `${memberIdx + 1}/${config.members.length}`,
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
            standaloneToolCount,
            inlineToolCount,
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
   * Vapi assistant schema:
   * - Standalone tools are referenced via `model.toolIds` (array of Vapi tool IDs).
   * - Inline tools (transferCall, endCall) go in `model.tools`.
   * - Function tools also go in `model.tools` as FALLBACK when no standalone toolIds exist.
   * - `analysisPlan` goes at the assistant level.
   * - `server` object with `url` + `credentialId` for lifecycle webhooks (replaces serverUrl/serverUrlSecret).
   */
  private buildAssistantPayload(config: VapiAssistantConfig) {
    // Clean voice: strip stability/similarityBoost, map elevenlabs → 11labs
    const voice: Record<string, unknown> = {
      provider: config.voice?.provider === 'elevenlabs' ? '11labs' : config.voice?.provider,
      voiceId: config.voice?.voiceId,
    };

    // Separate tools into standalone (referenced by ID) and inline
    const toolIds: string[] = config.toolIds || [];
    const inlineTools: unknown[] = [];

    if (config.tools && config.tools.length > 0) {
      for (const tool of config.tools) {
        const t = tool as any;

        if (t.type === 'transferCall') {
          if (t.destinations) {
            const validDests = t.destinations.filter((d: any) =>
              d.type !== 'number' || /^\+\d{10,15}$/.test(d.number),
            );
            if (validDests.length > 0) {
              inlineTools.push({ ...t, destinations: validDests });
            }
          } else {
            inlineTools.push(t);
          }
        } else if (t.type === 'endCall') {
          inlineTools.push(t);
        } else if (t.type === 'function') {
          // Function tools:
          // - If standalone toolIds are provided, function tools are referenced
          //   by ID (already in toolIds array) — skip inline.
          // - If NO toolIds exist (legacy/fallback mode), keep function tools
          //   inline in model.tools so they still work.
          if (toolIds.length === 0) {
            inlineTools.push(t);
          }
        }
      }
    }

    // Build model config
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

    // Standalone tools referenced by ID
    if (toolIds.length > 0) {
      modelConfig.toolIds = toolIds;
    }

    // Inline tools (transferCall, endCall, and function tools in fallback mode)
    if (inlineTools.length > 0) {
      modelConfig.tools = inlineTools;
    }

    const payload: Record<string, unknown> = {
      name: config.name,
      voice,
      model: modelConfig,
      endCallFunctionEnabled: config.endCallFunctionEnabled ?? true,
      recordingEnabled: config.recordingEnabled ?? true,
    };

    if (config.firstMessage !== undefined) {
      payload.firstMessage = config.firstMessage;
    }
    if (config.firstMessageMode) {
      payload.firstMessageMode = config.firstMessageMode;
    }

    // Server config: prefer credentialId-based `server` object (Vapi best practice).
    // Falls back to legacy serverUrl/serverUrlSecret if no credentialId.
    if (config.serverUrl) {
      if (config.credentialId) {
        payload.server = {
          url: config.serverUrl,
          credentialId: config.credentialId,
        };
      } else if (config.serverUrlSecret) {
        payload.server = {
          url: config.serverUrl,
          secret: config.serverUrlSecret,
        };
      } else {
        payload.server = {
          url: config.serverUrl,
        };
      }
    }

    if (config.startSpeakingPlan) {
      payload.startSpeakingPlan = config.startSpeakingPlan;
    }
    if (config.stopSpeakingPlan) {
      payload.stopSpeakingPlan = config.stopSpeakingPlan;
    }

    // Analysis plan (structured output)
    if (config.analysisPlan) {
      payload.analysisPlan = config.analysisPlan;
    } else if (config.analysisSchema) {
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
      const modelToolIds = (builtPayload as any).model?.toolIds || [];
      const modelInlineTools = (builtPayload as any).model?.tools || [];
      const serverConfig = (builtPayload as any).server;
      const analysisPlan = (builtPayload as any).analysisPlan;

      logger.info({
        name: config.name,
        standaloneToolIds: modelToolIds.length,
        standaloneToolIdList: modelToolIds.slice(0, 5),
        inlineToolCount: modelInlineTools.length,
        inlineToolTypes: modelInlineTools.map((t: any) => t.type || t.function?.name).slice(0, 10),
        hasAnalysisPlan: !!analysisPlan,
        hasStructuredDataPlan: !!analysisPlan?.structuredDataPlan,
        structuredDataEnabled: analysisPlan?.structuredDataPlan?.enabled,
        summaryEnabled: analysisPlan?.summaryPlan?.enabled,
        serverUrl: serverConfig?.url,
        hasCredentialId: !!serverConfig?.credentialId,
        hasServerSecret: !!serverConfig?.secret,
      }, '[Vapi] Creating assistant — sending to Vapi API');

      const maxRetries = 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(`${this.baseUrl}/assistant`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(builtPayload),
        });

        if (response.status === 429 && attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt + 1), 10000);
          logger.warn({
            attempt: attempt + 1,
            backoffMs,
            name: config.name,
          }, '[Vapi] Rate limited creating assistant, retrying after backoff');
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

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
      }

      logger.error({ name: config.name }, '[Vapi] Exhausted retries creating assistant');
      return null;
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

      const body = await response.json();

      // Handle paginated response format (Vapi may return { results: [...] })
      if (Array.isArray(body)) {
        return body;
      }
      if (body && Array.isArray(body.results)) {
        return body.results;
      }
      if (body && Array.isArray(body.data)) {
        return body.data;
      }

      logger.warn({
        bodyType: typeof body,
        hasResults: !!body?.results,
        hasData: !!body?.data,
      }, '[Vapi] Unexpected response shape from list calls');
      return [];
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

  // ==========================================================================
  // Structured Output Management
  //
  // Standalone structured outputs created via POST /structured-output appear in
  // the Vapi dashboard Analysis tab and are linked to assistants by ID.
  // ==========================================================================

  /**
   * Create a standalone structured output in Vapi.
   * POST /structured-output
   */
  async createStructuredOutput(
    params: CreateStructuredOutputParams,
  ): Promise<VapiStructuredOutput | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        name: params.name,
        assistantCount: params.assistantIds?.length || 0,
      }, '[Vapi] Creating structured output');

      const response = await fetch(`${this.baseUrl}/structured-output`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          name: params.name,
        }, '[Vapi] Failed to create structured output');
        return null;
      }

      const output = await response.json();

      logger.info({
        structuredOutputId: output.id,
        name: output.name,
      }, '[Vapi] Successfully created structured output');

      return output;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while creating structured output');

      return null;
    }
  }

  /**
   * Update a structured output.
   * PATCH /structured-output/{id}
   */
  async updateStructuredOutput(
    id: string,
    updates: Partial<CreateStructuredOutputParams>,
  ): Promise<VapiStructuredOutput | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    try {
      logger.info({
        structuredOutputId: id,
        hasSchemaUpdate: !!updates.schema,
        assistantCount: updates.assistantIds?.length,
      }, '[Vapi] Updating structured output');

      const response = await fetch(`${this.baseUrl}/structured-output/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          id,
        }, '[Vapi] Failed to update structured output');
        return null;
      }

      const output = await response.json();

      logger.info({
        structuredOutputId: output.id,
        name: output.name,
      }, '[Vapi] Successfully updated structured output');

      return output;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        id,
      }, '[Vapi] Exception while updating structured output');

      return null;
    }
  }

  /**
   * List all structured outputs in the Vapi account.
   * GET /structured-output
   */
  async listStructuredOutputs(): Promise<VapiStructuredOutput[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/structured-output?limit=100`, {
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
        }, '[Vapi] Failed to list structured outputs');
        return [];
      }

      const body = await response.json();

      // Vapi returns a paginated response: { results: [...], metadata: {...} }
      if (Array.isArray(body)) {
        return body;
      }
      if (body && Array.isArray(body.results)) {
        return body.results;
      }
      if (body && Array.isArray(body.data)) {
        return body.data;
      }

      logger.warn({
        bodyType: typeof body,
        hasResults: !!body?.results,
        hasData: !!body?.data,
      }, '[Vapi] Unexpected response shape from list structured outputs');
      return [];
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing structured outputs');

      return [];
    }
  }

  /**
   * Ensure the call analysis structured output exists and is linked to the given assistants.
   *
   * Idempotent: finds an existing output by name prefix (`parlae-dental-call-analysis`)
   * or creates a new one. Updates the linked assistantIds if they've changed.
   *
   * @param assistantIds - The IDs of assistants in the squad
   * @param schema - The JSON Schema for call analysis extraction
   * @param version - Template version for naming (e.g., "v2.3")
   * @returns The structured output ID, or null on failure
   */
  async ensureCallAnalysisOutput(
    assistantIds: string[],
    schema: Record<string, any>,
    version: string = 'v2.3',
  ): Promise<string | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    const namePrefix = 'parlae-dental-call-analysis';
    const targetName = `${namePrefix}-${version}`;

    try {
      // Check for existing structured output with matching name prefix
      const existingOutputs = await this.listStructuredOutputs();

      logger.info({
        existingCount: existingOutputs.length,
        targetName,
        assistantIds,
      }, '[Vapi] Checking for existing structured output');

      const existing = existingOutputs.find(
        (o) => o.name.startsWith(namePrefix),
      );

      if (existing) {
        // Always update with the current assistant IDs (replaces stale IDs from deleted squads)
        const currentIdsSet = new Set(existing.assistantIds || []);
        const newIdsSet = new Set(assistantIds);
        const needsUpdate =
          existing.name !== targetName ||
          assistantIds.some((id) => !currentIdsSet.has(id)) ||
          (existing.assistantIds || []).some((id: string) => !newIdsSet.has(id));

        if (needsUpdate) {
          // Replace (not merge) assistant IDs so stale references from deleted squads are removed
          const updated = await this.updateStructuredOutput(existing.id, {
            name: targetName,
            schema,
            assistantIds,
            description: `Extracts call outcomes, patient info, and actions for dental clinic calls (${version})`,
          });

          if (updated) {
            logger.info({
              structuredOutputId: updated.id,
              assistantCount: assistantIds.length,
              previousAssistantIds: existing.assistantIds,
              newAssistantIds: assistantIds,
            }, '[Vapi] Updated existing call analysis structured output');
            return updated.id;
          }

          logger.error({
            structuredOutputId: existing.id,
          }, '[Vapi] Failed to update existing structured output, will try to create new');
        } else {
          logger.info({
            structuredOutputId: existing.id,
          }, '[Vapi] Existing call analysis structured output is up to date');
          return existing.id;
        }
      }

      // Create new structured output
      logger.info({
        name: targetName,
        assistantIds,
        schemaType: schema?.type,
        propertyCount: schema?.properties ? Object.keys(schema.properties).length : 0,
      }, '[Vapi] Creating new call analysis structured output');

      const created = await this.createStructuredOutput({
        name: targetName,
        description: `Extracts call outcomes, patient info, and actions for dental clinic calls (${version})`,
        schema,
        assistantIds,
        compliancePlan: { forceStoreOnHipaaEnabled: false },
      });

      if (created) {
        logger.info({
          structuredOutputId: created.id,
          assistantCount: assistantIds.length,
        }, '[Vapi] Created call analysis structured output');
        return created.id;
      }

      logger.error('[Vapi] Failed to create call analysis structured output');
      return null;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        assistantIds,
        version,
      }, '[Vapi] Exception in ensureCallAnalysisOutput');
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

  // ==========================================================================
  // Standalone Tool Management
  //
  // Tools created via POST /tool show up in the Vapi dashboard's Tools UI
  // and can be shared across assistants via model.toolIds.
  // ==========================================================================

  /**
   * Create a standalone tool in Vapi.
   *
   * Returns the created tool object with `id`.
   */
  async createStandaloneTool(toolConfig: Record<string, unknown>): Promise<any | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return null;
    }

    const toolName = (toolConfig as any).function?.name || 'unknown';

    logger.info({
      toolName,
      type: toolConfig.type,
      hasServer: !!(toolConfig as any).server?.url,
    }, '[Vapi] Creating standalone tool');

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/tool`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(toolConfig),
        });

        if (response.status === 429 && attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt + 1), 10000);
          logger.warn({ attempt: attempt + 1, backoffMs, toolName }, '[Vapi] Rate limited creating tool, retrying');
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          logger.error({
            status: response.status,
            error: errorText,
            toolName,
          }, '[Vapi] Failed to create standalone tool');
          return null;
        }

        const tool = await response.json();
        logger.info({
          toolId: tool.id,
          toolName,
        }, '[Vapi] Standalone tool created');

        return tool;
      } catch (error) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        logger.error({
          error: error instanceof Error ? error.message : error,
        }, '[Vapi] Exception while creating standalone tool');
        return null;
      }
    }
    return null;
  }

  /**
   * List all standalone tools in the Vapi account.
   */
  async listTools(): Promise<any[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Vapi] Integration disabled - missing API key');
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/tool?limit=200`, {
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
        }, '[Vapi] Failed to list tools');
        return [];
      }

      const body = await response.json();

      // Handle paginated response format (Vapi may return { results: [...] })
      if (Array.isArray(body)) {
        return body;
      }
      if (body && Array.isArray(body.results)) {
        return body.results;
      }
      if (body && Array.isArray(body.data)) {
        return body.data;
      }

      logger.warn({
        bodyType: typeof body,
        hasResults: !!body?.results,
        hasData: !!body?.data,
      }, '[Vapi] Unexpected response shape from list tools');
      return [];
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : error,
      }, '[Vapi] Exception while listing tools');
      return [];
    }
  }

  // ==========================================================================
  // Credential Management
  //
  // Vapi Custom Credentials (Bearer Token, OAuth, HMAC) are configured in the
  // dashboard and referenced by ID in server configs.
  // ==========================================================================

  /**
   * List all custom credentials in the Vapi account.
   */
  async listCredentials(): Promise<any[]> {
    const logger = await getLogger();

    if (!this.enabled) return [];

    try {
      const response = await fetch(`${this.baseUrl}/credential?limit=100`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, '[Vapi] Failed to list credentials');
        return [];
      }

      return await response.json();
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, '[Vapi] Exception listing credentials');
      return [];
    }
  }

  /**
   * Find a credential by name prefix (case-insensitive).
   *
   * Useful for auto-detecting the production credential:
   * ```ts
   * const cred = await vapiService.findCredentialByName('parlae-production');
   * ```
   */
  async findCredentialByName(namePrefix: string): Promise<{ id: string; name: string } | null> {
    const logger = await getLogger();
    const credentials = await this.listCredentials();
    const lowerPrefix = namePrefix.toLowerCase();

    const match = credentials.find((c: any) =>
      c.name?.toLowerCase().includes(lowerPrefix),
    );

    if (match) {
      logger.info({
        credentialId: match.id,
        name: match.name,
      }, '[Vapi] Found matching credential');
      return { id: match.id, name: match.name };
    }

    logger.warn({ namePrefix, totalCredentials: credentials.length }, '[Vapi] No credential found matching name');
    return null;
  }

  /**
   * Update a standalone tool (PATCH /tool/{id}).
   * Used to add/change credentials or server config.
   */
  async updateTool(toolId: string, updates: Record<string, unknown>): Promise<any | null> {
    const logger = await getLogger();

    if (!this.enabled) return null;

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/tool/${toolId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });

        if (response.status === 429 && attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt + 1), 10000);
          logger.warn({ attempt: attempt + 1, backoffMs, toolId }, '[Vapi] Rate limited updating tool, retrying');
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          logger.error({ status: response.status, error: errorText, toolId }, '[Vapi] Failed to update tool');
          return null;
        }

        const tool = await response.json();
        logger.info({ toolId }, '[Vapi] Tool updated');
        return tool;
      } catch (error) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        logger.error({ error: error instanceof Error ? error.message : error, toolId }, '[Vapi] Exception updating tool');
        return null;
      }
    }
    return null;
  }

  /**
   * Delete a standalone tool by ID.
   */
  async deleteTool(toolId: string): Promise<boolean> {
    const logger = await getLogger();

    if (!this.enabled) return false;

    try {
      const response = await fetch(`${this.baseUrl}/tool/${toolId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        logger.error({ status: response.status, toolId }, '[Vapi] Failed to delete tool');
        return false;
      }

      logger.info({ toolId }, '[Vapi] Deleted standalone tool');
      return true;
    } catch (error) {
      logger.error({ error, toolId }, '[Vapi] Exception deleting tool');
      return false;
    }
  }

  /**
   * Ensure all PMS tools exist as standalone Vapi tool resources.
   *
   * Checks existing tools by function name. Creates any that are missing.
   * Returns a map of function name → Vapi tool ID.
   *
   * @param toolDefinitions - Array of tool objects (from vapi-pms-tools.config.ts)
   * @param version - Version string for naming (e.g., "v1.0")
   * @param credentialId - Optional Vapi Custom Credential ID for tool server auth
   */
  async ensureStandaloneTools(
    toolDefinitions: any[],
    version: string = 'v1.0',
    credentialId?: string,
  ): Promise<Map<string, string>> {
    const logger = await getLogger();
    const toolIdMap = new Map<string, string>();

    if (!this.enabled) return toolIdMap;

    // Fetch ALL existing tools
    const existingTools = await this.listTools();

    // Group existing tools by function name — detects duplicates
    const existingByName = new Map<string, any[]>();
    for (const tool of existingTools) {
      const funcName = tool.function?.name;
      if (funcName) {
        const list = existingByName.get(funcName) || [];
        list.push(tool);
        existingByName.set(funcName, list);
      }
    }

    // Collect the set of function names we need
    const requestedNames = new Set<string>();
    for (const td of toolDefinitions) {
      if (td.function?.name) requestedNames.add(td.function.name);
    }

    logger.info({
      existingCount: existingTools.length,
      requestedCount: toolDefinitions.length,
      hasCredentialId: !!credentialId,
      version,
    }, '[Vapi] Ensuring standalone tools exist');

    let apiCallCount = 0;

    const rateLimitDelay = async () => {
      apiCallCount++;
      if (apiCallCount > 0 && apiCallCount % 5 === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    // Build the desired server config once
    const buildServerConfig = (toolDef: any): Record<string, unknown> | undefined => {
      if (!toolDef.server) return undefined;
      if (credentialId) {
        return {
          url: toolDef.server.url,
          credentialId,
          ...(toolDef.server.timeoutSeconds ? { timeoutSeconds: toolDef.server.timeoutSeconds } : {}),
        };
      }
      return { ...toolDef.server };
    };

    // Build the version-tagged description
    const versionedDescription = (desc: string) => {
      // Strip any existing version tag like [v1.0] or [v2.4]
      const stripped = desc.replace(/^\[v[\d.]+\]\s*/, '');
      return `[${version}] ${stripped}`;
    };

    for (const toolDef of toolDefinitions) {
      const funcName = toolDef.function?.name;
      if (!funcName) continue;

      const existingList = existingByName.get(funcName) || [];
      const desiredServerConfig = buildServerConfig(toolDef);
      const desiredDescription = versionedDescription(toolDef.function.description);

      if (existingList.length > 0) {
        // Pick the tool to keep (prefer the most recent — last in array — or one with server config)
        const keeper = existingList.find((t) => t.server?.url || t.server?.credentialId)
          || existingList[existingList.length - 1];

        // Delete all duplicates (any tool with the same name that isn't the keeper)
        for (const dup of existingList) {
          if (dup.id === keeper.id) continue;
          await rateLimitDelay();
          const deleted = await this.deleteTool(dup.id);
          if (deleted) {
            logger.info({ funcName, toolId: dup.id }, '[Vapi] Deleted duplicate tool');
          }
        }

        // Always update the keeper with correct server config, description, and version
        const needsServerUpdate =
          JSON.stringify(keeper.server || {}) !== JSON.stringify(desiredServerConfig || {});
        const needsDescUpdate =
          keeper.function?.description !== desiredDescription;

        if (needsServerUpdate || needsDescUpdate) {
          await rateLimitDelay();
          const updates: Record<string, unknown> = {};

          if (needsServerUpdate && desiredServerConfig) {
            updates.server = desiredServerConfig;
          }
          if (needsDescUpdate) {
            updates.function = {
              ...keeper.function,
              description: desiredDescription,
            };
          }

          const patched = await this.updateTool(keeper.id, updates);
          if (patched) {
            logger.info({
              funcName,
              toolId: keeper.id,
              updatedServer: needsServerUpdate,
              updatedDesc: needsDescUpdate,
            }, '[Vapi] Updated existing tool');
          }
        }

        toolIdMap.set(funcName, keeper.id);
        continue;
      }

      // No existing tool — create a fresh one
      const standalonePayload: Record<string, unknown> = {
        type: toolDef.type || 'function',
        function: {
          name: funcName,
          description: desiredDescription,
          parameters: toolDef.function.parameters,
        },
      };

      if (desiredServerConfig) {
        standalonePayload.server = desiredServerConfig;
      }

      if (toolDef.messages && toolDef.messages.length > 0) {
        standalonePayload.messages = toolDef.messages;
      }

      if (toolDef.async !== undefined) {
        standalonePayload.async = toolDef.async;
      }

      await rateLimitDelay();
      const created = await this.createStandaloneTool(standalonePayload);
      if (created) {
        toolIdMap.set(funcName, created.id);
        logger.info({ funcName, toolId: created.id }, '[Vapi] Standalone tool created');
      } else {
        logger.error({ funcName }, '[Vapi] Failed to create standalone tool');
      }
    }

    logger.info({
      totalMapped: toolIdMap.size,
      tools: Object.fromEntries(toolIdMap),
    }, '[Vapi] Standalone tools resolved');

    return toolIdMap;
  }

  /**
   * Create or update a single Vapi query tool for a clinic's knowledge base.
   *
   * Each clinic gets one query tool named `kb-{accountIdPrefix}` containing
   * all of their uploaded files. This avoids cross-clinic contamination
   * (global names would overwrite each other).
   *
   * @param accountId - The clinic's account ID (used for namespacing)
   * @param fileIds - All Vapi file IDs for this clinic (across all categories)
   * @param version - Template version for description tagging
   * @param clinicName - Human-readable clinic name for the tool description
   * @returns { toolId, toolName } or null if no files / creation failed
   */
  async ensureClinicQueryTool(
    accountId: string,
    fileIds: string[],
    version: string = 'v2.0',
    clinicName: string = 'Clinic',
  ): Promise<{ toolId: string; toolName: string } | null> {
    const logger = await getLogger();

    if (!this.enabled || fileIds.length === 0) return null;

    const prefix = accountId.slice(0, 8);
    const toolName = `kb-${prefix}`;
    const description = `[${version}] Knowledge base for ${clinicName} — clinic info, services, insurance, providers, policies, and FAQs`;

    // Fetch existing tools to check if this clinic already has one
    const existingTools = await this.listTools();
    const existing = existingTools.find(
      (t: any) => t.function?.name === toolName,
    );

    if (existing) {
      // Update file IDs if they've changed
      const existingFileIds: string[] = existing.knowledgeBases?.[0]?.fileIds || [];
      const fileIdsChanged =
        JSON.stringify(existingFileIds.sort()) !== JSON.stringify([...fileIds].sort());

      if (fileIdsChanged) {
        await this.updateTool(existing.id, {
          knowledgeBases: [{
            provider: 'google',
            name: toolName,
            description,
            fileIds,
          }],
        });
        logger.info(
          { accountId: prefix, toolId: existing.id, fileCount: fileIds.length },
          '[Vapi] Updated clinic query tool file IDs',
        );
      } else {
        logger.info(
          { accountId: prefix, toolId: existing.id },
          '[Vapi] Clinic query tool already up to date',
        );
      }

      return { toolId: existing.id, toolName };
    }

    // Create new query tool for this clinic
    const queryToolPayload = {
      type: 'query',
      function: {
        name: toolName,
        description,
      },
      knowledgeBases: [{
        provider: 'google',
        name: toolName,
        description,
        fileIds,
      }],
    };

    const created = await this.createStandaloneTool(queryToolPayload);

    if (created) {
      logger.info(
        { accountId: prefix, toolId: created.id, toolName, fileCount: fileIds.length },
        '[Vapi] Clinic query tool created',
      );
      return { toolId: created.id, toolName };
    }

    logger.error({ accountId: prefix, toolName }, '[Vapi] Failed to create clinic query tool');
    return null;
  }
}

/**
 * Export a singleton instance
 */
export function createVapiService() {
  return new VapiService();
}
