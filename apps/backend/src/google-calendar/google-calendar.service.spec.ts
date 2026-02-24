import { Test, TestingModule } from '@nestjs/testing';
import { GoogleCalendarService } from './google-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

jest.mock('googleapis', () => {
  const mockCalendar = {
    events: {
      insert: jest.fn().mockResolvedValue({ data: { id: 'evt_1', htmlLink: 'https://cal/evt_1' } }),
      patch: jest.fn().mockResolvedValue({ data: { id: 'evt_1', htmlLink: 'https://cal/evt_1' } }),
      delete: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue({ data: { items: [] } }),
    },
    freebusy: {
      query: jest.fn().mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } }),
    },
    calendarList: {
      list: jest.fn().mockResolvedValue({ data: { items: [{ id: 'primary', primary: true }] } }),
    },
  };
  const mockOAuth2 = {
    generateAuthUrl: jest.fn().mockReturnValue('https://auth.url'),
    getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: Date.now() + 3600000 } }),
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn().mockResolvedValue({ credentials: { access_token: 'new_at', expiry_date: Date.now() + 3600000 } }),
  };
  return {
    google: {
      auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2) },
      calendar: jest.fn().mockReturnValue(mockCalendar),
      oauth2: jest.fn().mockReturnValue({ userinfo: { get: jest.fn().mockResolvedValue({ data: { email: 'test@clinic.com' } }) } }),
    },
  };
});

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let prisma: any;

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

  describe('isConfigured', () => {
    it('should return true when OAuth is configured', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('getAuthUrl', () => {
    it('should return auth URL', () => {
      const url = service.getAuthUrl('account-123');
      expect(url).toBe('https://auth.url');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code and save tokens', async () => {
      prisma.account.update.mockResolvedValue({});
      const result = await service.exchangeCodeForTokens('auth-code', 'account-123');
      expect(result.success).toBe(true);
      expect(result.email).toBe('test@clinic.com');
      expect(prisma.account.update).toHaveBeenCalled();
    });
  });

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

  describe('disconnect', () => {
    it('should clear calendar fields', async () => {
      prisma.account.update.mockResolvedValue({});
      await service.disconnect('acc-1');
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleCalendarConnected: false,
            googleCalendarAccessToken: null,
          }),
        }),
      );
    });
  });

  describe('createEvent', () => {
    it('should create calendar event', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce({ googleCalendarAccessToken: 'at', googleCalendarRefreshToken: 'rt', googleCalendarTokenExpiry: new Date(Date.now() + 3600000) })
        .mockResolvedValueOnce({ brandingTimezone: 'America/Toronto' })
        .mockResolvedValueOnce({ googleCalendarId: 'primary' });

      const result = await service.createEvent('acc-1', {
        summary: 'Test Event',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T11:00:00Z'),
      });
      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt_1');
    });
  });

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
      await expect(service.refreshAccessToken('acc-1')).rejects.toThrow('No refresh token available');
    });
  });
});
