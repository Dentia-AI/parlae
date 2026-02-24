import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlSubAccountService } from './ghl-sub-account.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('GhlSubAccountService', () => {
  let service: GhlSubAccountService;
  let prisma: any;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => '{}' });
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhlSubAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) => {
              const map: Record<string, string> = { GHL_API_KEY: 'test-key', GHL_LOCATION_ID: 'loc-1', GHL_COMPANY_ID: 'comp-1' };
              return map[k] || '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GhlSubAccountService>(GhlSubAccountService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('isEnabled', () => {
    it('should return true when API key and location ID are set', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('getSubAccountById', () => {
    it('should return sub-account', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1' });
      const result = await service.getSubAccountById('sa-1');
      expect(result).toEqual({ id: 'sa-1' });
    });
  });

  describe('getSubAccountByUserId', () => {
    it('should return sub-account for user', async () => {
      prisma.ghlSubAccount.findFirst.mockResolvedValue({ id: 'sa-1', userId: 'u-1' });
      const result = await service.getSubAccountByUserId('u-1');
      expect(result).toEqual({ id: 'sa-1', userId: 'u-1' });
    });
  });

  describe('updateSubAccount', () => {
    it('should update sub-account', async () => {
      prisma.ghlSubAccount.update.mockResolvedValue({ id: 'sa-1', businessName: 'Updated' });
      const result = await service.updateSubAccount('sa-1', { businessName: 'Updated' });
      expect(result.businessName).toBe('Updated');
    });
  });

  describe('updateSetupStep', () => {
    it('should update step', async () => {
      prisma.ghlSubAccount.update.mockResolvedValue({ id: 'sa-1', setupStep: 3 });
      const result = await service.updateSetupStep('sa-1', 3);
      expect(result.setupStep).toBe(3);
    });

    it('should mark as completed', async () => {
      prisma.ghlSubAccount.update.mockResolvedValue({ id: 'sa-1', setupCompleted: true });
      const result = await service.updateSetupStep('sa-1', 5, true);
      expect(result.setupCompleted).toBe(true);
    });
  });

  describe('suspendSubAccount', () => {
    it('should suspend sub-account', async () => {
      prisma.ghlSubAccount.update.mockResolvedValue({ id: 'sa-1', status: 'SUSPENDED' });
      const result = await service.suspendSubAccount('sa-1');
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('reactivateSubAccount', () => {
    it('should reactivate sub-account', async () => {
      prisma.ghlSubAccount.update.mockResolvedValue({ id: 'sa-1', status: 'ACTIVE' });
      const result = await service.reactivateSubAccount('sa-1');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('deleteSubAccount', () => {
    it('should soft delete', async () => {
      prisma.ghlSubAccount.update.mockResolvedValue({ id: 'sa-1', status: 'DELETED' });
      const result = await service.deleteSubAccount('sa-1');
      expect(result.status).toBe('DELETED');
    });
  });

  describe('listUserSubAccounts', () => {
    it('should return non-deleted sub-accounts', async () => {
      prisma.ghlSubAccount.findMany.mockResolvedValue([{ id: 'sa-1' }]);
      const result = await service.listUserSubAccounts('u-1');
      expect(result).toHaveLength(1);
    });
  });
});
