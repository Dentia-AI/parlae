import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PmsService } from './pms.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/services/secrets.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';
import { createMockSecretsService } from '../test/mocks/secrets.mock';

describe('PmsService', () => {
  let service: PmsService;
  let prisma: any;
  let secrets: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockSecrets = createMockSecretsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PmsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecretsService, useValue: mockSecrets },
      ],
    }).compile();

    service = module.get<PmsService>(PmsService);
    prisma = module.get(PrismaService);
    secrets = module.get(SecretsService);
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
  });

  describe('getPmsService', () => {
    it('should throw for non-SIKKA provider', async () => {
      await expect(service.getPmsService('acc-1', 'DENTRIX'))
        .rejects.toThrow('Only Sikka is currently supported');
    });

    it('should throw when no credentials found', async () => {
      secrets.getPracticeCredentials.mockResolvedValue(null);
      await expect(service.getPmsService('acc-1'))
        .rejects.toThrow('No practice credentials found');
    });
  });
});
