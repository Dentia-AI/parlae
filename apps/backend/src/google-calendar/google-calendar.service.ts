import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauth2Client: any;

  constructor(private readonly prisma: PrismaService) {
    this.initializeOAuth();
  }

  private initializeOAuth() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-calendar/callback';

    if (!clientId || !clientSecret) {
      this.logger.warn('Google Calendar credentials not configured');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(accountId: string): string {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth not configured');
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: accountId, // Pass accountId in state to identify which account is connecting
      prompt: 'consent', // Force consent screen to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, accountId: string) {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth not configured');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Get user's email
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      // Get primary calendar ID
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      const calendars = await calendar.calendarList.list();
      const primaryCalendar = calendars.data.items?.find(cal => cal.primary);

      // Save tokens to database
      await this.prisma.account.update({
        where: { id: accountId },
        data: {
          googleCalendarConnected: true,
          googleCalendarAccessToken: tokens.access_token,
          googleCalendarRefreshToken: tokens.refresh_token,
          googleCalendarTokenExpiry: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
          googleCalendarId: primaryCalendar?.id || 'primary',
          googleCalendarEmail: userInfo.data.email,
        },
      });

      this.logger.log(`Google Calendar connected for account ${accountId}`);

      return {
        success: true,
        email: userInfo.data.email,
        calendarId: primaryCalendar?.id || 'primary',
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        googleCalendarRefreshToken: true,
        googleCalendarAccessToken: true,
      },
    });

    if (!account?.googleCalendarRefreshToken) {
      throw new Error('No refresh token available');
    }

    this.oauth2Client.setCredentials({
      refresh_token: account.googleCalendarRefreshToken,
    });

    const { credentials } = await this.oauth2Client.refreshAccessToken();

    // Update tokens in database
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        googleCalendarAccessToken: credentials.access_token,
        googleCalendarTokenExpiry: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : null,
      },
    });

    return credentials.access_token!;
  }

  /**
   * Get authenticated calendar client
   */
  private async getAuthenticatedClient(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        googleCalendarAccessToken: true,
        googleCalendarRefreshToken: true,
        googleCalendarTokenExpiry: true,
      },
    });

    if (!account?.googleCalendarAccessToken) {
      throw new Error('Google Calendar not connected');
    }

    // Check if token is expired
    const now = new Date();
    const expiry = account.googleCalendarTokenExpiry;
    
    let accessToken = account.googleCalendarAccessToken;

    if (expiry && expiry < now) {
      // Token expired, refresh it
      accessToken = await this.refreshAccessToken(accountId);
    }

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: account.googleCalendarRefreshToken,
    });

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create calendar event
   */
  async createEvent(
    accountId: string,
    event: {
      summary: string;
      description?: string;
      start: Date;
      end: Date;
      attendees?: string[];
    }
  ) {
    try {
      const calendar = await this.getAuthenticatedClient(accountId);

      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { googleCalendarId: true },
      });

      const calendarId = account?.googleCalendarId || 'primary';

      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: event.summary,
          description: event.description,
          start: {
            dateTime: event.start.toISOString(),
            timeZone: 'America/Toronto', // TODO: Make this configurable
          },
          end: {
            dateTime: event.end.toISOString(),
            timeZone: 'America/Toronto',
          },
          attendees: event.attendees?.map(email => ({ email })),
        },
      });

      this.logger.log(`Created calendar event: ${response.data.id}`);

      return {
        success: true,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
      };
    } catch (error) {
      this.logger.error('Failed to create calendar event', error);
      throw error;
    }
  }

  /**
   * Disconnect Google Calendar
   */
  async disconnect(accountId: string) {
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        googleCalendarConnected: false,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
        googleCalendarId: null,
        googleCalendarEmail: null,
      },
    });

    this.logger.log(`Google Calendar disconnected for account ${accountId}`);
  }

  /**
   * Check if Google Calendar is configured
   */
  isConfigured(): boolean {
    return !!this.oauth2Client;
  }
}
