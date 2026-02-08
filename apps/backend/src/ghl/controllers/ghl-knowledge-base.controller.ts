import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  GhlKnowledgeBaseService,
  CreateKnowledgeBaseDto,
} from '../services/ghl-knowledge-base.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('ghl/knowledge-base')
@UseGuards(DevAuthGuard)
export class GhlKnowledgeBaseController {
  private readonly logger = new Logger(GhlKnowledgeBaseController.name);

  constructor(
    private readonly knowledgeBaseService: GhlKnowledgeBaseService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create knowledge base entry
   * POST /ghl/knowledge-base
   */
  @Post()
  async createKnowledgeBase(
    @Body() data: CreateKnowledgeBaseDto,
    @Request() req,
  ) {
    try {
      // Verify voice agent ownership
      const voiceAgent = await this.prisma.voiceAgent.findUnique({
        where: { id: data.voiceAgentId },
        include: { subAccount: true },
      });

      if (!voiceAgent || voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const knowledgeBase = await this.knowledgeBaseService.createKnowledgeBase(
        data,
      );

      return {
        success: true,
        data: knowledgeBase,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error creating knowledge base',
        error: error.message,
      });
      throw new HttpException(
        'Failed to create knowledge base',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get knowledge base entries for voice agent
   * GET /ghl/knowledge-base/voice-agent/:voiceAgentId
   */
  @Get('voice-agent/:voiceAgentId')
  async getKnowledgeBaseByVoiceAgent(
    @Param('voiceAgentId') voiceAgentId: string,
    @Request() req,
  ) {
    try {
      // Verify ownership
      const voiceAgent = await this.prisma.voiceAgent.findUnique({
        where: { id: voiceAgentId },
        include: { subAccount: true },
      });

      if (!voiceAgent || voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const knowledgeBase = await this.knowledgeBaseService.getKnowledgeBaseByVoiceAgent(
        voiceAgentId,
      );

      return {
        success: true,
        data: knowledgeBase,
        count: knowledgeBase.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error fetching knowledge base',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch knowledge base',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete knowledge base entry
   * DELETE /ghl/knowledge-base/:id
   */
  @Delete(':id')
  async deleteKnowledgeBase(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const knowledgeBase = await this.knowledgeBaseService.getKnowledgeBaseById(
        id,
      );

      if (!knowledgeBase || knowledgeBase.voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const deleted = await this.knowledgeBaseService.deleteKnowledgeBase(id);

      return {
        success: true,
        data: deleted,
        message: 'Knowledge base entry deleted',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error deleting knowledge base',
        error: error.message,
      });
      throw new HttpException(
        'Failed to delete knowledge base',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Upload knowledge base to GHL agent
   * POST /ghl/knowledge-base/voice-agent/:voiceAgentId/upload
   */
  @Post('voice-agent/:voiceAgentId/upload')
  async uploadKnowledgeBaseToGhl(
    @Param('voiceAgentId') voiceAgentId: string,
    @Request() req,
  ) {
    try {
      // Verify ownership
      const voiceAgent = await this.prisma.voiceAgent.findUnique({
        where: { id: voiceAgentId },
        include: { subAccount: true },
      });

      if (!voiceAgent || voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const success = await this.knowledgeBaseService.uploadToGhl(voiceAgentId);

      if (!success) {
        throw new HttpException(
          'Failed to upload knowledge base to GHL',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message: 'Knowledge base uploaded to GHL',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error uploading knowledge base',
        error: error.message,
      });
      throw new HttpException(
        'Failed to upload knowledge base',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
