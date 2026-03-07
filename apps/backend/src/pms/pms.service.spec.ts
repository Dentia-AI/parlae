import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PmsService } from './pms.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('./providers/sikka.service', () => ({
  SikkaPmsService: jest.fn().mockImplementation(() => ({
    testConnection: jest.fn().mockResolvedValue({ success: true }),
    getFeatures: jest.fn().mockResolvedValue({ success: true, data: { appointments: true } }),
  })),
}));

describe('PmsService', () => {
  let service: PmsService;
  let prisma: any;

  const mockIntegrationWithCreds = {
    officeId: 'office-1',
    secretKey: 'secret-1',
    requestKey: 'req-1',
    refreshKey: 'refresh-1',
    tokenExpiry: new Date('2026-12-31'),
    metadata: { practiceName: 'Test Dental', actualPmsType: 'Dentrix' },
  };

  const mockUserWithAccount = {
    id: 'u-1',
    memberships: [{ account: { id: 'acc-1', name: 'Test Dental' }, accountId: 'acc-1' }],
  };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PmsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PmsService>(PmsService);
    prisma = module.get(PrismaService);

    process.env.SIKKA_APP_ID = 'test-app-id';
    process.env.SIKKA_APP_KEY = 'test-app-key';
    process.env.AWS_REGION = 'us-east-1';

    // Clear the in-memory cache between tests
    service.invalidateCredentialsCache('acc-1');
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('getConnectionStatus', () => {
    it('should return pending when no integration', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(false);
      expect(result.status).toBe('pending');
    });

    it('should return connected when ACTIVE', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        status: 'ACTIVE',
        metadata: { practiceName: 'Test Dental', actualPmsType: 'Dentrix' },
      });
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(true);
      expect(result.status).toBe('connected');
    });

    it('should return failed when INACTIVE', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        status: 'INACTIVE',
        lastError: 'Timeout',
      });
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should return failed when ERROR', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        status: 'ERROR',
        lastError: 'Auth failed',
      });
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should handle db error', async () => {
      prisma.pmsIntegration.findFirst.mockRejectedValue(new Error('DB down'));
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should return connecting for unknown status', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        status: 'CONNECTING',
        metadata: {},
      });
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(false);
      expect(result.status).toBe('connecting');
    });

    it('should handle ACTIVE with missing metadata fields', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        status: 'ACTIVE',
        metadata: {},
      });
      const result = await service.getConnectionStatus('acc-1');
      expect(result.isConnected).toBe(true);
      expect(result).toHaveProperty('practiceName', 'Unknown');
      expect(result).toHaveProperty('pmsType', 'Unknown');
    });
  });

  describe('getPmsStatus', () => {
    it('should return integrations for user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        memberships: [{ accountId: 'acc-1' }],
      });
      prisma.pmsIntegration.findMany.mockResolvedValue([{ id: 'int-1', provider: 'SIKKA' }]);

      const result = await service.getPmsStatus('u-1');
      expect(result.success).toBe(true);
      expect(result.integrations).toHaveLength(1);
    });

    it('should throw when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getPmsStatus('missing')).rejects.toThrow(BadRequestException);
    });

    it('should throw when user has no memberships', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', memberships: [] });
      await expect(service.getPmsStatus('u-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('setupPmsIntegration', () => {
    it('should throw for non-SIKKA provider', async () => {
      await expect(service.setupPmsIntegration('u-1', { provider: 'DENTRIX' } as any))
        .rejects.toThrow('Only Sikka is currently supported');
    });

    it('should throw when user has no account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', memberships: [] });
      await expect(service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any))
        .rejects.toThrow('No account found for user');
    });

    it('should throw when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any))
        .rejects.toThrow('No account found for user');
    });

    it('should throw when no practice credentials exist', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithAccount);
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);

      await expect(service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any))
        .rejects.toThrow('Practice not authorized');
    });

    it('should throw when PMS connection test fails', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithAccount);
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);

      const { SikkaPmsService } = require('./providers/sikka.service');
      SikkaPmsService.mockImplementationOnce(() => ({
        testConnection: jest.fn().mockResolvedValue({ success: false, error: 'Connection timeout' }),
        getFeatures: jest.fn(),
      }));

      await expect(service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any))
        .rejects.toThrow('Failed to connect to Sikka: Connection timeout');
    });

    it('should throw when system credentials are missing', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithAccount);
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);
      delete process.env.SIKKA_APP_ID;

      await expect(service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any))
        .rejects.toThrow('Sikka system credentials not configured');
    });

    it('should successfully set up PMS integration', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithAccount);
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      const result = await service.setupPmsIntegration('u-1', {
        provider: 'SIKKA',
        config: { syncInterval: 30 },
      } as any);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('SIKKA');
      expect(result.status).toBe('ACTIVE');
      expect(result.practiceName).toBe('Test Dental');
      expect(prisma.pmsIntegration.upsert).toHaveBeenCalled();
    });

    it('should handle features fetch failure gracefully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithAccount);
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      const { SikkaPmsService } = require('./providers/sikka.service');
      SikkaPmsService.mockImplementationOnce(() => ({
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        getFeatures: jest.fn().mockResolvedValue({ success: false, data: null }),
      }));

      const result = await service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any);
      expect(result.success).toBe(true);
    });
  });

  describe('getPmsService', () => {
    it('should throw for non-SIKKA provider', async () => {
      await expect(service.getPmsService('acc-1', 'DENTRIX'))
        .rejects.toThrow('Only Sikka is currently supported');
    });

    it('should throw when no credentials found', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      await expect(service.getPmsService('acc-1'))
        .rejects.toThrow('No practice credentials found');
    });

    it('should return a SikkaPmsService instance when credentials exist', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);

      const pms = await service.getPmsService('acc-1');
      expect(pms).toBeDefined();
      expect(pms.testConnection).toBeDefined();
    });

    it('should throw when system credentials are missing', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);
      delete process.env.SIKKA_APP_ID;

      await expect(service.getPmsService('acc-1'))
        .rejects.toThrow('Sikka system credentials not configured');
    });

    it('should use default provider SIKKA when not specified', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);

      const pms = await service.getPmsService('acc-1');
      expect(pms).toBeDefined();
    });

    it('should cache credentials and not re-query DB within TTL', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);

      await service.getPmsService('acc-1');
      await service.getPmsService('acc-1');

      // Only one DB query due to caching
      expect(prisma.pmsIntegration.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should re-query DB after cache invalidation', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);

      await service.getPmsService('acc-1');
      service.invalidateCredentialsCache('acc-1');
      await service.getPmsService('acc-1');

      expect(prisma.pmsIntegration.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSikkaSystemCredentials (via setupPmsIntegration)', () => {
    it('should throw when SIKKA_APP_KEY is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithAccount);
      prisma.pmsIntegration.findFirst.mockResolvedValue(mockIntegrationWithCreds);
      delete process.env.SIKKA_APP_KEY;

      await expect(service.setupPmsIntegration('u-1', { provider: 'SIKKA' } as any))
        .rejects.toThrow('Sikka system credentials not configured');
    });
  });

  describe('handleSikkaOAuthCallback', () => {
    const mockTokenResponse = {
      data: {
        request_key: 'req-key-new',
        refresh_key: 'refresh-key-new',
        expires_in: 3600,
      },
    };

    const mockPracticesResponse = {
      data: {
        items: [
          {
            office_id: 'office-new',
            secret_key: 'secret-new',
            practice_name: 'New Dental',
            practice_id: 'practice-1',
            practice_management_system: 'Eaglesoft',
          },
        ],
      },
    };

    it('should successfully process OAuth callback', async () => {
      mockedAxios.post.mockResolvedValue(mockTokenResponse);
      mockedAxios.get.mockResolvedValue(mockPracticesResponse);
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      const result = await service.handleSikkaOAuthCallback('auth-code-123', 'acc-1');

      expect(result.success).toBe(true);
      expect(result.practiceName).toBe('New Dental');
      expect(result.pmsType).toBe('Eaglesoft');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'authorization_code',
          code: 'auth-code-123',
        }),
      );
      expect(prisma.pmsIntegration.upsert).toHaveBeenCalled();
    });

    it('should throw when no authorized practices found', async () => {
      mockedAxios.post.mockResolvedValue(mockTokenResponse);
      mockedAxios.get.mockResolvedValue({ data: { items: [] } });
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      const result = await service.handleSikkaOAuthCallback('auth-code', 'acc-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No authorized practices found');
    });

    it('should return failure when token exchange fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Token exchange failed'));
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      const result = await service.handleSikkaOAuthCallback('bad-code', 'acc-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token exchange failed');
    });

    it('should save error status to database on failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('API error'));
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      await service.handleSikkaOAuthCallback('bad-code', 'acc-1');

      expect(prisma.pmsIntegration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'ERROR' }),
          update: expect.objectContaining({ status: 'ERROR' }),
        }),
      );
    });

    it('should handle DB error when saving error status', async () => {
      mockedAxios.post.mockRejectedValue(new Error('API error'));
      prisma.pmsIntegration.upsert.mockRejectedValue(new Error('DB down'));

      const result = await service.handleSikkaOAuthCallback('bad-code', 'acc-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should throw when system credentials are missing', async () => {
      delete process.env.SIKKA_APP_ID;
      prisma.pmsIntegration.upsert.mockResolvedValue({});

      const result = await service.handleSikkaOAuthCallback('code', 'acc-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sikka system credentials not configured');
    });
  });

  describe('generateRequestKey', () => {
    it('should exchange credentials for request_key and refresh_key', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          request_key: 'new-req-key',
          refresh_key: 'new-refresh-key',
          end_time: '2026-04-01T00:00:00Z',
        },
      });

      const generateRequestKey = (service as any).generateRequestKey.bind(service);
      const result = await generateRequestKey('office-1', 'secret-1', 'app-id', 'app-key');

      expect(result.requestKey).toBe('new-req-key');
      expect(result.refreshKey).toBe('new-refresh-key');
      expect(result.tokenExpiry).toBe('2026-04-01T00:00:00Z');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'request_key',
          office_id: 'office-1',
        }),
      );
    });
  });

  describe('getProviderName', () => {
    it('should return known provider names', () => {
      const getProviderName = (service as any).getProviderName.bind(service);
      expect(getProviderName('SIKKA')).toBe('Sikka');
      expect(getProviderName('KOLLA')).toBe('Kolla');
      expect(getProviderName('DENTRIX')).toBe('Dentrix');
      expect(getProviderName('EAGLESOFT')).toBe('Eaglesoft');
      expect(getProviderName('OPEN_DENTAL')).toBe('Open Dental');
      expect(getProviderName('CUSTOM')).toBe('Custom');
    });

    it('should return provider string as-is for unknown providers', () => {
      const getProviderName = (service as any).getProviderName.bind(service);
      expect(getProviderName('UNKNOWN_PROVIDER')).toBe('UNKNOWN_PROVIDER');
    });
  });
});
