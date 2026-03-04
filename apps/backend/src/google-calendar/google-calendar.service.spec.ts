import { Test, TestingModule } from '@nestjs/testing';
import { GoogleCalendarService } from './google-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

const mockInsert = jest.fn().mockResolvedValue({ data: { id: 'evt_1', htmlLink: 'https://cal/evt_1' } });
const mockPatch = jest.fn().mockResolvedValue({ data: { id: 'evt_1', htmlLink: 'https://cal/evt_1' } });
const mockDelete = jest.fn().mockResolvedValue({});
const mockGet = jest.fn().mockResolvedValue({
  data: {
    id: 'evt_1',
    summary: 'Cleaning - John Doe',
    description: 'Patient info',
    start: { dateTime: '2026-03-10T14:00:00' },
    end: { dateTime: '2026-03-10T14:30:00' },
  },
});
const mockList = jest.fn().mockResolvedValue({ data: { items: [] } });
const mockFreebusyQuery = jest.fn().mockResolvedValue({
  data: { calendars: { primary: { busy: [] } } },
});
const mockCalendarListList = jest.fn().mockResolvedValue({
  data: { items: [{ id: 'primary', primary: true }] },
});
const mockSetCredentials = jest.fn();
const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://auth.url');
const mockGetToken = jest.fn().mockResolvedValue({
  tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: Date.now() + 3600000 },
});
const mockRefreshAccessToken = jest.fn().mockResolvedValue({
  credentials: { access_token: 'new_at', expiry_date: Date.now() + 3600000 },
});

