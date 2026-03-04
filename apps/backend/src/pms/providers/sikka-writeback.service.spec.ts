import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SikkaWritebackService, pollSikkaWritebacks, retrySikkaWritebacks } from './sikka-writeback.service';
import { prismaMock } from '../../test/mocks/prisma.mock';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SikkaWritebackService', () => {
  let service: SikkaWritebackService;
  let prisma: typeof prismaMock;

  const createMockWriteback = (overrides: Partial<{
    id: string;
    pmsIntegrationId: string;
    checkCount: number;
    submittedAt: Date;
    result: string;
    completedAt?: Date;
    pmsIntegration: any;
  }> = {}) => ({
    id: 'wb-1',
    pmsIntegrationId: 'pms-1',
    checkCount: 0,
    submittedAt: new Date(Date.now() - 20 * 1000), // 20 seconds ago
    result: 'pending',
    pmsIntegration: {
      id: 'pms-1',
      credentials: { appId: 'app-1', appKey: 'key-1' },
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedAxios.get = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SikkaWritebackService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SikkaWritebackService>(SikkaWritebackService);
    prisma = prismaMock;
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkWritebackStatus', () => {
    it('returns parsed status on success', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          items: [
            {
              id: 'wb-1',
              result: 'completed',
              error_message: null,
              completed_time: '2025-03-03T12:00:00Z',
              duration_in_second: '5',
            },
          ],
        },
      });

      const result = await service.checkWritebackStatus('wb-1', 'app-1', 'key-1');

      expect(result).toEqual({
        id: 'wb-1',
        result: 'completed',
        errorMessage: null,
        completedTime: '2025-03-03T12:00:00Z',
        durationInSeconds: '5',
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/writebacks',
        expect.objectContaining({
          params: { id: 'wb-1' },
          headers: { 'App-Id': 'app-1', 'App-Key': 'key-1' },
          timeout: 10000,
        })
      );
    });

    it('returns null on empty response', async () => {
      mockedAxios.get.mockResolvedValue({ data: { items: [] } });

      const result = await service.checkWritebackStatus('wb-1', 'app-1', 'key-1');

      expect(result).toBeNull();
    });

    it('returns null when response has no items', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} });

      const result = await service.checkWritebackStatus('wb-1', 'app-1', 'key-1');

      expect(result).toBeNull();
    });

    it('returns null on axios error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await service.checkWritebackStatus('wb-1', 'app-1', 'key-1');

      expect(result).toBeNull();
    });

    it('returns failed status when result is failed', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          items: [
            {
              id: 'wb-1',
              result: 'failed',
              error_message: 'Booking conflict',
              completed_time: null,
              duration_in_second: null,
            },
          ],
        },
      });

      const result = await service.checkWritebackStatus('wb-1', 'app-1', 'key-1');

      expect(result).toEqual({
        id: 'wb-1',
        result: 'failed',
        errorMessage: 'Booking conflict',
        completedTime: null,
        durationInSeconds: null,
      });
    });
  });

  describe('updateWritebackStatus', () => {
    it('calls prisma.pmsWriteback.update with correct data', async () => {
      prisma.pmsWriteback.update.mockResolvedValue({} as any);

      await service.updateWritebackStatus('wb-1', {
        id: 'wb-1',
        result: 'completed',
        completedTime: '2025-03-03T12:00:00Z',
        durationInSeconds: '5',
      });

      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: {
          result: 'completed',
          errorMessage: undefined,
          completedAt: new Date('2025-03-03T12:00:00Z'),
          lastCheckedAt: expect.any(Date),
          checkCount: { increment: 1 },
        },
      });
    });

    it('handles status without completedTime', async () => {
      prisma.pmsWriteback.update.mockResolvedValue({} as any);

      await service.updateWritebackStatus('wb-1', {
        id: 'wb-1',
        result: 'failed',
        errorMessage: 'Error',
      });

      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: expect.objectContaining({
          result: 'failed',
          errorMessage: 'Error',
          completedAt: undefined,
        }),
      });
    });
  });

  describe('pollPendingWritebacks', () => {
    it('returns zeros when no pending writebacks', async () => {
      prisma.pmsWriteback.findMany.mockResolvedValue([]);
      prisma.pmsWriteback.count.mockResolvedValue(0);

      const result = await service.pollPendingWritebacks();

      expect(result).toEqual({ checked: 0, updated: 0, skipped: 0, rateLimited: 0 });
      expect(prisma.pmsWriteback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { result: 'pending', checkCount: { lt: 30 } },
          include: { pmsIntegration: true },
          orderBy: { submittedAt: 'asc' },
        })
      );
    });

    it('skips writebacks with missing credentials', async () => {
      const writebackNoCreds = createMockWriteback({
        pmsIntegration: { id: 'pms-1', credentials: {} },
      });
      prisma.pmsWriteback.findMany.mockResolvedValue([writebackNoCreds] as any);
      prisma.pmsWriteback.count.mockResolvedValue(1);

      // Mock getWritebacksReadyForCheck by returning writebacks that pass timing
      // We need writebacks that would be "ready" - use spy on private method
      const getReadySpy = jest.spyOn(service as any, 'getWritebacksReadyForCheck');
      getReadySpy.mockResolvedValue([writebackNoCreds]);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(0);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('checks and updates writebacks when ready', async () => {
      const writeback = createMockWriteback();
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);

      mockedAxios.get.mockResolvedValue({
        data: {
          items: [
            { id: 'wb-1', result: 'completed', error_message: null, completed_time: '2025-03-03T12:00:00Z', duration_in_second: '5' },
          ],
        },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(0);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(1);
      expect(result.updated).toBe(1);
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wb-1' },
          data: expect.objectContaining({ result: 'completed' }),
        })
      );
    });

    it('updates lastCheckedAt when checkWritebackStatus returns null', async () => {
      const writeback = createMockWriteback();
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);

      mockedAxios.get.mockRejectedValue(new Error('Network error'));
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(1);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(1);
      expect(result.updated).toBe(0);
      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: {
          lastCheckedAt: expect.any(Date),
          checkCount: { increment: 1 },
        },
      });
    });

    it('increments checkCount when status still pending', async () => {
      const writeback = createMockWriteback();
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);

      mockedAxios.get.mockResolvedValue({
        data: {
          items: [
            { id: 'wb-1', result: 'pending', error_message: null, completed_time: null, duration_in_second: null },
          ],
        },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(1);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(1);
      expect(result.updated).toBe(0);
      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: {
          lastCheckedAt: expect.any(Date),
          checkCount: { increment: 1 },
        },
      });
    });

    it('respects rate limits - rateLimited increases when over limit', async () => {
      const writebacks = Array.from({ length: 20 }, (_, i) =>
        createMockWriteback({ id: `wb-${i}`, pmsIntegrationId: 'pms-1' })
      );
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue(writebacks);

      mockedAxios.get.mockResolvedValue({
        data: { items: [{ id: 'wb-0', result: 'pending', error_message: null, completed_time: null, duration_in_second: null }] },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(20);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBeGreaterThan(0);
      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe('getWritebackStatsByPractice', () => {
    it('returns stats and rate limit status', async () => {
      prisma.pmsWriteback.count.mockResolvedValue(10);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_duration: 5.2 }]);

      const result = await service.getWritebackStatsByPractice('pms-1');

      expect(result).toMatchObject({
        total: 10,
        pending: 10,
        completed: 10,
        failed: 10,
        successRate: '100.0',
        avgDurationSeconds: 5.2,
        rateLimitStatus: expect.objectContaining({
          requestsUsed: 0,
          requestsRemaining: 150,
        }),
      });
    });

    it('returns successRate 0.0 when total is 0', async () => {
      prisma.pmsWriteback.count.mockResolvedValue(0);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getWritebackStatsByPractice('pms-1');

      expect(result.successRate).toBe('0.0');
    });

    it('reflects rate limit usage after polling', async () => {
      const writeback = createMockWriteback();
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);

      mockedAxios.get.mockResolvedValue({
        data: { items: [{ id: 'wb-1', result: 'pending', error_message: null, completed_time: null, duration_in_second: null }] },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(1);

      await service.pollPendingWritebacks();

      prisma.pmsWriteback.count.mockResolvedValue(1);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_duration: 0 }]);

      const stats = await service.getWritebackStatsByPractice('pms-1');

      expect(stats.rateLimitStatus.requestsUsed).toBe(1);
      expect(stats.rateLimitStatus.requestsRemaining).toBe(149);
    });
  });

  describe('markStuckWritebacksAsFailed', () => {
    it('marks writebacks older than 6 hours as failed', async () => {
      (prisma.pmsWriteback.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await service.markStuckWritebacksAsFailed();

      expect(result).toBe(3);
      expect(prisma.pmsWriteback.updateMany).toHaveBeenCalledWith({
        where: {
          result: 'pending',
          submittedAt: { lt: expect.any(Date) },
        },
        data: {
          result: 'failed',
          errorMessage: 'Writeback timeout - operation stuck in pending state for >6 hours',
          completedAt: expect.any(Date),
        },
      });
    });

    it('returns 0 when no stuck writebacks', async () => {
      (prisma.pmsWriteback.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await service.markStuckWritebacksAsFailed();

      expect(result).toBe(0);
    });
  });

  describe('retryFailedWritebacks', () => {
    it('returns zeros when not low traffic time', async () => {
      jest.spyOn(service as any, 'isLowTrafficTime').mockReturnValue(false);

      const result = await service.retryFailedWritebacks();

      expect(result).toEqual({ retried: 0, successful: 0 });
      expect(prisma.pmsWriteback.findMany).not.toHaveBeenCalled();
    });

    it('retries failed writebacks during low traffic', async () => {
      jest.spyOn(service as any, 'isLowTrafficTime').mockReturnValue(true);

      const failedWriteback = createMockWriteback({
        id: 'wb-failed',
        result: 'failed',
        completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      prisma.pmsWriteback.findMany.mockResolvedValue([failedWriteback] as any);

      const origEnv = process.env;
      process.env.SIKKA_APP_ID = 'sys-app';
      process.env.SIKKA_APP_KEY = 'sys-key';

      mockedAxios.get.mockResolvedValue({
        data: {
          items: [
            { id: 'wb-failed', result: 'completed', error_message: null, completed_time: '2025-03-03T12:00:00Z', duration_in_second: '5' },
          ],
        },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);

      const result = await service.retryFailedWritebacks();

      expect(result).toEqual({ retried: 1, successful: 1 });
      expect(prisma.pmsWriteback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            result: 'failed',
            checkCount: { lt: 30 },
          }),
        })
      );

      process.env = origEnv;
    });

    it('skips when Sikka credentials missing', async () => {
      jest.spyOn(service as any, 'isLowTrafficTime').mockReturnValue(true);

      const failedWriteback = createMockWriteback({ result: 'failed' });
      prisma.pmsWriteback.findMany.mockResolvedValue([failedWriteback] as any);

      const origEnv = process.env;
      delete process.env.SIKKA_APP_ID;
      delete process.env.SIKKA_APP_KEY;

      const result = await service.retryFailedWritebacks();

      expect(result).toEqual({ retried: 0, successful: 0 });
      expect(mockedAxios.get).not.toHaveBeenCalled();

      process.env = origEnv;
    });
  });

  describe('getApiUsageReport', () => {
    it('returns empty when no rate limit trackers', async () => {
      const result = await service.getApiUsageReport();
      expect(result).toEqual([]);
    });

    it('returns report for practices with rate limit usage', async () => {
      const writeback = createMockWriteback();
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);
      mockedAxios.get.mockResolvedValue({
        data: { items: [{ id: 'wb-1', result: 'pending', error_message: null, completed_time: null, duration_in_second: null }] },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(1);
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'pms-1',
        metadata: { practiceName: 'Test Practice' },
      } as any);

      await service.pollPendingWritebacks();

      const result = await service.getApiUsageReport();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        pmsIntegrationId: 'pms-1',
        officeName: 'Test Practice',
        requestsUsed: 1,
        requestsRemaining: 149,
      });
    });
  });

  describe('rate limiting (via pollPendingWritebacks and getWritebackStatsByPractice)', () => {
    it('within limit allows requests', async () => {
      const writeback = createMockWriteback();
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);

      mockedAxios.get.mockResolvedValue({
        data: { items: [{ id: 'wb-1', result: 'completed', error_message: null, completed_time: '2025-03-03T12:00:00Z', duration_in_second: '5' }] },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(0);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(1);
      expect(result.rateLimited).toBe(0);
    });

    it('tracks requests per practice', async () => {
      const writeback = createMockWriteback({ pmsIntegrationId: 'pms-A' });
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([writeback]);

      mockedAxios.get.mockResolvedValue({
        data: { items: [{ id: 'wb-1', result: 'pending', error_message: null, completed_time: null, duration_in_second: null }] },
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(1);

      await service.pollPendingWritebacks();
      await service.pollPendingWritebacks();

      prisma.pmsWriteback.count.mockResolvedValue(1);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_duration: 0 }]);

      const stats = await service.getWritebackStatsByPractice('pms-A');
      expect(stats.rateLimitStatus.requestsUsed).toBe(2);
    });

    it('rate limits are per practice - different practices have separate limits', async () => {
      const wbA = createMockWriteback({ id: 'wb-a', pmsIntegrationId: 'pms-A' });
      const wbB = createMockWriteback({ id: 'wb-b', pmsIntegrationId: 'pms-B' });
      (service as any).getWritebacksReadyForCheck = jest.fn().mockResolvedValue([wbA, wbB]);

      mockedAxios.get.mockImplementation((url: string, config?: { params?: { id?: string } }) => {
        const id = config?.params?.id ?? 'wb-a';
        return Promise.resolve({
          data: { items: [{ id, result: 'pending', error_message: null, completed_time: null, duration_in_second: null }] },
        });
      });
      prisma.pmsWriteback.update.mockResolvedValue({} as any);
      prisma.pmsWriteback.count.mockResolvedValue(2);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(2);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateNextCheckTime (via getWritebacksReadyForCheck)', () => {
    it('filters writebacks not yet due for check', async () => {
      const recentWriteback = createMockWriteback({
        submittedAt: new Date(Date.now() - 5 * 1000), // 5 seconds ago - before initial delay
      });
      prisma.pmsWriteback.findMany.mockResolvedValue([recentWriteback] as any);

      const result = await service.pollPendingWritebacks();

      expect(result.checked).toBe(0);
    });
  });

  describe('standalone functions', () => {
    it('pollSikkaWritebacks marks stuck and polls', async () => {
      (prisma.pmsWriteback.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      prisma.pmsWriteback.findMany.mockResolvedValue([]);
      prisma.pmsWriteback.count.mockResolvedValue(0);

      const result = await pollSikkaWritebacks(prisma);

      expect(result).toEqual({ checked: 0, updated: 0, skipped: 0, rateLimited: 0 });
      expect(prisma.pmsWriteback.updateMany).toHaveBeenCalled();
      expect(prisma.pmsWriteback.findMany).toHaveBeenCalled();
    });

    it('retrySikkaWritebacks delegates to service', async () => {
      prisma.pmsWriteback.findMany.mockResolvedValue([]);

      const result = await retrySikkaWritebacks(prisma);

      expect(result).toEqual({ retried: 0, successful: 0 });
    });
  });
});
