const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@prisma/client', () => {
  const instance = {
    pmsWriteback: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    pmsIntegration: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  return {
    PrismaClient: jest.fn().mockReturnValue(instance),
    __mockInstance: instance,
  };
});

import { SikkaWritebackService, pollSikkaWritebacks, retrySikkaWritebacks } from './sikka-writeback.service';

const { __mockInstance: prisma } = jest.requireMock<any>('@prisma/client');

function mockOk(data: any) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SikkaWritebackService', () => {
  describe('checkWritebackStatus', () => {
    it('returns writeback status when found', async () => {
      mockFetch.mockResolvedValue(mockOk({
        items: [{ id: 'wb-1', result: 'completed', completed_time: '2025-03-15T12:00:00Z', duration_in_second: '5' }],
      }));

      const svc = new SikkaWritebackService();
      const result = await svc.checkWritebackStatus('wb-1', 'app-id', 'app-key');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('wb-1');
      expect(result!.result).toBe('completed');
      expect(result!.completedTime).toBe('2025-03-15T12:00:00Z');
    });

    it('returns null when writeback not found', async () => {
      mockFetch.mockResolvedValue(mockOk({ items: [] }));

      const svc = new SikkaWritebackService();
      const result = await svc.checkWritebackStatus('nonexistent', 'app-id', 'app-key');

      expect(result).toBeNull();
    });

    it('returns null on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const svc = new SikkaWritebackService();
      const result = await svc.checkWritebackStatus('wb-1', 'app-id', 'app-key');

      expect(result).toBeNull();
    });

    it('passes correct headers with appId and appKey', async () => {
      mockFetch.mockResolvedValue(mockOk({ items: [{ id: 'wb-1', result: 'pending' }] }));

      const svc = new SikkaWritebackService();
      await svc.checkWritebackStatus('wb-1', 'my-app-id', 'my-app-key');

      const headers = mockFetch.mock.calls[0]![1].headers;
      expect(headers['App-Id']).toBe('my-app-id');
      expect(headers['App-Key']).toBe('my-app-key');
    });
  });

  describe('updateWritebackStatus', () => {
    it('updates writeback record in database', async () => {
      prisma.pmsWriteback.update.mockResolvedValue({});

      const svc = new SikkaWritebackService();
      await svc.updateWritebackStatus('wb-1', {
        id: 'wb-1',
        result: 'completed',
        completedTime: '2025-03-15T12:00:00Z',
      });

      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wb-1' },
          data: expect.objectContaining({
            result: 'completed',
            checkCount: { increment: 1 },
          }),
        }),
      );
    });

    it('handles failed status with error message', async () => {
      prisma.pmsWriteback.update.mockResolvedValue({});

      const svc = new SikkaWritebackService();
      await svc.updateWritebackStatus('wb-2', {
        id: 'wb-2',
        result: 'failed',
        errorMessage: 'SPU timeout',
      });

      expect(prisma.pmsWriteback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'failed',
            errorMessage: 'SPU timeout',
          }),
        }),
      );
    });
  });

  describe('pollPendingWritebacks', () => {
    it('returns zero counts when no writebacks are ready', async () => {
      prisma.pmsWriteback.findMany.mockResolvedValue([
        {
          id: 'wb-poll-1',
          pmsIntegrationId: 'int-1',
          result: 'pending',
          checkCount: 0,
          submittedAt: new Date(),
          pmsIntegration: { credentials: { appId: 'a1', appKey: 'k1' } },
        },
      ]);

      prisma.pmsWriteback.count.mockResolvedValue(1);

      const svc = new SikkaWritebackService();
      const result = await svc.pollPendingWritebacks();

      expect(result.checked).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('handles empty queue', async () => {
      prisma.pmsWriteback.findMany.mockResolvedValue([]);
      prisma.pmsWriteback.count.mockResolvedValue(0);

      const svc = new SikkaWritebackService();
      const result = await svc.pollPendingWritebacks();

      expect(result.checked).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('skips writebacks with missing credentials', async () => {
      prisma.pmsWriteback.findMany.mockResolvedValue([
        {
          id: 'wb-no-creds',
          pmsIntegrationId: 'int-bad',
          result: 'pending',
          checkCount: 1,
          submittedAt: new Date(Date.now() - 20000),
          pmsIntegration: { credentials: {} },
        },
      ]);

      prisma.pmsWriteback.count.mockResolvedValue(1);

      const svc = new SikkaWritebackService();
      await svc.pollPendingWritebacks();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('tracks skipped count for writebacks not ready', async () => {
      prisma.pmsWriteback.findMany.mockResolvedValue([]);
      prisma.pmsWriteback.count.mockResolvedValue(5);

      const svc = new SikkaWritebackService();
      const result = await svc.pollPendingWritebacks();

      expect(result.checked).toBe(0);
      expect(result.skipped).toBe(5);
    });
  });

  describe('markStuckWritebacksAsFailed', () => {
    it('marks writebacks older than 6 hours as failed', async () => {
      prisma.pmsWriteback.updateMany.mockResolvedValue({ count: 2 });

      const svc = new SikkaWritebackService();
      const count = await svc.markStuckWritebacksAsFailed();

      expect(count).toBe(2);
      expect(prisma.pmsWriteback.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ result: 'pending' }),
          data: expect.objectContaining({
            result: 'failed',
            errorMessage: expect.stringContaining('stuck in pending'),
          }),
        }),
      );
    });

    it('returns 0 when no stuck writebacks', async () => {
      prisma.pmsWriteback.updateMany.mockResolvedValue({ count: 0 });

      const svc = new SikkaWritebackService();
      const count = await svc.markStuckWritebacksAsFailed();

      expect(count).toBe(0);
    });
  });

  describe('getWritebackStatsByPractice', () => {
    it('returns aggregated stats', async () => {
      prisma.pmsWriteback.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(5);

      prisma.$queryRaw.mockResolvedValue([{ avg_duration: 12.5 }]);

      const svc = new SikkaWritebackService();
      const stats = await svc.getWritebackStatsByPractice('int-1');

      expect(stats.total).toBe(100);
      expect(stats.pending).toBe(5);
      expect(stats.completed).toBe(90);
      expect(stats.failed).toBe(5);
      expect(stats.successRate).toBe('90.0');
      expect(stats.avgDurationSeconds).toBe(12.5);
    });

    it('handles zero total gracefully', async () => {
      prisma.pmsWriteback.count.mockResolvedValue(0);
      prisma.$queryRaw.mockResolvedValue([{ avg_duration: null }]);

      const svc = new SikkaWritebackService();
      const stats = await svc.getWritebackStatsByPractice('int-empty');

      expect(stats.total).toBe(0);
      expect(stats.successRate).toBe('0.0');
      expect(stats.avgDurationSeconds).toBe(0);
    });
  });

  describe('retryFailedWritebacks', () => {
    it('skips during high-traffic hours', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      const svc = new SikkaWritebackService();
      const result = await svc.retryFailedWritebacks();

      expect(result.retried).toBe(0);
      expect(result.successful).toBe(0);

      jest.restoreAllMocks();
    });

    it('retries during low-traffic hours', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(2);

      prisma.pmsWriteback.findMany.mockResolvedValue([
        {
          id: 'wb-retry',
          pmsIntegrationId: 'int-1',
          result: 'failed',
          checkCount: 3,
          submittedAt: new Date(),
          pmsIntegration: { credentials: { appId: 'a', appKey: 'k' } },
        },
      ]);

      mockFetch.mockResolvedValue(mockOk({
        items: [{ id: 'wb-retry', result: 'completed', completed_time: new Date().toISOString() }],
      }));

      prisma.pmsWriteback.update.mockResolvedValue({});

      const svc = new SikkaWritebackService();
      const result = await svc.retryFailedWritebacks();

      expect(result.retried).toBe(1);
      expect(result.successful).toBe(1);

      jest.restoreAllMocks();
    });
  });

  describe('getApiUsageReport', () => {
    it('returns empty report when no rate limits tracked', async () => {
      const svc = new SikkaWritebackService();
      const report = await svc.getApiUsageReport();

      expect(report).toEqual([]);
    });
  });

  describe('standalone functions', () => {
    it('pollSikkaWritebacks runs markStuck then poll', async () => {
      prisma.pmsWriteback.updateMany.mockResolvedValue({ count: 0 });
      prisma.pmsWriteback.findMany.mockResolvedValue([]);
      prisma.pmsWriteback.count.mockResolvedValue(0);

      const result = await pollSikkaWritebacks();
      expect(result.checked).toBe(0);
    });

    it('retrySikkaWritebacks delegates to service', async () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);

      const result = await retrySikkaWritebacks();
      expect(result.retried).toBe(0);

      jest.restoreAllMocks();
    });
  });
});
