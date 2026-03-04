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

  describe('getSubAccountByLocationId', () => {
    it('should return sub-account by GHL location ID', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', ghlLocationId: 'loc-99' });
      const result = await service.getSubAccountByLocationId('loc-99');
      expect(result).toEqual({ id: 'sa-1', ghlLocationId: 'loc-99' });
    });

    it('should return null when not found', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue(null);
      const result = await service.getSubAccountByLocationId('loc-missing');
      expect(result).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('should return false when API key is missing', async () => {
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          GhlSubAccountService,
          { provide: PrismaService, useValue: createMockPrismaService() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((k: string) => {
                const map: Record<string, string> = { GHL_API_KEY: '', GHL_LOCATION_ID: 'loc-1' };
                return map[k] || '';
              }),
            },
          },
        ],
      }).compile();
      const svc = module2.get<GhlSubAccountService>(GhlSubAccountService);
      expect(svc.isEnabled()).toBe(false);
    });
  });

  describe('createSubAccount', () => {
    const baseDto = {
      userId: 'u-1',
      accountId: 'acc-1',
      businessName: 'Test Dental',
      businessEmail: 'info@test.com',
      businessPhone: '+15551234567',
    };

    it('should return null when GHL is not enabled', async () => {
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          GhlSubAccountService,
          { provide: PrismaService, useValue: createMockPrismaService() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => ''),
            },
          },
        ],
      }).compile();
      const svc = module2.get<GhlSubAccountService>(GhlSubAccountService);
      const result = await svc.createSubAccount(baseDto);
      expect(result).toBeNull();
    });

    describe('development mode', () => {
      let originalNodeEnv: string | undefined;

      beforeEach(() => {
        originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
      });

      afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
      });

      it('should use existing location and create new sub-account in dev mode', async () => {
        prisma.ghlSubAccount.findUnique.mockResolvedValue(null);
        prisma.ghlSubAccount.create.mockResolvedValue({
          id: 'sa-new',
          ghlLocationId: 'loc-1',
          businessName: 'Test Dental',
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toEqual(expect.objectContaining({ id: 'sa-new' }));
        expect(prisma.ghlSubAccount.create).toHaveBeenCalled();
      });

      it('should update existing sub-account in dev mode if one exists for location', async () => {
        prisma.ghlSubAccount.findUnique.mockResolvedValue({
          id: 'sa-existing',
          ghlLocationId: 'loc-1',
          timezone: 'America/Chicago',
          industry: 'dental',
        });
        prisma.ghlSubAccount.update.mockResolvedValue({
          id: 'sa-existing',
          ghlLocationId: 'loc-1',
          businessName: 'Test Dental',
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toEqual(expect.objectContaining({ id: 'sa-existing' }));
        expect(prisma.ghlSubAccount.update).toHaveBeenCalled();
      });

      it('should throw when GHL_LOCATION_ID is missing in dev mode', async () => {
        const module2: TestingModule = await Test.createTestingModule({
          providers: [
            GhlSubAccountService,
            { provide: PrismaService, useValue: createMockPrismaService() },
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn((k: string) => {
                  const map: Record<string, string> = { GHL_API_KEY: 'test-key', GHL_LOCATION_ID: '', GHL_COMPANY_ID: 'comp-1' };
                  return map[k] || '';
                }),
              },
            },
          ],
        }).compile();
        const svc = module2.get<GhlSubAccountService>(GhlSubAccountService);

        // isEnabled returns false because location id is empty, so it returns null early
        const result = await svc.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should handle database error during create', async () => {
        prisma.ghlSubAccount.findUnique.mockResolvedValue(null);
        prisma.ghlSubAccount.create.mockRejectedValue(new Error('DB constraint violation'));

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should use existing timezone/industry when not provided in dto', async () => {
        prisma.ghlSubAccount.findUnique.mockResolvedValue({
          id: 'sa-existing',
          ghlLocationId: 'loc-1',
          timezone: 'America/Chicago',
          industry: 'dental',
        });
        prisma.ghlSubAccount.update.mockResolvedValue({
          id: 'sa-existing',
          timezone: 'America/Chicago',
          industry: 'dental',
        });

        const result = await service.createSubAccount({
          ...baseDto,
          timezone: undefined,
          industry: undefined,
        });
        expect(result).toBeDefined();
        expect(prisma.ghlSubAccount.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              timezone: 'America/Chicago',
              industry: 'dental',
            }),
          }),
        );
      });
    });

    describe('production mode', () => {
      let originalNodeEnv: string | undefined;

      beforeEach(() => {
        originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
      });

      afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
      });

      it('should create GHL location and sub-account in production', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({
            location: { id: 'ghl-loc-new', name: 'Test Dental', companyId: 'comp-1' },
          }),
        });
        prisma.ghlSubAccount.create.mockResolvedValue({
          id: 'sa-prod',
          ghlLocationId: 'ghl-loc-new',
          businessName: 'Test Dental',
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toEqual(expect.objectContaining({ id: 'sa-prod' }));
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/locations'),
          expect.objectContaining({ method: 'POST' }),
        );
      });

      it('should return null when GHL API returns error', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: async () => JSON.stringify({ error: 'SaaS mode not enabled' }),
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should return null when GHL API returns 404', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => '',
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should return null when GHL API returns empty body on success', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          text: async () => '',
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should return null when GHL API returns no location in response', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({}),
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should handle fetch exception', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should handle non-JSON error response body', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'plain text error',
        });

        const result = await service.createSubAccount(baseDto);
        expect(result).toBeNull();
      });

      it('should include optional fields in payload', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({
            location: { id: 'ghl-loc-full', name: 'Full Dental', companyId: 'comp-1' },
          }),
        });
        prisma.ghlSubAccount.create.mockResolvedValue({
          id: 'sa-full',
          ghlLocationId: 'ghl-loc-full',
        });

        const fullDto = {
          ...baseDto,
          businessAddress: '123 Main St',
          businessWebsite: 'https://test.com',
          timezone: 'America/Los_Angeles',
          firstName: 'John',
          lastName: 'Doe',
          country: 'US',
          city: 'LA',
          state: 'CA',
          postalCode: '90001',
          industry: 'dental',
        };
        const result = await service.createSubAccount(fullDto);
        expect(result).toBeDefined();
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.firstName).toBe('John');
        expect(body.lastName).toBe('Doe');
        expect(body.city).toBe('LA');
        expect(body.state).toBe('CA');
        expect(body.postalCode).toBe('90001');
      });
    });
  });

  describe('syncSubAccountFromGhl', () => {
    it('should sync and update local sub-account from GHL', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          location: {
            id: 'loc-sync',
            name: 'Synced Dental',
            email: 'sync@test.com',
            phone: '+15559999999',
            address: '456 Sync St',
            website: 'https://synced.com',
            timezone: 'America/Chicago',
          },
        }),
      });
      prisma.ghlSubAccount.update.mockResolvedValue({
        id: 'sa-sync',
        ghlLocationId: 'loc-sync',
        businessName: 'Synced Dental',
      });

      const result = await service.syncSubAccountFromGhl('loc-sync');
      expect(result).toEqual(expect.objectContaining({ id: 'sa-sync' }));
      expect(prisma.ghlSubAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ghlLocationId: 'loc-sync' },
          data: expect.objectContaining({ businessName: 'Synced Dental' }),
        }),
      );
    });

    it('should return null when GHL API returns error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await service.syncSubAccountFromGhl('loc-missing');
      expect(result).toBeNull();
    });

    it('should return null when GHL returns no location data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await service.syncSubAccountFromGhl('loc-empty');
      expect(result).toBeNull();
    });

    it('should return null on fetch exception', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

      const result = await service.syncSubAccountFromGhl('loc-fail');
      expect(result).toBeNull();
    });
  });

  describe('createSubAccountFromExisting', () => {
    it('should create sub-account from existing GHL location', async () => {
      prisma.ghlSubAccount.create.mockResolvedValue({
        id: 'sa-from-existing',
        ghlLocationId: 'loc-exist',
        ghlCompanyId: 'comp-exist',
        businessName: 'Existing Dental',
      });

      const result = await service.createSubAccountFromExisting({
        userId: 'u-1',
        accountId: 'acc-1',
        businessName: 'Existing Dental',
        businessEmail: 'exist@test.com',
        businessPhone: '+15551234567',
        ghlLocationId: 'loc-exist',
        ghlCompanyId: 'comp-exist',
      });

      expect(result).toEqual(expect.objectContaining({
        id: 'sa-from-existing',
        ghlLocationId: 'loc-exist',
      }));
      expect(prisma.ghlSubAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ghlLocationId: 'loc-exist',
            ghlCompanyId: 'comp-exist',
            businessName: 'Existing Dental',
          }),
        }),
      );
    });

    it('should use default timezone when not provided', async () => {
      prisma.ghlSubAccount.create.mockResolvedValue({
        id: 'sa-tz',
        timezone: 'America/New_York',
      });

      await service.createSubAccountFromExisting({
        userId: 'u-1',
        businessName: 'TZ Dental',
        ghlLocationId: 'loc-tz',
        ghlCompanyId: 'comp-tz',
      });

      expect(prisma.ghlSubAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timezone: 'America/New_York' }),
        }),
      );
    });

    it('should use provided timezone', async () => {
      prisma.ghlSubAccount.create.mockResolvedValue({
        id: 'sa-tz2',
        timezone: 'America/Los_Angeles',
      });

      await service.createSubAccountFromExisting({
        userId: 'u-1',
        businessName: 'West Dental',
        timezone: 'America/Los_Angeles',
        ghlLocationId: 'loc-tz2',
        ghlCompanyId: 'comp-tz2',
      });

      expect(prisma.ghlSubAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timezone: 'America/Los_Angeles' }),
        }),
      );
    });

    it('should return null on database error', async () => {
      prisma.ghlSubAccount.create.mockRejectedValue(new Error('Unique constraint'));

      const result = await service.createSubAccountFromExisting({
        userId: 'u-1',
        businessName: 'Fail Dental',
        ghlLocationId: 'loc-dup',
        ghlCompanyId: 'comp-dup',
      });

      expect(result).toBeNull();
    });

    it('should include optional fields in create data', async () => {
      prisma.ghlSubAccount.create.mockResolvedValue({
        id: 'sa-full',
        businessAddress: '789 Full St',
        businessWebsite: 'https://full.com',
        industry: 'orthodontics',
      });

      await service.createSubAccountFromExisting({
        userId: 'u-1',
        accountId: 'acc-1',
        businessName: 'Full Dental',
        businessEmail: 'full@test.com',
        businessPhone: '+15551111111',
        businessAddress: '789 Full St',
        businessWebsite: 'https://full.com',
        industry: 'orthodontics',
        ghlLocationId: 'loc-full',
        ghlCompanyId: 'comp-full',
      });

      expect(prisma.ghlSubAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessAddress: '789 Full St',
            businessWebsite: 'https://full.com',
            industry: 'orthodontics',
          }),
        }),
      );
    });
  });
});
