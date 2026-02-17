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
   * Create appointment event with patient information
   * Enhanced version for booking appointments via AI
   */
  async createAppointmentEvent(
    accountId: string,
    appointment: {
      patient: {
        firstName: string;
        lastName: string;
        phone?: string;
        email?: string;
        dateOfBirth?: string;
      };
      appointmentType: string;
      startTime: Date;
      duration: number;
      notes?: string;
      providerId?: string;
    }
  ) {
    try {
      const calendar = await this.getAuthenticatedClient(accountId);

      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { googleCalendarId: true, name: true },
      });

      const calendarId = account?.googleCalendarId || 'primary';

      // Calculate end time
      const endTime = new Date(appointment.startTime);
      endTime.setMinutes(endTime.getMinutes() + appointment.duration);

      // Build event title
      const summary = `${appointment.appointmentType} - ${appointment.patient.firstName} ${appointment.patient.lastName}`;

      // Build description with patient info and notes
      let description = `**Patient Information**\n`;
      description += `Name: ${appointment.patient.firstName} ${appointment.patient.lastName}\n`;
      if (appointment.patient.phone) {
        description += `Phone: ${appointment.patient.phone}\n`;
      }
      if (appointment.patient.email) {
        description += `Email: ${appointment.patient.email}\n`;
      }
      if (appointment.patient.dateOfBirth) {
        description += `Date of Birth: ${appointment.patient.dateOfBirth}\n`;
      }
      description += `\n**Appointment Details**\n`;
      description += `Type: ${appointment.appointmentType}\n`;
      description += `Duration: ${appointment.duration} minutes\n`;
      if (appointment.providerId) {
        description += `Provider: ${appointment.providerId}\n`;
      }
      if (appointment.notes) {
        description += `\n**Notes from AI Call**\n${appointment.notes}\n`;
      }
      description += `\n📞 Booked via AI Receptionist`;

      // Prepare attendees
      const attendees: Array<{ email: string }> = [];
      if (appointment.patient.email) {
        attendees.push({ email: appointment.patient.email });
      }

      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          start: {
            dateTime: appointment.startTime.toISOString(),
            timeZone: 'America/Toronto', // TODO: Make this configurable
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'America/Toronto',
          },
          attendees: attendees.length > 0 ? attendees : undefined,
          colorId: '9', // Blue color for appointments
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 }, // 1 day before
              { method: 'popup', minutes: 60 }, // 1 hour before
            ],
          },
        },
      });

      this.logger.log({
        accountId,
        eventId: response.data.id,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        appointmentType: appointment.appointmentType,
        startTime: appointment.startTime,
        msg: 'Created appointment event in Google Calendar',
      });

      return {
        success: true,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
      };
    } catch (error) {
      this.logger.error('Failed to create appointment event', error);
      throw error;
    }
  }

  /**
   * Update calendar event
   */
  async updateEvent(
    accountId: string,
    eventId: string,
    updates: {
      summary?: string;
      description?: string;
      start?: Date;
      end?: Date;
    }
  ) {
    try {
      const calendar = await this.getAuthenticatedClient(accountId);

      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { googleCalendarId: true },
      });

      const calendarId = account?.googleCalendarId || 'primary';

      const updateData: any = {};
      if (updates.summary) updateData.summary = updates.summary;
      if (updates.description) updateData.description = updates.description;
      if (updates.start) {
        updateData.start = {
          dateTime: updates.start.toISOString(),
          timeZone: 'America/Toronto',
        };
      }
      if (updates.end) {
        updateData.end = {
          dateTime: updates.end.toISOString(),
          timeZone: 'America/Toronto',
        };
      }

      const response = await calendar.events.patch({
        calendarId,
        eventId,
        requestBody: updateData,
      });

      this.logger.log({
        accountId,
        eventId,
        msg: 'Updated calendar event',
      });

      return {
        success: true,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
      };
    } catch (error) {
      this.logger.error('Failed to update calendar event', error);
      throw error;
    }
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(accountId: string, eventId: string) {
    try {
      const calendar = await this.getAuthenticatedClient(accountId);

      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { googleCalendarId: true },
      });

      const calendarId = account?.googleCalendarId || 'primary';

      await calendar.events.delete({
        calendarId,
        eventId,
      });

      this.logger.log({
        accountId,
        eventId,
        msg: 'Deleted calendar event',
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to delete calendar event', error);
      throw error;
    }
  }

  /**
   * List calendar events in a date range
   * Used as fallback for getAppointments when PMS is not connected
   */
  async listEvents(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ) {
    try {
      const calendar = await this.getAuthenticatedClient(accountId);

      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { googleCalendarId: true },
      });

      const calendarId = account?.googleCalendarId || 'primary';

      const response = await calendar.events.list({
        calendarId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });

      const events = response.data.items || [];

      this.logger.log({
        accountId,
        eventCount: events.length,
        msg: 'Listed calendar events',
      });

      return {
        success: true,
        events: events.map((event) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          startTime: event.start?.dateTime || event.start?.date,
          endTime: event.end?.dateTime || event.end?.date,
          status: event.status,
          htmlLink: event.htmlLink,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to list calendar events', error);
      throw error;
    }
  }

  /**
   * Check free/busy time slots for availability
   * Used as fallback for checkAvailability when PMS is not connected
   */
  async checkFreeBusy(
    accountId: string,
    date: string, // YYYY-MM-DD
    durationMinutes: number = 30,
  ) {
    try {
      const calendar = await this.getAuthenticatedClient(accountId);

      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { googleCalendarId: true },
      });

      const calendarId = account?.googleCalendarId || 'primary';

      // Query the full business day (8am - 6pm)
      const dayStart = new Date(`${date}T08:00:00`);
      const dayEnd = new Date(`${date}T18:00:00`);

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          timeZone: 'America/Toronto', // TODO: Make configurable
          items: [{ id: calendarId }],
        },
      });

      const busySlots =
        response.data.calendars?.[calendarId]?.busy || [];

      // Generate available slots by finding gaps between busy periods
      const availableSlots: Array<{ startTime: string; endTime: string }> = [];
      let currentSlotStart = dayStart;

      for (const busy of busySlots) {
        const busyStart = new Date(busy.start!);
        const busyEnd = new Date(busy.end!);

        // If there's a gap before this busy slot that fits the requested duration
        const gapMinutes =
          (busyStart.getTime() - currentSlotStart.getTime()) / (1000 * 60);
        if (gapMinutes >= durationMinutes) {
          availableSlots.push({
            startTime: currentSlotStart.toISOString(),
            endTime: busyStart.toISOString(),
          });
        }

        // Move past this busy period
        if (busyEnd > currentSlotStart) {
          currentSlotStart = busyEnd;
        }
      }

      // Check for remaining time after last busy slot
      const remainingMinutes =
        (dayEnd.getTime() - currentSlotStart.getTime()) / (1000 * 60);
      if (remainingMinutes >= durationMinutes) {
        availableSlots.push({
          startTime: currentSlotStart.toISOString(),
          endTime: dayEnd.toISOString(),
        });
      }

      this.logger.log({
        accountId,
        date,
        busyCount: busySlots.length,
        availableCount: availableSlots.length,
        msg: 'Checked calendar availability',
      });

      return {
        success: true,
        availableSlots,
        busySlots: busySlots.map((b) => ({
          start: b.start,
          end: b.end,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to check calendar availability', error);
      throw error;
    }
  }

  /**
   * Find the next available appointment slots across multiple days.
   * Starts from `startDate` and scans up to `maxDaysToSearch` days forward,
   * returning as soon as `targetSlots` discrete slots are found.
   *
   * Each "slot" is the earliest available window on a given day that fits
   * the requested duration — giving the caller concrete options like
   * "Tomorrow at 10am, Wednesday at 2pm, or Friday at 9am".
   */
  async findNextAvailableSlots(
    accountId: string,
    startDate: string, // YYYY-MM-DD
    durationMinutes: number = 30,
    targetSlots: number = 3,
    maxDaysToSearch: number = 14,
  ) {
    const collectedSlots: Array<{
      date: string;
      startTime: string;
      endTime: string;
    }> = [];

    const current = new Date(`${startDate}T00:00:00`);

    for (let day = 0; day < maxDaysToSearch; day++) {
      const dateStr = current.toISOString().slice(0, 10);

      try {
        const result = await this.checkFreeBusy(accountId, dateStr, durationMinutes);

        if (result.success && result.availableSlots.length > 0) {
          // Take the first available window on this day
          const firstSlot = result.availableSlots[0];
          collectedSlots.push({
            date: dateStr,
            startTime: firstSlot.startTime,
            endTime: firstSlot.endTime,
          });

          if (collectedSlots.length >= targetSlots) break;
        }
      } catch {
        // Skip days that fail (e.g. API rate limit) and continue
      }

      current.setDate(current.getDate() + 1);
    }

    this.logger.log({
      accountId,
      startDate,
      daysSearched: Math.min(maxDaysToSearch, collectedSlots.length > 0 ? maxDaysToSearch : maxDaysToSearch),
      slotsFound: collectedSlots.length,
      msg: 'Multi-day availability search complete',
    });

    return {
      success: true,
      slots: collectedSlots,
    };
  }

  /**
   * Check if Google Calendar is connected for a given account
   */
  async isConnectedForAccount(accountId: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { googleCalendarConnected: true },
    });
    return account?.googleCalendarConnected === true;
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
