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
  };
  firstMessage?: string;
  firstMessageMode?: 'assistant-speaks-first' | 'assistant-waits-for-user' | 'assistant-speaks-first-with-model-generated-message';
  tools?: VapiTool[];
  endCallFunctionEnabled?: boolean;
  recordingEnabled?: boolean;
  serverUrl?: string;
  serverUrlSecret?: string;
  analysisSchema?: {
    type: 'object';
    properties: Record<string, any>;
  };
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
 * Vapi Call
 */
export interface VapiCall {
  id: string;
  assistantId: string;
  phoneNumberId?: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  recordingUrl?: string;
  analysis?: Record<string, any>;
  summary?: string;
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
   * Create a squad (multi-assistant workflow)
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

      const response = await fetch(`${this.baseUrl}/squad`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: config.name,
          members: config.members.map(member => ({
            // Use assistantId for existing assistants, assistant for inline configs
            ...(member.assistantId && { assistantId: member.assistantId }),
            ...(member.assistant && { assistant: this.buildAssistantPayload(member.assistant) }),
            ...(member.assistantDestinations && { assistantDestinations: member.assistantDestinations }),
          })),
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
   * Build assistant payload for API
   */
  private buildAssistantPayload(config: VapiAssistantConfig) {
    return {
      name: config.name,
      voice: config.voice,
      model: {
        provider: config.model.provider,
        model: config.model.model,
        messages: [{
          role: 'system',
          content: config.model.systemPrompt,
        }],
        temperature: config.model.temperature || 0.7,
        maxTokens: config.model.maxTokens || 500,
        ...(config.model.knowledgeBase && {
          knowledgeBase: config.model.knowledgeBase,
        }),
      },
      ...(config.firstMessage !== undefined && { firstMessage: config.firstMessage }),
      ...(config.firstMessageMode && { firstMessageMode: config.firstMessageMode }),
      ...(config.tools && { tools: config.tools }),
      endCallFunctionEnabled: config.endCallFunctionEnabled ?? true,
      recordingEnabled: config.recordingEnabled ?? true,
      ...(config.serverUrl && { 
        serverUrl: config.serverUrl,
        serverUrlSecret: config.serverUrlSecret,
      }),
      ...(config.analysisSchema && { analysisSchema: config.analysisSchema }),
      ...(config.startSpeakingPlan && { startSpeakingPlan: config.startSpeakingPlan }),
      ...(config.stopSpeakingPlan && { stopSpeakingPlan: config.stopSpeakingPlan }),
    };
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
      logger.info({
        name: config.name,
      }, '[Vapi] Creating assistant');

      const response = await fetch(`${this.baseUrl}/assistant`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildAssistantPayload(config)),
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
