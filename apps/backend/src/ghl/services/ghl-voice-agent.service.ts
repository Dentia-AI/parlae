import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  VoiceAgentStatus,
  type VoiceAgent,
  type Prisma,
} from '@kit/prisma';

/**
 * Voice Agent Configuration Interface
 */
export interface VoiceAgentConfig {
  name: string;
  voiceId: string;
  voiceName?: string;
  phoneNumber?: string;
  language?: string;
  prompt?: string;
  greetingMessage?: string;
  personality?: string;
  businessHours?: BusinessHours;
  workflows?: WorkflowConfig;
  postCallActions?: PostCallActions;
  customFields?: Record<string, any>;
}

interface BusinessHours {
  timezone: string;
  schedule: {
    [key: string]: {
      open?: string;
      close?: string;
      closed?: boolean;
    };
  };
}

interface WorkflowConfig {
  appointmentBooking?: boolean;
  leadCapture?: boolean;
  informationRetrieval?: boolean;
  callTransfer?: boolean;
  voicemail?: boolean;
}

interface PostCallActions {
  sendSMS?: boolean;
  sendEmail?: boolean;
  updateCRM?: boolean;
  webhookNotification?: boolean;
  emailNotificationRecipients?: string[];
  webhookUrl?: string;
}

/**
 * GHL API Response for Voice Agent
 */
interface GhlVoiceAgentResponse {
  agent?: {
    id: string;
    name: string;
    voiceId: string;
    phoneNumber?: string;
    status: string;
    [key: string]: any;
  };
  error?: string;
  message?: string;
}

@Injectable()
export class GhlVoiceAgentService {
  private readonly logger = new Logger(GhlVoiceAgentService.name);
  private readonly ghlApiKey: string;
  private readonly ghlBaseUrl: string;

  // Preset configuration templates
  private readonly DEFAULT_PROMPT = `You are a professional and friendly AI assistant for {businessName}.

Your responsibilities:
1. Answer customer questions professionally and accurately
2. Schedule appointments when requested
3. Capture lead information (name, email, phone)
4. Provide business information from your knowledge base
5. Transfer calls to human agents when necessary

Always be:
- Polite and professional
- Clear and concise
- Helpful and solution-oriented
- Warm and personable

If you don't know something, be honest and offer to transfer to a human agent or take a message.`;

