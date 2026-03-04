import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';
import axios from 'axios';
import {
  SikkaTokenRefreshService,
  refreshAllSikkaTokens,
  refreshExpiringSikkaTokens,
} from './sikka-token.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const SIKKA_INTEGRATION = {
  id: 'int-1',
  accountId: 'acc-1',
  provider: 'SIKKA',
  status: 'ACTIVE',
  refreshKey: 'refresh-key-123',
  officeId: 'office-1',
  secretKey: 'secret-1',
  requestKey: 'old-request-key',
  tokenExpiry: new Date(Date.now() + 3600000),
};

const TOKEN_RESPONSE = {
  request_key: 'new-request-key',
  refresh_key: 'new-refresh-key',
  expires_in: '86400 second(s)',
};

describe('SikkaTokenRefreshService', () => {
  let service: SikkaTokenRefreshService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.SIKKA_APP_ID = 'test-app-id';
    process.env.SIKKA_APP_KEY = 'test-app-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(async () => {
    process.env.SIKKA_APP_ID = 'test-app-id';
    process.env.SIKKA_APP_KEY = 'test-app-key';
    prisma = createMockPrismaService();
    mockedAxios.post.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SikkaTokenRefreshService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SikkaTokenRefreshService>(SikkaTokenRefreshService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('refreshIntegrationToken', () => {
    it('succeeds via refresh_key when integration has refreshKey', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);
      mockedAxios.post.mockResolvedValue({ data: TOKEN_RESPONSE });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'refresh_key',
          refresh_key: 'refresh-key-123',
          app_id: 'test-app-id',
          app_key: 'test-app-key',
        }),
        expect.any(Object)
      );
      expect(prisma.pmsIntegration.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: expect.objectContaining({
          requestKey: 'new-request-key',
          refreshKey: 'new-refresh-key',
          status: 'ACTIVE',
          lastError: null,
        }),
      });
    });

    it('falls back to initial token when refresh_key fails', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Refresh failed'))
        .mockResolvedValueOnce({ data: TOKEN_RESPONSE });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({ grant_type: 'refresh_key' }),
        expect.any(Object)
      );
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'request_key',
          office_id: 'office-1',
          secret_key: 'secret-1',
        }),
        expect.any(Object)
      );
    });

    it('skips non-SIKKA integration and returns false', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        ...SIKKA_INTEGRATION,
        provider: 'CUSTOM',
      } as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(prisma.pmsIntegration.update).not.toHaveBeenCalled();
    });

    it('returns false when integration not found', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(null);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns false when SIKKA_APP_ID is missing', async () => {
      delete process.env.SIKKA_APP_ID;
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
      process.env.SIKKA_APP_ID = 'test-app-id';
    });

    it('returns false when SIKKA_APP_KEY is missing', async () => {
      delete process.env.SIKKA_APP_KEY;
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
      process.env.SIKKA_APP_KEY = 'test-app-key';
    });

    it('returns false when officeId/secretKey missing and no refreshKey', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        ...SIKKA_INTEGRATION,
        refreshKey: null,
        officeId: null,
        secretKey: null,
      } as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns false when officeId/secretKey missing after refresh_key fails', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        ...SIKKA_INTEGRATION,
        refreshKey: 'old-refresh',
        officeId: null,
        secretKey: null,
      } as any);
      mockedAxios.post.mockRejectedValue(new Error('Refresh failed'));

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('saves tokens on success with correct tokenExpiry', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);
      mockedAxios.post.mockResolvedValue({ data: TOKEN_RESPONSE });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      await service.refreshIntegrationToken('int-1');

      const updateCall = prisma.pmsIntegration.update.mock.calls[0][0];
      expect(updateCall.data.requestKey).toBe('new-request-key');
      expect(updateCall.data.refreshKey).toBe('new-refresh-key');
      const tokenExpiry = updateCall.data.tokenExpiry as Date;
      expect(tokenExpiry).toBeInstanceOf(Date);
      const expectedExpiry = Date.now() + 86400 * 1000;
      expect(Math.abs(tokenExpiry.getTime() - expectedExpiry)).toBeLessThan(5000);
    });

    it('marks integration as ERROR on failure', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);
      mockedAxios.post.mockRejectedValue(new Error('Refresh failed'));
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(prisma.pmsIntegration.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: {
          status: 'ERROR',
          lastError: 'Token refresh failed: Refresh failed',
        },
      });
    });

    it('marks integration as ERROR when initial token fails', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        ...SIKKA_INTEGRATION,
        refreshKey: null,
      } as any);
      mockedAxios.post.mockRejectedValue(new Error('Initial token failed'));
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(prisma.pmsIntegration.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: {
          status: 'ERROR',
          lastError: 'Token refresh failed: Initial token failed',
        },
      });
    });

    it('handles invalid token response (missing request_key)', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);
      mockedAxios.post.mockResolvedValue({
        data: { refresh_key: 'x', expires_in: '86400' },
      });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
      expect(prisma.pmsIntegration.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
    });

    it('parses expires_in without "second(s)" suffix', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(SIKKA_INTEGRATION as any);
      mockedAxios.post.mockResolvedValue({
        data: { ...TOKEN_RESPONSE, expires_in: '43200' },
      });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      await service.refreshIntegrationToken('int-1');

      const updateCall = prisma.pmsIntegration.update.mock.calls[0][0];
      const tokenExpiry = updateCall.data.tokenExpiry as Date;
      const expectedExpiry = Date.now() + 43200 * 1000;
      expect(Math.abs(tokenExpiry.getTime() - expectedExpiry)).toBeLessThan(5000);
    });
  });

  describe('refreshAllTokens', () => {
    it('processes all active SIKKA integrations and returns counts', async () => {
      const integrations = [
        { ...SIKKA_INTEGRATION, id: 'int-1' },
        { ...SIKKA_INTEGRATION, id: 'int-2' },
      ];
      prisma.pmsIntegration.findMany.mockResolvedValue(integrations as any);
      prisma.pmsIntegration.findUnique
        .mockResolvedValueOnce(integrations[0] as any)
        .mockResolvedValueOnce(integrations[1] as any);
      mockedAxios.post.mockResolvedValue({ data: TOKEN_RESPONSE });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshAllTokens();

      expect(result).toEqual({ success: 2, failed: 0 });
      expect(prisma.pmsIntegration.findMany).toHaveBeenCalledWith({
        where: {
          provider: 'SIKKA',
          status: { in: ['ACTIVE', 'SETUP_REQUIRED'] },
        },
      });
    });

    it('returns correct success/failed counts when some fail', async () => {
      const integrations = [
        { ...SIKKA_INTEGRATION, id: 'int-1' },
        { ...SIKKA_INTEGRATION, id: 'int-2' },
      ];
      prisma.pmsIntegration.findMany.mockResolvedValue(integrations as any);
      prisma.pmsIntegration.findUnique
        .mockResolvedValueOnce(integrations[0] as any)
        .mockResolvedValueOnce(integrations[1] as any);
      mockedAxios.post
        .mockResolvedValueOnce({ data: TOKEN_RESPONSE })
        .mockRejectedValueOnce(new Error('Failed'));
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshAllTokens();

      expect(result).toEqual({ success: 1, failed: 1 });
    });

    it('returns zero counts when no integrations found', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([]);

      const result = await service.refreshAllTokens();

      expect(result).toEqual({ success: 0, failed: 0 });
    });
  });

  describe('refreshExpiringTokens', () => {
    it('finds only integrations with tokenExpiry within 2 hours', async () => {
      const expiringIntegration = {
        ...SIKKA_INTEGRATION,
        id: 'int-1',
        tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      };
      prisma.pmsIntegration.findMany.mockResolvedValue([expiringIntegration] as any);
      prisma.pmsIntegration.findUnique.mockResolvedValue(expiringIntegration as any);
      mockedAxios.post.mockResolvedValue({ data: TOKEN_RESPONSE });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await service.refreshExpiringTokens();

      expect(result).toEqual({ success: 1, failed: 0 });
      const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      expect(prisma.pmsIntegration.findMany).toHaveBeenCalledWith({
        where: {
          provider: 'SIKKA',
          status: 'ACTIVE',
          tokenExpiry: { lt: twoHoursFromNow },
        },
      });
    });

    it('returns zero counts when no expiring tokens', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([]);

      const result = await service.refreshExpiringTokens();

      expect(result).toEqual({ success: 0, failed: 0 });
    });
  });
});

