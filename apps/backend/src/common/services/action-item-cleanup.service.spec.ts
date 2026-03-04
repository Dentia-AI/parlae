import { Test, TestingModule } from '@nestjs/testing';
import { ActionItemCleanupService } from './action-item-cleanup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('ActionItemCleanupService', () => {
  let service: ActionItemCleanupService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemCleanupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ActionItemCleanupService>(ActionItemCleanupService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purgeOldRecords', () => {
    it('deletes action items older than 90 days', async () => {
      prisma.actionItem.deleteMany.mockResolvedValue({ count: 5 });
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      await service.purgeOldRecords();

      expect(prisma.actionItem.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });

      const cutoff: Date = prisma.actionItem.deleteMany.mock.calls[0][0].where.createdAt.lt;
      const expected = new Date();
      expected.setDate(expected.getDate() - 90);
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(2000);
    });

    it('deletes notifications older than 30 days', async () => {
      prisma.actionItem.deleteMany.mockResolvedValue({ count: 0 });
      prisma.notification.deleteMany.mockResolvedValue({ count: 12 });

      await service.purgeOldRecords();

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });

      const cutoff: Date = prisma.notification.deleteMany.mock.calls[0][0].where.createdAt.lt;
      const expected = new Date();
      expected.setDate(expected.getDate() - 30);
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(2000);
    });

    it('handles action item purge errors gracefully', async () => {
      prisma.actionItem.deleteMany.mockRejectedValue(new Error('DB error'));
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.purgeOldRecords()).resolves.toBeUndefined();
      expect(prisma.notification.deleteMany).toHaveBeenCalled();
    });

    it('handles notification purge errors gracefully', async () => {
      prisma.actionItem.deleteMany.mockResolvedValue({ count: 0 });
      prisma.notification.deleteMany.mockRejectedValue(new Error('DB error'));

      await expect(service.purgeOldRecords()).resolves.toBeUndefined();
    });

    it('runs both cleanups even when neither has results', async () => {
      prisma.actionItem.deleteMany.mockResolvedValue({ count: 0 });
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      await service.purgeOldRecords();

      expect(prisma.actionItem.deleteMany).toHaveBeenCalled();
      expect(prisma.notification.deleteMany).toHaveBeenCalled();
    });
  });
});