  private readonly DEFAULT_GREETING = "Thank you for calling {businessName}! How can I help you today?";

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.ghlApiKey = this.configService.get<string>('GHL_API_KEY') || '';
    this.ghlBaseUrl =
      this.configService.get<string>('GHL_BASE_URL') ||
      'https://services.leadconnectorhq.com';
  }

  /**
   * Create a voice agent (store locally)
   */
  async createVoiceAgent(
    subAccountId: string,
    config: VoiceAgentConfig,
  ): Promise<VoiceAgent> {
    try {
      this.logger.log({
        message: 'Creating voice agent',
        subAccountId,
        name: config.name,
      });

      // Get sub-account details
      const subAccount = await this.prisma.ghlSubAccount.findUnique({
        where: { id: subAccountId },
      });

      if (!subAccount) {
        throw new Error('Sub-account not found');
      }

      // Build prompt with business name
      const prompt = (config.prompt || this.DEFAULT_PROMPT)
        .replace(/{businessName}/g, subAccount.businessName);

      const greetingMessage = (config.greetingMessage || this.DEFAULT_GREETING)
        .replace(/{businessName}/g, subAccount.businessName);

      // Create default workflows
      const workflows: WorkflowConfig = {
        appointmentBooking: true,
        leadCapture: true,
        informationRetrieval: true,
        callTransfer: false,
        voicemail: true,
        ...config.workflows,
      };

      // Create default post-call actions
      const postCallActions: PostCallActions = {
        sendSMS: true,
        sendEmail: true,
        updateCRM: true,
        webhookNotification: true,
        ...config.postCallActions,
      };

      // Create default business hours
      const businessHours = config.businessHours || this.getDefaultBusinessHours(subAccount.timezone || 'America/New_York');

      // Create voice agent in database
      const voiceAgent = await this.prisma.voiceAgent.create({
        data: {
          subAccountId,
          name: config.name,
          voiceId: config.voiceId,
          voiceName: config.voiceName,
          phoneNumber: config.phoneNumber,
          language: config.language || 'en-US',
          prompt,
          personality: config.personality,
          greetingMessage,
          businessHours: businessHours as any,
          timezone: subAccount.timezone,
          workflows: workflows as any,
          postCallActions: postCallActions as any,
          customFields: config.customFields as any,
          status: VoiceAgentStatus.DRAFT,
          isDeployed: false,
        },
      });

      this.logger.log({
        message: 'Voice agent created in database',
        voiceAgentId: voiceAgent.id,
      });

      return voiceAgent;
    } catch (error) {
      this.logger.error({
        message: 'Error creating voice agent',
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Deploy voice agent to GHL
   */
  async deployVoiceAgent(voiceAgentId: string): Promise<VoiceAgent> {
    try {
      const voiceAgent = await this.prisma.voiceAgent.findUnique({
        where: { id: voiceAgentId },
        include: { subAccount: true },
      });

      if (!voiceAgent) {
        throw new Error('Voice agent not found');
      }

      this.logger.log({
        message: 'Deploying voice agent to GHL',
        voiceAgentId,
        ghlLocationId: voiceAgent.subAccount.ghlLocationId,
      });

      // Create voice agent in GHL
      const ghlAgent = await this.createGhlVoiceAgent(voiceAgent);

      if (!ghlAgent) {
        throw new Error('Failed to create agent in GHL');
      }

      // Update voice agent with GHL ID and activate
      const updatedAgent = await this.prisma.voiceAgent.update({
        where: { id: voiceAgentId },
        data: {
          ghlAgentId: ghlAgent.id,
          status: VoiceAgentStatus.ACTIVE,
          isDeployed: true,
          deployedAt: new Date(),
        },
      });

      this.logger.log({
        message: 'Voice agent deployed successfully',
        voiceAgentId,
        ghlAgentId: ghlAgent.id,
      });

      return updatedAgent;
    } catch (error) {
      this.logger.error({
        message: 'Error deploying voice agent',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create voice agent in GHL via API
   */
  private async createGhlVoiceAgent(
    voiceAgent: VoiceAgent & { subAccount: any },
  ): Promise<GhlVoiceAgentResponse['agent'] | null> {
    try {
      const payload = {
        locationId: voiceAgent.subAccount.ghlLocationId,
        name: voiceAgent.name,
        voiceId: voiceAgent.voiceId,
        phoneNumber: voiceAgent.phoneNumber,
        language: voiceAgent.language,
        prompt: voiceAgent.prompt,
        greetingMessage: voiceAgent.greetingMessage,
        businessHours: voiceAgent.businessHours,
        workflows: voiceAgent.workflows,
        postCallActions: voiceAgent.postCallActions,
      };

      this.logger.log({
        message: 'Calling GHL API to create voice agent',
        url: `${this.ghlBaseUrl}/conversations/ai-agents`,
      });

      const response = await fetch(
        `${this.ghlBaseUrl}/conversations/ai-agents`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.ghlApiKey}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28',
          },
          body: JSON.stringify(payload),
        },
      );

      const result = (await response.json()) as GhlVoiceAgentResponse;

      if (!response.ok) {
        this.logger.error({
          message: 'GHL API error',
          status: response.status,
          error: result.error || result.message,
        });
        return null;
      }

      return result.agent || null;
    } catch (error) {
      this.logger.error({
        message: 'Exception calling GHL API',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get voice agent by ID
   */
  async getVoiceAgent(id: string) {
    return this.prisma.voiceAgent.findUnique({
      where: { id },
      include: {
        subAccount: true,
        knowledgeBase: true,
      },
    });
  }

  /**
   * Get voice agents by sub-account
   */
  async getVoiceAgentsBySubAccount(subAccountId: string): Promise<VoiceAgent[]> {
    return this.prisma.voiceAgent.findMany({
      where: { subAccountId },
      include: {
        knowledgeBase: {
          select: {
            id: true,
            title: true,
            source: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Update voice agent
   */
  async updateVoiceAgent(
    id: string,
    config: Partial<VoiceAgentConfig>,
  ): Promise<VoiceAgent> {
    const updateData: Prisma.VoiceAgentUpdateInput = {};

    if (config.name) updateData.name = config.name;
    if (config.voiceId) updateData.voiceId = config.voiceId;
    if (config.voiceName) updateData.voiceName = config.voiceName;
    if (config.phoneNumber) updateData.phoneNumber = config.phoneNumber;
    if (config.language) updateData.language = config.language;
    if (config.prompt) updateData.prompt = config.prompt;
    if (config.greetingMessage) updateData.greetingMessage = config.greetingMessage;
    if (config.personality) updateData.personality = config.personality;
    if (config.businessHours) updateData.businessHours = config.businessHours as any;
    if (config.workflows) updateData.workflows = config.workflows as any;
    if (config.postCallActions) updateData.postCallActions = config.postCallActions as any;
    if (config.customFields) updateData.customFields = config.customFields as any;

    return this.prisma.voiceAgent.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Pause voice agent
   */
  async pauseVoiceAgent(id: string): Promise<VoiceAgent> {
    return this.prisma.voiceAgent.update({
      where: { id },
      data: {
        status: VoiceAgentStatus.PAUSED,
      },
    });
  }

  /**
   * Activate voice agent
   */
  async activateVoiceAgent(id: string): Promise<VoiceAgent> {
    return this.prisma.voiceAgent.update({
      where: { id },
      data: {
        status: VoiceAgentStatus.ACTIVE,
      },
    });
  }

  /**
   * Delete voice agent (soft delete - archive)
   */
  async deleteVoiceAgent(id: string): Promise<VoiceAgent> {
    return this.prisma.voiceAgent.update({
      where: { id },
      data: {
        status: VoiceAgentStatus.ARCHIVED,
      },
    });
  }

  /**
   * Get default business hours
   */
  private getDefaultBusinessHours(timezone: string): BusinessHours {
    return {
      timezone,
      schedule: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '09:00', close: '17:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '09:00', close: '17:00' },
        saturday: { closed: true },
        sunday: { closed: true },
      },
    };
  }
}
