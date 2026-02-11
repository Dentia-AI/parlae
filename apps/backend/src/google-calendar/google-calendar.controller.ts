import { Controller, Get, Post, Query, Body, UseGuards, Param } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';

@Controller('google-calendar')
@UseGuards(CognitoAuthGuard)
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Get OAuth authorization URL
   */
  @Get(':accountId/auth-url')
  getAuthUrl(@Param('accountId') accountId: string) {
    const url = this.googleCalendarService.getAuthUrl(accountId);
    return { authUrl: url };
  }

  /**
   * Handle OAuth callback (exchange code for tokens)
   */
  @Post(':accountId/callback')
  async handleCallback(
    @Param('accountId') accountId: string,
    @Body('code') code: string,
  ) {
    return await this.googleCalendarService.exchangeCodeForTokens(code, accountId);
  }

  /**
   * Disconnect Google Calendar
   */
  @Post(':accountId/disconnect')
  async disconnect(@Param('accountId') accountId: string) {
    await this.googleCalendarService.disconnect(accountId);
    return { success: true };
  }

  /**
   * Check if configured
   */
  @Get('configured')
  isConfigured() {
    return { configured: this.googleCalendarService.isConfigured() };
  }
}