jest.mock('googleapis', () => {
  const mockCalendar = {
    events: {
      insert: (...args: any[]) => mockInsert(...args),
      patch: (...args: any[]) => mockPatch(...args),
      delete: (...args: any[]) => mockDelete(...args),
      get: (...args: any[]) => mockGet(...args),
      list: (...args: any[]) => mockList(...args),
    },
    freebusy: {
      query: (...args: any[]) => mockFreebusyQuery(...args),
    },
    calendarList: {
      list: (...args: any[]) => mockCalendarListList(...args),
    },
  };
  const mockOAuth2 = {
    generateAuthUrl: (...args: any[]) => mockGenerateAuthUrl(...args),
    getToken: (...args: any[]) => mockGetToken(...args),
    setCredentials: (...args: any[]) => mockSetCredentials(...args),
    refreshAccessToken: (...args: any[]) => mockRefreshAccessToken(...args),
  };
  return {
    google: {
      auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2) },
      calendar: jest.fn().mockReturnValue(mockCalendar),
      oauth2: jest.fn().mockReturnValue({
        userinfo: {
          get: jest.fn().mockResolvedValue({ data: { email: 'test@clinic.com' } }),
        },
      }),
    },
  };
});

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let prisma: any;

  /** Standard account mock with valid, non-expired token */
  const authenticatedAccount = {
    googleCalendarAccessToken: 'at',
    googleCalendarRefreshToken: 'rt',
    googleCalendarTokenExpiry: new Date(Date.now() + 3600000),
  };

  /** Helper: queue prisma.account.findUnique for getAuthenticatedClient + getAccountTimezone + calendarId */
  function mockAuthenticatedFlow(overrides?: Record<string, any>) {
    prisma.account.findUnique
      .mockResolvedValueOnce({ ...authenticatedAccount, ...overrides }) // getAuthenticatedClient
      .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' }) // getAccountTimezone
      .mockResolvedValueOnce({ googleCalendarId: 'primary' }); // calendarId lookup
  }

  /** Helper: queue for methods that skip getAccountTimezone (getEvent, deleteEvent) */
  function mockAuthAndCalendar(overrides?: Record<string, any>) {
    prisma.account.findUnique
      .mockResolvedValueOnce({ ...authenticatedAccount, ...overrides }) // getAuthenticatedClient
      .mockResolvedValueOnce({ googleCalendarId: 'cal-123' }); // calendarId lookup
  }

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/google-calendar/callback';

    const mockPrisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GoogleCalendarService>(GoogleCalendarService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── initializeOAuth / isConfigured ────────────────────────────────────

  describe('isConfigured', () => {
    it('should return true when OAuth is configured', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when credentials are missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GoogleCalendarService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const unconfiguredService = module.get<GoogleCalendarService>(GoogleCalendarService);
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });

  // ── getAuthUrl ────────────────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('should return auth URL', () => {
      const url = service.getAuthUrl('account-123');
      expect(url).toBe('https://auth.url');
    });

    it('should throw when OAuth is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GoogleCalendarService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const unconfigured = module.get<GoogleCalendarService>(GoogleCalendarService);
      expect(() => unconfigured.getAuthUrl('acc-1')).toThrow('Google OAuth not configured');
    });
  });

  // ── exchangeCodeForTokens ─────────────────────────────────────────────

  describe('exchangeCodeForTokens', () => {
    it('should exchange code and save tokens', async () => {
      prisma.account.update.mockResolvedValue({});
      const result = await service.exchangeCodeForTokens('auth-code', 'account-123');
      expect(result.success).toBe(true);
      expect(result.email).toBe('test@clinic.com');
      expect(prisma.account.update).toHaveBeenCalled();
    });

    it('should throw when OAuth is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GoogleCalendarService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const unconfigured = module.get<GoogleCalendarService>(GoogleCalendarService);
      await expect(unconfigured.exchangeCodeForTokens('code', 'acc-1')).rejects.toThrow(
        'Google OAuth not configured',
      );
    });

    it('should rethrow API errors', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('invalid_grant'));
      await expect(service.exchangeCodeForTokens('bad-code', 'acc-1')).rejects.toThrow(
        'invalid_grant',
      );
    });
  });

  // ── refreshAccessToken ────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('should refresh and save new token', async () => {
      prisma.account.findUnique.mockResolvedValue({ googleCalendarRefreshToken: 'rt' });
      prisma.account.update.mockResolvedValue({});

      const token = await service.refreshAccessToken('acc-1');
      expect(token).toBe('new_at');
      expect(prisma.account.update).toHaveBeenCalled();
    });

    it('should throw if no refresh token', async () => {
      prisma.account.findUnique.mockResolvedValue({ googleCalendarRefreshToken: null });
      await expect(service.refreshAccessToken('acc-1')).rejects.toThrow(
        'No refresh token available',
      );
    });

    it('should throw when account is not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.refreshAccessToken('missing')).rejects.toThrow(
        'No refresh token available',
      );
    });
  });

  // ── getAuthenticatedClient (via createEvent) ──────────────────────────

  describe('getAuthenticatedClient (token refresh)', () => {
    it('should throw when no access token exists', async () => {
      prisma.account.findUnique.mockResolvedValue({
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarTokenExpiry: null,
      });

      await expect(
        service.createEvent('acc-1', {
          summary: 'Test',
          start: new Date(),
          end: new Date(),
        }),
      ).rejects.toThrow('Google Calendar not connected');
    });

    it('should refresh expired token before making API call', async () => {
      const expiredAccount = {
        googleCalendarAccessToken: 'old_at',
        googleCalendarRefreshToken: 'rt',
        googleCalendarTokenExpiry: new Date(Date.now() - 60000), // expired 1 minute ago
      };

      prisma.account.findUnique
        .mockResolvedValueOnce(expiredAccount) // getAuthenticatedClient
        .mockResolvedValueOnce({ googleCalendarRefreshToken: 'rt' }) // refreshAccessToken → findUnique
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' }) // getAccountTimezone
        .mockResolvedValueOnce({ googleCalendarId: 'primary' }); // calendarId
      prisma.account.update.mockResolvedValue({});

      const result = await service.createEvent('acc-1', {
        summary: 'After Refresh',
        start: new Date('2026-03-10T10:00:00Z'),
        end: new Date('2026-03-10T11:00:00Z'),
      });

      expect(result.success).toBe(true);
      expect(mockRefreshAccessToken).toHaveBeenCalled();
    });
  });

  // ── isConnectedForAccount ─────────────────────────────────────────────

  describe('isConnectedForAccount', () => {
    it('should return true when connected', async () => {
      prisma.account.findUnique.mockResolvedValue({ googleCalendarConnected: true });
      expect(await service.isConnectedForAccount('acc-1')).toBe(true);
    });

    it('should return false when not connected', async () => {
      prisma.account.findUnique.mockResolvedValue({ googleCalendarConnected: false });
      expect(await service.isConnectedForAccount('acc-1')).toBe(false);
    });

    it('should return false when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      expect(await service.isConnectedForAccount('missing')).toBe(false);
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('should clear calendar fields', async () => {
      prisma.account.update.mockResolvedValue({});
      await service.disconnect('acc-1');
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleCalendarConnected: false,
            googleCalendarAccessToken: null,
            googleCalendarRefreshToken: null,
            googleCalendarTokenExpiry: null,
            googleCalendarId: null,
            googleCalendarEmail: null,
          }),
        }),
      );
    });
  });

  // ── createEvent ───────────────────────────────────────────────────────

  describe('createEvent', () => {
    it('should create calendar event', async () => {
      mockAuthenticatedFlow();

      const result = await service.createEvent('acc-1', {
        summary: 'Test Event',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T11:00:00Z'),
      });
      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_1');
    });

    it('should include attendees when provided', async () => {
      mockAuthenticatedFlow();

      await service.createEvent('acc-1', {
        summary: 'Meeting',
        start: new Date('2026-03-05T09:00:00Z'),
        end: new Date('2026-03-05T10:00:00Z'),
        attendees: ['alice@example.com', 'bob@example.com'],
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            attendees: [{ email: 'alice@example.com' }, { email: 'bob@example.com' }],
          }),
        }),
      );
    });

    it('should include description when provided', async () => {
      mockAuthenticatedFlow();

      await service.createEvent('acc-1', {
        summary: 'Event with notes',
        description: 'Important meeting notes',
        start: new Date('2026-03-05T09:00:00Z'),
        end: new Date('2026-03-05T10:00:00Z'),
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            description: 'Important meeting notes',
          }),
        }),
      );
    });

    it('should fall back to "primary" when no googleCalendarId', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: null });

      await service.createEvent('acc-1', {
        summary: 'Fallback',
        start: new Date(),
        end: new Date(),
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'primary' }),
      );
    });

    it('should rethrow API errors', async () => {
      mockAuthenticatedFlow();
      mockInsert.mockRejectedValueOnce(new Error('API quota exceeded'));

      await expect(
        service.createEvent('acc-1', {
          summary: 'Fail',
          start: new Date(),
          end: new Date(),
        }),
      ).rejects.toThrow('API quota exceeded');
    });
  });

  // ── createAppointmentEvent ────────────────────────────────────────────

  describe('createAppointmentEvent', () => {
    const fullAppointment = {
      patient: {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+14165551234',
        email: 'john@example.com',
        dateOfBirth: '1990-01-15',
      },
      appointmentType: 'Cleaning',
      startTime: new Date('2026-03-10T14:00:00Z'),
      duration: 30,
      notes: 'First visit',
      providerId: 'dr-smith',
    };

    it('should create an appointment event with full patient info', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount) // getAuthenticatedClient
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' }) // getAccountTimezone
        .mockResolvedValueOnce({ googleCalendarId: 'cal-1', googleCalendarEmail: 'doc@clinic.com', name: 'Clinic' });

      const result = await service.createAppointmentEvent('acc-1', fullAppointment);
      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_1');
      expect(result.htmlLink).toBe('https://cal/evt_1');
    });

    it('should build correct summary from appointment type and patient name', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', fullAppointment);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: 'Cleaning - John Doe',
          }),
        }),
      );
    });

    it('should include patient email as attendee when provided', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', fullAppointment);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            attendees: [{ email: 'john@example.com' }],
          }),
        }),
      );
    });

    it('should not include attendees when patient has no email', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      const noEmailAppt = {
        ...fullAppointment,
        patient: { firstName: 'Jane', lastName: 'Smith' },
      };

      await service.createAppointmentEvent('acc-1', noEmailAppt);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            attendees: undefined,
          }),
        }),
      );
    });

    it('should calculate end time from startTime + duration', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', {
        ...fullAppointment,
        startTime: new Date('2026-03-10T14:00:00Z'),
        duration: 60,
      });

      const callArgs = mockInsert.mock.calls[0][0];
      const startDt = callArgs.requestBody.start.dateTime;
      const endDt = callArgs.requestBody.end.dateTime;

      const startMs = new Date(startDt).getTime();
      const endMs = new Date(endDt).getTime();
      expect((endMs - startMs) / (1000 * 60)).toBe(60);
    });

    it('should include phone, DOB, provider, and notes in description', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', fullAppointment);

      const callArgs = mockInsert.mock.calls[0][0];
      const desc: string = callArgs.requestBody.description;
      expect(desc).toContain('Phone: +14165551234');
      expect(desc).toContain('Email: john@example.com');
      expect(desc).toContain('Date of Birth: 1990-01-15');
      expect(desc).toContain('Provider: dr-smith');
      expect(desc).toContain('First visit');
      expect(desc).toContain('Booked via AI Receptionist');
    });

    it('should omit optional fields from description when not provided', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', {
        patient: { firstName: 'Min', lastName: 'Imal' },
        appointmentType: 'Checkup',
        startTime: new Date('2026-03-10T09:00:00Z'),
        duration: 15,
      });

      const callArgs = mockInsert.mock.calls[0][0];
      const desc: string = callArgs.requestBody.description;
      expect(desc).not.toContain('Phone:');
      expect(desc).not.toContain('Email:');
      expect(desc).not.toContain('Date of Birth:');
      expect(desc).not.toContain('Provider:');
      expect(desc).not.toContain('Notes from AI Call');
    });

    it('should set blue color and reminder overrides', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', fullAppointment);

      const callArgs = mockInsert.mock.calls[0][0];
      expect(callArgs.requestBody.colorId).toBe('9');
      expect(callArgs.requestBody.reminders).toEqual({
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'popup', minutes: 60 },
        ],
      });
    });

    it('should fall back to "primary" when googleCalendarId is null', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: null })
        .mockResolvedValueOnce({ googleCalendarId: null, googleCalendarEmail: null, name: null });

      await service.createAppointmentEvent('acc-1', {
        patient: { firstName: 'A', lastName: 'B' },
        appointmentType: 'X',
        startTime: new Date(),
        duration: 15,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'primary' }),
      );
    });

    it('should rethrow API errors', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary', googleCalendarEmail: null, name: null });
      mockInsert.mockRejectedValueOnce(new Error('Insufficient permissions'));

      await expect(
        service.createAppointmentEvent('acc-1', fullAppointment),
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  // ── getEvent ──────────────────────────────────────────────────────────

  describe('getEvent', () => {
    it('should fetch and return event data', async () => {
      mockAuthAndCalendar();

      const result = await service.getEvent('acc-1', 'evt_1');

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_1');
      expect(result.summary).toBe('Cleaning - John Doe');
      expect(result.startDateTime).toBe('2026-03-10T14:00:00');
      expect(result.endDateTime).toBe('2026-03-10T14:30:00');
    });

    it('should return date fallback when dateTime is absent', async () => {
      mockAuthAndCalendar();
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'evt_allday',
          summary: 'All Day Event',
          start: { date: '2026-03-10' },
          end: { date: '2026-03-11' },
        },
      });

      const result = await service.getEvent('acc-1', 'evt_allday');
      expect(result.startDateTime).toBe('2026-03-10');
      expect(result.endDateTime).toBe('2026-03-11');
    });

    it('should return undefined for missing summary/description', async () => {
      mockAuthAndCalendar();
      mockGet.mockResolvedValueOnce({
        data: {
          id: 'evt_bare',
          start: { dateTime: '2026-03-10T10:00:00' },
          end: { dateTime: '2026-03-10T10:30:00' },
        },
      });

      const result = await service.getEvent('acc-1', 'evt_bare');
      expect(result.summary).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it('should return success: false on error', async () => {
      mockAuthAndCalendar();
      mockGet.mockRejectedValueOnce(new Error('Not Found'));

      const result = await service.getEvent('acc-1', 'bad-id');
      expect(result.success).toBe(false);
    });

    it('should fall back to "primary" when googleCalendarId is null', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ googleCalendarId: null });

      await service.getEvent('acc-1', 'evt_1');

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'primary' }),
      );
    });
  });

  // ── updateEvent ───────────────────────────────────────────────────────

  describe('updateEvent', () => {
    it('should update event with all fields', async () => {
      mockAuthenticatedFlow();

      const result = await service.updateEvent('acc-1', 'evt_1', {
        summary: 'Updated Title',
        description: 'Updated notes',
        start: new Date('2026-03-10T15:00:00Z'),
        end: new Date('2026-03-10T16:00:00Z'),
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_1');
      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          eventId: 'evt_1',
          requestBody: expect.objectContaining({
            summary: 'Updated Title',
            description: 'Updated notes',
          }),
        }),
      );
    });

    it('should only include fields that are provided', async () => {
      mockAuthenticatedFlow();

      await service.updateEvent('acc-1', 'evt_1', {
        description: 'Only notes changed',
      });

      const callArgs = mockPatch.mock.calls[0][0];
      expect(callArgs.requestBody).toEqual({ description: 'Only notes changed' });
      expect(callArgs.requestBody.summary).toBeUndefined();
      expect(callArgs.requestBody.start).toBeUndefined();
      expect(callArgs.requestBody.end).toBeUndefined();
    });

    it('should use account timezone for start/end', async () => {
      mockAuthenticatedFlow();

      await service.updateEvent('acc-1', 'evt_1', {
        start: new Date('2026-03-10T10:00:00Z'),
        end: new Date('2026-03-10T11:00:00Z'),
      });

      const callArgs = mockPatch.mock.calls[0][0];
      expect(callArgs.requestBody.start.timeZone).toBe('America/Toronto');
      expect(callArgs.requestBody.end.timeZone).toBe('America/Toronto');
    });

    it('should rethrow API errors', async () => {
      mockAuthenticatedFlow();
      mockPatch.mockRejectedValueOnce(new Error('Event not found'));

      await expect(
        service.updateEvent('acc-1', 'evt_1', { summary: 'X' }),
      ).rejects.toThrow('Event not found');
    });
  });

  // ── deleteEvent ───────────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('should delete event and return success', async () => {
      mockAuthAndCalendar();

      const result = await service.deleteEvent('acc-1', 'evt_1');

      expect(result.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'cal-123',
          eventId: 'evt_1',
        }),
      );
    });

    it('should fall back to "primary" when googleCalendarId is null', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ googleCalendarId: null });

      await service.deleteEvent('acc-1', 'evt_1');

      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'primary' }),
      );
    });

    it('should rethrow API errors', async () => {
      mockAuthAndCalendar();
      mockDelete.mockRejectedValueOnce(new Error('Gone'));

      await expect(service.deleteEvent('acc-1', 'evt_1')).rejects.toThrow('Gone');
    });
  });

  // ── listEvents ────────────────────────────────────────────────────────

  describe('listEvents', () => {
    it('should list events in date range', async () => {
      mockAuthAndCalendar();
      mockList.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'e1',
              summary: 'Checkup',
              description: 'desc',
              start: { dateTime: '2026-03-10T09:00:00' },
              end: { dateTime: '2026-03-10T09:30:00' },
              status: 'confirmed',
              htmlLink: 'https://cal/e1',
            },
          ],
        },
      });

      const result = await service.listEvents(
        'acc-1',
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toEqual(
        expect.objectContaining({
          id: 'e1',
          summary: 'Checkup',
          startTime: '2026-03-10T09:00:00',
          endTime: '2026-03-10T09:30:00',
          status: 'confirmed',
        }),
      );
    });

    it('should return empty array when no events', async () => {
      mockAuthAndCalendar();
      mockList.mockResolvedValueOnce({ data: { items: [] } });

      const result = await service.listEvents(
        'acc-1',
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );
      expect(result.events).toEqual([]);
    });

    it('should handle items being undefined', async () => {
      mockAuthAndCalendar();
      mockList.mockResolvedValueOnce({ data: {} });

      const result = await service.listEvents(
        'acc-1',
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );
      expect(result.events).toEqual([]);
    });

    it('should map all-day events using date fallback', async () => {
      mockAuthAndCalendar();
      mockList.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'allday',
              summary: 'Conference',
              start: { date: '2026-03-15' },
              end: { date: '2026-03-16' },
              status: 'confirmed',
            },
          ],
        },
      });

      const result = await service.listEvents(
        'acc-1',
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      );
      expect(result.events[0].startTime).toBe('2026-03-15');
    });

    it('should rethrow API errors', async () => {
      mockAuthAndCalendar();
      mockList.mockRejectedValueOnce(new Error('API error'));

      await expect(
        service.listEvents('acc-1', new Date(), new Date()),
      ).rejects.toThrow('API error');
    });
  });

  // ── findEventsByPatient ───────────────────────────────────────────────

  describe('findEventsByPatient', () => {
    const sampleEvents = [
      {
        id: 'e1',
        summary: 'Cleaning - John Doe',
        description: 'Phone: +14165551234\nEmail: john@example.com',
        startTime: '2026-03-10T10:00:00',
        endTime: '2026-03-10T10:30:00',
        status: 'confirmed',
        htmlLink: 'https://cal/e1',
      },
      {
        id: 'e2',
        summary: 'Checkup - Jane Smith',
        description: 'Phone: +14165559999\nEmail: jane@example.com',
        startTime: '2026-03-11T11:00:00',
        endTime: '2026-03-11T11:30:00',
        status: 'confirmed',
        htmlLink: 'https://cal/e2',
      },
    ];

    function mockListEventsForFind() {
      mockAuthAndCalendar();
      mockList.mockResolvedValueOnce({
        data: {
          items: sampleEvents.map((e) => ({
            id: e.id,
            summary: e.summary,
            description: e.description,
            start: { dateTime: e.startTime },
            end: { dateTime: e.endTime },
            status: e.status,
            htmlLink: e.htmlLink,
          })),
        },
      });
    }

    it('should match by patient name', async () => {
      mockListEventsForFind();

      const result = await service.findEventsByPatient('acc-1', {
        patientName: 'John Doe',
      });

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('e1');
    });

    it('should match by patient email (case-insensitive)', async () => {
      mockListEventsForFind();

      const result = await service.findEventsByPatient('acc-1', {
        patientEmail: 'JANE@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('e2');
    });

    it('should match by patient phone (digits only)', async () => {
      mockListEventsForFind();

      const result = await service.findEventsByPatient('acc-1', {
        patientPhone: '(416) 555-1234',
      });

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('e1');
    });

    it('should not match short phone numbers (< 7 digits)', async () => {
      mockListEventsForFind();

      const result = await service.findEventsByPatient('acc-1', {
        patientPhone: '123',
      });

      expect(result.events).toHaveLength(0);
    });

    it('should return empty when no filters match', async () => {
      mockListEventsForFind();

      const result = await service.findEventsByPatient('acc-1', {
        patientName: 'Nobody',
      });

      expect(result.events).toHaveLength(0);
    });

    it('should use default date range when none provided', async () => {
      mockListEventsForFind();

      await service.findEventsByPatient('acc-1', { patientName: 'John' });

      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          singleEvents: true,
          orderBy: 'startTime',
        }),
      );
    });

    it('should use custom date range when provided', async () => {
      mockListEventsForFind();

      const start = new Date('2026-01-01');
      const end = new Date('2026-06-01');
      await service.findEventsByPatient(
        'acc-1',
        { patientName: 'John' },
        start,
        end,
      );

      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
        }),
      );
    });
  });

  // ── checkFreeBusy ─────────────────────────────────────────────────────

  describe('checkFreeBusy', () => {
    it('should return available slots when calendar is empty', async () => {
      mockAuthenticatedFlow();
      mockFreebusyQuery.mockResolvedValueOnce({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkFreeBusy('acc-1', '2026-03-10', 30);

      expect(result.success).toBe(true);
      expect(result.timezone).toBe('America/Toronto');
      expect(result.availableSlots.length).toBeGreaterThanOrEqual(1);
      expect(result.busySlots).toEqual([]);
    });

    it('should find gaps between busy slots', async () => {
      mockAuthenticatedFlow();
      mockFreebusyQuery.mockResolvedValueOnce({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: '2026-03-10T14:00:00Z', end: '2026-03-10T15:00:00Z' },
              ],
            },
          },
        },
      });

      const result = await service.checkFreeBusy('acc-1', '2026-03-10', 30);

      expect(result.success).toBe(true);
      expect(result.busySlots).toHaveLength(1);
      expect(result.availableSlots.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect duration filter — skip gaps smaller than duration', async () => {
      mockAuthenticatedFlow();

      const dayStart = new Date('2026-03-10T13:00:00Z');
      const busyStart = new Date(dayStart.getTime() + 10 * 60000); // 10 min gap
      const busyEnd = new Date('2026-03-10T23:00:00Z');

      mockFreebusyQuery.mockResolvedValueOnce({
        data: {
          calendars: {
            primary: {
              busy: [{ start: busyStart.toISOString(), end: busyEnd.toISOString() }],
            },
          },
        },
      });

      const result = await service.checkFreeBusy('acc-1', '2026-03-10', 60);

      const slotsBefore = result.availableSlots.filter((s: any) => {
        const slotEnd = new Date(s.endTime);
        return slotEnd <= busyStart;
      });
      for (const slot of slotsBefore) {
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);
        const gap = (slotEnd.getTime() - slotStart.getTime()) / 60000;
        expect(gap).toBeGreaterThanOrEqual(60);
      }
    });

    it('should use default duration of 30 when not specified', async () => {
      mockAuthenticatedFlow();
      mockFreebusyQuery.mockResolvedValueOnce({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.checkFreeBusy('acc-1', '2026-03-10');
      expect(result.success).toBe(true);
    });

    it('should rethrow API errors', async () => {
      mockAuthenticatedFlow();
      mockFreebusyQuery.mockRejectedValueOnce(new Error('Rate limited'));

      await expect(
        service.checkFreeBusy('acc-1', '2026-03-10'),
      ).rejects.toThrow('Rate limited');
    });

    it('should handle multiple busy slots and find gaps between them', async () => {
      mockAuthenticatedFlow();
      mockFreebusyQuery.mockResolvedValueOnce({
        data: {
          calendars: {
            primary: {
              busy: [
                { start: '2026-03-10T13:00:00Z', end: '2026-03-10T14:00:00Z' },
                { start: '2026-03-10T16:00:00Z', end: '2026-03-10T17:00:00Z' },
              ],
            },
          },
        },
      });

      const result = await service.checkFreeBusy('acc-1', '2026-03-10', 30);
      expect(result.success).toBe(true);
      expect(result.busySlots).toHaveLength(2);
    });
  });

  // ── findNextAvailableSlots ────────────────────────────────────────────

  describe('findNextAvailableSlots', () => {
    it('should return available slots across multiple days', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...authenticatedAccount,
        brandingTimezone: 'America/Toronto',
        googleCalendarId: 'primary',
      });

      mockFreebusyQuery.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.findNextAvailableSlots(
        'acc-1',
        '2026-03-10',
        30,
        3,
        5,
      );

      expect(result.success).toBe(true);
      expect(result.timezone).toBeTruthy();
      expect(result.slots.length).toBeLessThanOrEqual(3);
    });

    it('should stop searching once targetSlots is reached', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...authenticatedAccount,
        brandingTimezone: 'America/Toronto',
        googleCalendarId: 'primary',
      });

      mockFreebusyQuery.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.findNextAvailableSlots(
        'acc-1',
        '2026-03-10',
        30,
        2,
        14,
      );

      expect(result.slots.length).toBeLessThanOrEqual(2);
    });

    it('should use default parameters', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...authenticatedAccount,
        brandingTimezone: 'America/Toronto',
        googleCalendarId: 'primary',
      });

      mockFreebusyQuery.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });

      const result = await service.findNextAvailableSlots('acc-1', '2026-03-10');
      expect(result.success).toBe(true);
    });

    it('should skip days that fail and continue searching', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...authenticatedAccount,
        brandingTimezone: 'America/Toronto',
        googleCalendarId: 'primary',
      });

      let callCount = 0;
      mockFreebusyQuery.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('API error'));
        }
        return Promise.resolve({
          data: { calendars: { primary: { busy: [] } } },
        });
      });

      const result = await service.findNextAvailableSlots(
        'acc-1',
        '2026-03-10',
        30,
        1,
        5,
      );

      expect(result.success).toBe(true);
      expect(result.slots.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty slots when all days are fully booked', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...authenticatedAccount,
        brandingTimezone: 'America/Toronto',
        googleCalendarId: 'primary',
      });

      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [{ start: '2026-03-10T00:00:00Z', end: '2026-03-10T23:59:59Z' }],
            },
          },
        },
      });

      const result = await service.findNextAvailableSlots(
        'acc-1',
        '2026-03-10',
        30,
        3,
        3,
      );

      expect(result.success).toBe(true);
    });
  });

  // ── getAccountTimezone (via createEvent) ──────────────────────────────

  describe('getAccountTimezone', () => {
    it('should fall back to America/Toronto when account has no timezone', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: null })
        .mockResolvedValueOnce({ googleCalendarId: 'primary' });

      await service.createEvent('acc-1', {
        summary: 'TZ Test',
        start: new Date('2026-03-10T10:00:00Z'),
        end: new Date('2026-03-10T11:00:00Z'),
      });

      const callArgs = mockInsert.mock.calls[0][0];
      expect(callArgs.requestBody.start.timeZone).toBe('America/Toronto');
    });

    it('should use account brandingTimezone when available', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockResolvedValueOnce({ brandingTimezone: 'America/Los_Angeles' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary' });

      await service.createEvent('acc-1', {
        summary: 'Pacific Event',
        start: new Date('2026-03-10T10:00:00Z'),
        end: new Date('2026-03-10T11:00:00Z'),
      });

      const callArgs = mockInsert.mock.calls[0][0];
      expect(callArgs.requestBody.start.timeZone).toBe('America/Los_Angeles');
    });

    it('should fall back to default timezone on prisma error', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce(authenticatedAccount)
        .mockRejectedValueOnce(new Error('DB error')) // getAccountTimezone fails
        .mockResolvedValueOnce({ googleCalendarId: 'primary' });

      await service.createEvent('acc-1', {
        summary: 'Error TZ',
        start: new Date('2026-03-10T10:00:00Z'),
        end: new Date('2026-03-10T11:00:00Z'),
      });

      const callArgs = mockInsert.mock.calls[0][0];
      expect(callArgs.requestBody.start.timeZone).toBe('America/Toronto');
    });
  });

  // ── toNaiveIso (via createEvent) ──────────────────────────────────────

  describe('toNaiveIso (strips trailing Z)', () => {
    it('should strip Z from ISO string for Google Calendar timezone handling', async () => {
      mockAuthenticatedFlow();

      await service.createEvent('acc-1', {
        summary: 'Naive ISO',
        start: new Date('2026-03-10T14:30:00Z'),
        end: new Date('2026-03-10T15:30:00Z'),
      });

      const callArgs = mockInsert.mock.calls[0][0];
      expect(callArgs.requestBody.start.dateTime).not.toContain('Z');
      expect(callArgs.requestBody.end.dateTime).not.toContain('Z');
      expect(callArgs.requestBody.start.dateTime).toContain('2026-03-10T14:30:00');
    });
  });
});
