import { Controller, Post, Get, Body, UseGuards, Req, Logger, HttpException, HttpStatus, Headers, Query } from '@nestjs/common';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { PmsService } from './pms.service';
import { SetupPmsDto } from './dto/setup-pms.dto';
import { SikkaAuthWebhookDto } from './dto/sikka-auth-webhook.dto';

@Controller('pms')
export class PmsController {
  private readonly logger = new Logger(PmsController.name);

  constructor(private readonly pmsService: PmsService) {}

  /**
   * User initiates PMS connection from frontend
   * Requires authentication
   */
  @Post('setup')
  @UseGuards(CognitoAuthGuard)
  async setupPms(@Body() dto: SetupPmsDto, @Req() req: any) {
    this.logger.log(`PMS setup request from user: ${req.user.sub}`);
    const userId = req.user.sub; // From Cognito JWT
    return this.pmsService.setupPmsIntegration(userId, dto);
  }

  @Get('status')
  @UseGuards(CognitoAuthGuard)
  async getStatus(@Req() req: any) {
    const userId = req.user.sub;
    return this.pmsService.getPmsStatus(userId);
  }

  /**
   * Check PMS connection status
   * Frontend polls this during OAuth flow to know when connection is complete
   */
  @Get('connection-status')
  @UseGuards(CognitoAuthGuard)
  async checkConnectionStatus(@Query('accountId') accountId: string, @Req() req: any) {
    if (!accountId) {
      throw new HttpException('Missing accountId parameter', HttpStatus.BAD_REQUEST);
    }
    return this.pmsService.getConnectionStatus(accountId);
  }

  /**
   * Sikka OAuth callback - user authorizes app via OAuth flow
   * This is the standard OAuth 2.0 callback endpoint
   * NOTE: This is now deprecated - frontend handles the callback
   * Keeping for backwards compatibility
   */
  @Get('sikka/oauth/callback')
  async handleSikkaOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ) {
    this.logger.log(`Sikka OAuth callback received (deprecated - use frontend callback)`);
    
    // Handle user denying authorization
    if (error) {
      this.logger.error(`Sikka OAuth error: ${error} - ${errorDescription}`);
      // Redirect back to frontend with error
      return {
        redirect: `${process.env.APP_BASE_URL}/home/agent/setup/integrations?status=error&error=${error}`,
      };
    }
    
    if (!code || !state) {
      throw new HttpException('Missing code or state', HttpStatus.BAD_REQUEST);
    }
    
    // Parse and verify state
    let stateData: { accountId: string; timestamp: number; nonce: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (err) {
      throw new HttpException('Invalid state parameter', HttpStatus.BAD_REQUEST);
    }
    
    // Verify timestamp (must be < 10 minutes old)
    const now = Date.now();
    const age = now - stateData.timestamp;
    if (age > 10 * 60 * 1000) {
      throw new HttpException('State expired', HttpStatus.BAD_REQUEST);
    }
    
    // TODO: Verify nonce hasn't been used (prevent replay attacks)
    // Store used nonces in Redis with TTL
    
    // Exchange code for credentials
    const result = await this.pmsService.handleSikkaOAuthCallback(
      code,
      stateData.accountId,
    );
    
    if (!result.success) {
      // Redirect to frontend with error status
      return {
        redirect: `${process.env.APP_BASE_URL}/home/agent/setup/integrations?status=error`,
      };
    }
    
    // Redirect back to frontend with success status
    return {
      redirect: `${process.env.APP_BASE_URL}/home/agent/setup/integrations?status=success`,
    };
  }

  /**
   * Exchange Sikka OAuth code for credentials
   * Called by frontend after OAuth redirect
   */
  @Post('sikka/exchange-code')
  async exchangeSikkaCode(
    @Body() body: { code: string; accountId: string },
  ) {
    this.logger.log(`Exchanging Sikka OAuth code for account ${body.accountId}`);
    
    if (!body.code || !body.accountId) {
      throw new HttpException('Missing code or accountId', HttpStatus.BAD_REQUEST);
    }
    
    // Exchange code for credentials (same logic as callback)
    const result = await this.pmsService.handleSikkaOAuthCallback(
      body.code,
      body.accountId,
    );
    
    return result;
  }
}
