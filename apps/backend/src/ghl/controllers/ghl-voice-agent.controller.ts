import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { GhlVoiceAgentService, VoiceAgentConfig } from '../services/ghl-voice-agent.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';

@Controller('ghl/voice-agents')
@UseGuards(DevAuthGuard)
export class GhlVoiceAgentController {
  private readonly logger = new Logger(GhlVoiceAgentController.name);

  constructor(private readonly voiceAgentService: GhlVoiceAgentService) {}

  /**
   * Create a new voice agent
   * POST /ghl/voice-agents
   */
  @Post()
  async createVoiceAgent(
    @Body() data: { subAccountId: string; config: VoiceAgentConfig },
    @Request() req,
  ) {
    try {
      // Verify sub-account ownership
      const subAccount = await this.prisma.ghlSubAccount.findUnique({
        where: { id: data.subAccountId },
      });

      if (!subAccount || subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const voiceAgent = await this.voiceAgentService.createVoiceAgent(
        data.subAccountId,
        data.config,
      );

      return {
        success: true,
        data: voiceAgent,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error creating voice agent',
        error: error.message,
      });
      throw new HttpException(
        error.message || 'Failed to create voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get voice agent by ID
   * GET /ghl/voice-agents/:id
   */
  @Get(':id')
  async getVoiceAgent(@Param('id') id: string, @Request() req) {
    try {
      const voiceAgent = await this.voiceAgentService.getVoiceAgent(id);

      if (!voiceAgent) {
        throw new HttpException('Voice agent not found', HttpStatus.NOT_FOUND);
      }

      // Verify ownership through sub-account
      if (voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      return {
        success: true,
        data: voiceAgent,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error fetching voice agent',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get voice agents by sub-account
   * GET /ghl/voice-agents/sub-account/:subAccountId
   */
  @Get('sub-account/:subAccountId')
  async getVoiceAgentsBySubAccount(
    @Param('subAccountId') subAccountId: string,
    @Request() req,
  ) {
    try {
      // Verify sub-account ownership
      const subAccount = await this.prisma.ghlSubAccount.findUnique({
        where: { id: subAccountId },
      });

      if (!subAccount || subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const voiceAgents = await this.voiceAgentService.getVoiceAgentsBySubAccount(
        subAccountId,
      );

      return {
        success: true,
        data: voiceAgents,
        count: voiceAgents.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error fetching voice agents',
        error: error.message,
      });
      throw new HttpException(
        'Failed to fetch voice agents',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update voice agent
   * PATCH /ghl/voice-agents/:id
   */
  @Patch(':id')
  async updateVoiceAgent(
    @Param('id') id: string,
    @Body() config: Partial<VoiceAgentConfig>,
    @Request() req,
  ) {
    try {
      // Verify ownership
      const voiceAgent = await this.voiceAgentService.getVoiceAgent(id);

      if (!voiceAgent) {
        throw new HttpException('Voice agent not found', HttpStatus.NOT_FOUND);
      }

      if (voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const updated = await this.voiceAgentService.updateVoiceAgent(id, config);

      return {
        success: true,
        data: updated,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error updating voice agent',
        error: error.message,
      });
      throw new HttpException(
        'Failed to update voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Deploy voice agent to GHL
   * POST /ghl/voice-agents/:id/deploy
   */
  @Post(':id/deploy')
  async deployVoiceAgent(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const voiceAgent = await this.voiceAgentService.getVoiceAgent(id);

      if (!voiceAgent) {
        throw new HttpException('Voice agent not found', HttpStatus.NOT_FOUND);
      }

      if (voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const deployed = await this.voiceAgentService.deployVoiceAgent(id);

      return {
        success: true,
        data: deployed,
        message: 'Voice agent deployed successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error deploying voice agent',
        error: error.message,
      });
      throw new HttpException(
        error.message || 'Failed to deploy voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Pause voice agent
   * POST /ghl/voice-agents/:id/pause
   */
  @Post(':id/pause')
  async pauseVoiceAgent(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const voiceAgent = await this.voiceAgentService.getVoiceAgent(id);

      if (!voiceAgent) {
        throw new HttpException('Voice agent not found', HttpStatus.NOT_FOUND);
      }

      if (voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const paused = await this.voiceAgentService.pauseVoiceAgent(id);

      return {
        success: true,
        data: paused,
        message: 'Voice agent paused',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error pausing voice agent',
        error: error.message,
      });
      throw new HttpException(
        'Failed to pause voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Activate voice agent
   * POST /ghl/voice-agents/:id/activate
   */
  @Post(':id/activate')
  async activateVoiceAgent(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const voiceAgent = await this.voiceAgentService.getVoiceAgent(id);

      if (!voiceAgent) {
        throw new HttpException('Voice agent not found', HttpStatus.NOT_FOUND);
      }

      if (voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const activated = await this.voiceAgentService.activateVoiceAgent(id);

      return {
        success: true,
        data: activated,
        message: 'Voice agent activated',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error activating voice agent',
        error: error.message,
      });
      throw new HttpException(
        'Failed to activate voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete voice agent
   * DELETE /ghl/voice-agents/:id
   */
  @Delete(':id')
  async deleteVoiceAgent(@Param('id') id: string, @Request() req) {
    try {
      // Verify ownership
      const voiceAgent = await this.voiceAgentService.getVoiceAgent(id);

      if (!voiceAgent) {
        throw new HttpException('Voice agent not found', HttpStatus.NOT_FOUND);
      }

      if (voiceAgent.subAccount.userId !== req.user.id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }

      const deleted = await this.voiceAgentService.deleteVoiceAgent(id);

      return {
        success: true,
        data: deleted,
        message: 'Voice agent deleted',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Error deleting voice agent',
        error: error.message,
      });
      throw new HttpException(
        'Failed to delete voice agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Add prisma instance for verification
  private get prisma() {
    return (this.voiceAgentService as any).prisma;
  }
}
