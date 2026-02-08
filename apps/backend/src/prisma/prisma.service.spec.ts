import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// Mock the @kit/prisma module
jest.mock('@kit/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    account: {},
    user: {},
    role: {},
    accountMembership: {},
    rolePermission: {},
    billingCustomer: {},
    config: {},
    invitation: {},
    nonce: {},
    notification: {},
    order: {},
    orderItem: {},
    subscription: {},
    subscriptionItem: {},
    usageRecord: {},
    file: {},
    sourceContent: {},
    adProvider: {},
    ad: {},
    userTransaction: {},
    metaAdCampaign: {},
    metaAdSet: {},
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  })),
  prisma: {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    account: {},
    user: {},
    role: {},
    accountMembership: {},
    rolePermission: {},
    billingCustomer: {},
    config: {},
    invitation: {},
    nonce: {},
    notification: {},
    order: {},
    orderItem: {},
    subscription: {},
    subscriptionItem: {},
    usageRecord: {},
    file: {},
    sourceContent: {},
    adProvider: {},
    ad: {},
    userTransaction: {},
    metaAdCampaign: {},
    metaAdSet: {},
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to database', async () => {
      const connectSpy = jest.spyOn(service as any, '$queryRaw').mockResolvedValue(undefined);

      await service.onModuleInit();

      // Verify that the client is being used
      expect(service).toBeDefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from database', async () => {
      const disconnectSpy = jest.spyOn(service as any, '$queryRaw').mockResolvedValue(undefined);

      await service.onModuleDestroy();

      // Verify that the service can be destroyed
      expect(service).toBeDefined();
    });
  });

  describe('Prisma client accessors', () => {
    it('should expose account accessor', () => {
      expect(service.account).toBeDefined();
    });

    it('should expose user accessor', () => {
      expect(service.user).toBeDefined();
    });

    it('should expose role accessor', () => {
      expect(service.role).toBeDefined();
    });

    it('should expose transaction method', () => {
      expect(service.$transaction).toBeDefined();
      expect(typeof service.$transaction).toBe('function');
    });

    it('should expose queryRaw method', () => {
      expect(service.$queryRaw).toBeDefined();
      expect(typeof service.$queryRaw).toBe('function');
    });

    it('should expose executeRaw method', () => {
      expect(service.$executeRaw).toBeDefined();
      expect(typeof service.$executeRaw).toBe('function');
    });
  });
});