describe('Standalone functions', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeAll(() => {
    process.env.SIKKA_APP_ID = 'test-app-id';
    process.env.SIKKA_APP_KEY = 'test-app-key';
  });

  beforeEach(() => {
    prisma = createMockPrismaService();
    mockedAxios.post.mockReset();
  });

  describe('refreshAllSikkaTokens', () => {
    it('creates service and calls refreshAllTokens', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([]);

      const result = await refreshAllSikkaTokens(prisma);

      expect(result).toEqual({ success: 0, failed: 0 });
      expect(prisma.pmsIntegration.findMany).toHaveBeenCalled();
    });

    it('processes integrations and returns counts', async () => {
      const integrations = [{ ...SIKKA_INTEGRATION, id: 'int-1' }];
      prisma.pmsIntegration.findMany.mockResolvedValue(integrations as any);
      prisma.pmsIntegration.findUnique.mockResolvedValue(integrations[0] as any);
      mockedAxios.post.mockResolvedValue({ data: TOKEN_RESPONSE });
      prisma.pmsIntegration.update.mockResolvedValue({} as any);

      const result = await refreshAllSikkaTokens(prisma);

      expect(result).toEqual({ success: 1, failed: 0 });
    });
  });

  describe('refreshExpiringSikkaTokens', () => {
    it('creates service and calls refreshExpiringTokens', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([]);

      const result = await refreshExpiringSikkaTokens(prisma);

      expect(result).toEqual({ success: 0, failed: 0 });
      expect(prisma.pmsIntegration.findMany).toHaveBeenCalledWith({
        where: {
          provider: 'SIKKA',
          status: 'ACTIVE',
          tokenExpiry: expect.any(Object),
        },
      });
    });
  });
});
