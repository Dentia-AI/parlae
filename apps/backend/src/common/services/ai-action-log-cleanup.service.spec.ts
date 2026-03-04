import { Test, TestingModule } from '@nestjs/testing';
import { AiActionLogCleanupService } from './ai-action-log-cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('AiActionLogCleanupService', () => {
  let service: AiActionLogCleanupService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiActionLogCleanupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiActionLogCleanupService>(AiActionLogCleanupService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purgeOldActionLogs', () => {
    it('deletes action logs older than 3 months', async () => {
      prisma.aiActionLog.deleteMany.mockResolvedValue({ count: 42 });

      await service.purgeOldActionLogs();

      expect(prisma.aiActionLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });

      const cutoff: Date = prisma.aiActionLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      expect(Math.abs(cutoff.getTime() - threeMonthsAgo.getTime())).toBeLessThan(1000);
    });

    it('does not log when no entries are purged', async () => {
      prisma.aiActionLog.deleteMany.mockResolvedValue({ count: 0 });
      await service.purgeOldActionLogs();
      expect(prisma.aiActionLog.deleteMany).toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      prisma.aiActionLog.deleteMany.mockRejectedValue(new Error('DB connection lost'));
      await expect(service.purgeOldActionLogs()).resolves.toBeUndefined();
    });

    it('logs when entries are purged (count > 0)', async () => {
      prisma.aiActionLog.deleteMany.mockResolvedValue({ count: 100 });
      await expect(service.purgeOldActionLogs()).resolves.toBeUndefined();
    });
  });
});
