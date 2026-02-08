import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService} from '../../prisma/prisma.service';
import {
  KnowledgeBaseSource,
  type KnowledgeBase,
  type Prisma,
} from '@kit/prisma';

export interface CreateKnowledgeBaseDto {
  voiceAgentId: string;
  title: string;
  content: string;
  source: KnowledgeBaseSource;
  sourceUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

@Injectable()
export class GhlKnowledgeBaseService {
  private readonly logger = new Logger(GhlKnowledgeBaseService.name);
  private readonly ghlApiKey: string;
  private readonly ghlBaseUrl: string;

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
   * Create knowledge base entry
   */
  async createKnowledgeBase(
    data: CreateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    try {
      this.logger.log({
        message: 'Creating knowledge base entry',
        voiceAgentId: data.voiceAgentId,
        title: data.title,
        source: data.source,
      });

      const knowledgeBase = await this.prisma.knowledgeBase.create({
        data: {
          voiceAgentId: data.voiceAgentId,
          title: data.title,
          content: data.content,
          source: data.source,
          sourceUrl: data.sourceUrl,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileSize: data.fileSize,
          isProcessed: false,
        },
      });

      this.logger.log({
        message: 'Knowledge base entry created',
        knowledgeBaseId: knowledgeBase.id,
      });

      // Process content (vectorization, etc.)
      await this.processKnowledgeBase(knowledgeBase.id);

      return knowledgeBase;
    } catch (error) {
      this.logger.error({
        message: 'Error creating knowledge base',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process knowledge base content
   */
  private async processKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    try {
      this.logger.log({
        message: 'Processing knowledge base',
        knowledgeBaseId,
      });

      // TODO: Implement content processing
      // - Split into chunks
      // - Generate embeddings
      // - Store vectors

      // Mark as processed
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          isProcessed: true,
          updatedAt: new Date(),
        },
      });

      this.logger.log({
        message: 'Knowledge base processed',
        knowledgeBaseId,
      });
    } catch (error) {
      this.logger.error({
        message: 'Error processing knowledge base',
        error: error.message,
      });

      // Mark processing error
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          processingError: error.message,
        },
      });
    }
  }

  /**
   * Get knowledge base by voice agent
   */
  async getKnowledgeBaseByVoiceAgent(
    voiceAgentId: string,
  ): Promise<KnowledgeBase[]> {
    return this.prisma.knowledgeBase.findMany({
      where: { voiceAgentId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get knowledge base by ID
   */
  async getKnowledgeBaseById(id: string) {
    return this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        voiceAgent: {
          include: {
            subAccount: true,
          },
        },
      },
    });
  }

  /**
   * Update knowledge base
   */
  async updateKnowledgeBase(
    id: string,
    data: Partial<CreateKnowledgeBaseDto>,
  ): Promise<KnowledgeBase> {
    const updateData: Prisma.KnowledgeBaseUpdateInput = {};

    if (data.title) updateData.title = data.title;
    if (data.content) updateData.content = data.content;
    if (data.sourceUrl) updateData.sourceUrl = data.sourceUrl;

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete knowledge base entry
   */
  async deleteKnowledgeBase(id: string): Promise<KnowledgeBase> {
    try {
      const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
        where: { id },
      });

      if (knowledgeBase?.ghlResourceId) {
        // Delete from GHL
        await this.deleteFromGhl(knowledgeBase.ghlResourceId);
      }

      // Delete from database
      return this.prisma.knowledgeBase.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error({
        message: 'Error deleting knowledge base',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Upload knowledge base to GHL agent
   */
  async uploadToGhl(voiceAgentId: string): Promise<boolean> {
    try {
      const voiceAgent = await this.prisma.voiceAgent.findUnique({
        where: { id: voiceAgentId },
        include: {
          knowledgeBase: true,
        },
      });

      if (!voiceAgent?.ghlAgentId) {
        throw new Error('Voice agent not deployed to GHL');
      }

      this.logger.log({
        message: 'Uploading knowledge base to GHL',
        voiceAgentId,
        ghlAgentId: voiceAgent.ghlAgentId,
        knowledgeCount: voiceAgent.knowledgeBase.length,
      });

      // Upload each knowledge base entry to GHL
      for (const kb of voiceAgent.knowledgeBase) {
        if (!kb.isProcessed) {
          this.logger.warn({
            message: 'Skipping unprocessed knowledge base',
            knowledgeBaseId: kb.id,
          });
          continue;
        }

        const uploaded = await this.uploadKnowledgeToGhl(
          voiceAgent.ghlAgentId,
          kb,
        );

        if (uploaded) {
          // Update with GHL resource ID
          await this.prisma.knowledgeBase.update({
            where: { id: kb.id },
            data: {
              ghlResourceId: uploaded.resourceId,
            },
          });
        }
      }

      this.logger.log({
        message: 'Knowledge base uploaded to GHL',
        voiceAgentId,
      });

      return true;
    } catch (error) {
      this.logger.error({
        message: 'Error uploading knowledge base to GHL',
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Upload single knowledge base entry to GHL
   */
  private async uploadKnowledgeToGhl(
    ghlAgentId: string,
    knowledgeBase: KnowledgeBase,
  ): Promise<{ resourceId: string } | null> {
    try {
      const response = await fetch(
        `${this.ghlBaseUrl}/conversations/ai-agents/${ghlAgentId}/knowledge-base`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.ghlApiKey}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28',
          },
          body: JSON.stringify({
            title: knowledgeBase.title,
            content: knowledgeBase.content,
            source: knowledgeBase.source,
          }),
        },
      );

      if (!response.ok) {
        this.logger.error({
          message: 'Failed to upload knowledge to GHL',
          status: response.status,
        });
        return null;
      }

      const result = await response.json();
      return result.resource || null;
    } catch (error) {
      this.logger.error({
        message: 'Error uploading knowledge to GHL',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Delete knowledge from GHL
   */
  private async deleteFromGhl(ghlResourceId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.ghlBaseUrl}/conversations/ai-agents/knowledge-base/${ghlResourceId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.ghlApiKey}`,
            Version: '2021-07-28',
          },
        },
      );

      return response.ok;
    } catch (error) {
      this.logger.error({
        message: 'Error deleting knowledge from GHL',
        error: error.message,
      });
      return false;
    }
  }
}
