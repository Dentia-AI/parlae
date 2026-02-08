import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { GhlMarketplaceService, InstalledAgentConfig } from '../services/ghl-marketplace.service';
import { CognitoAuthGuard } from '../../auth/cognito-auth.guard';
import { DevAuthGuard } from '../../auth/dev-auth.guard';

@Controller('ghl/marketplace')
@UseGuards(process.env.NODE_ENV === 'production' ? CognitoAuthGuard : DevAuthGuard)
export class GhlMarketplaceController {
  private readonly logger = new Logger(GhlMarketplaceController.name);

  constructor(private readonly marketplaceService: GhlMarketplaceService) {}

  /**
   * GET /ghl/marketplace/agents
   * Browse marketplace agents with optional filters
   */
  @Get('agents')
  async browseMarketplace(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('minRating') minRating?: string,
  ) {
    try {
      const agents = await this.marketplaceService.browseMarketplace({
        category,
        search,
        minRating: minRating ? parseFloat(minRating) : undefined,
      });

      return {
        success: true,
        agents,
        total: agents.length,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error browsing marketplace',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * GET /ghl/marketplace/agents/:agentId
   * Get detailed information about a specific marketplace agent
   */
  @Get('agents/:agentId')
  async getMarketplaceAgent(@Param('agentId') agentId: string) {
    try {
      const agent = await this.marketplaceService.getMarketplaceAgent(agentId);

      if (!agent) {
        return {
          success: false,
          error: 'Agent not found',
        };
      }

      return {
        success: true,
        agent,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error getting marketplace agent',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * GET /ghl/marketplace/categories
   * Get all available marketplace categories
   */
  @Get('categories')
  async getCategories() {
    try {
      const categories = await this.marketplaceService.getMarketplaceCategories();

      return {
        success: true,
        categories,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error getting categories',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * POST /ghl/marketplace/agents/install
   * Install a marketplace agent to a location
   */
  @Post('agents/install')
  async installAgent(
    @Body() body: {
      locationId: string;
      marketplaceAgentId: string;
      name?: string;
      voiceId?: string;
      phoneNumber?: string;
      customizations?: any;
    },
  ) {
    try {
      const config: InstalledAgentConfig = {
        marketplaceAgentId: body.marketplaceAgentId,
        name: body.name,
        voiceId: body.voiceId,
        phoneNumber: body.phoneNumber,
        customizations: body.customizations,
      };

      const installedAgent = await this.marketplaceService.installMarketplaceAgent(
        body.locationId,
        config,
      );

      return {
        success: true,
        agent: installedAgent,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error installing marketplace agent',
        error: error.message,
      });
      throw error;
    }
  }
}
