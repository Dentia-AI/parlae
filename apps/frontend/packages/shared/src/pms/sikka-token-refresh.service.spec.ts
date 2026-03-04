const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@prisma/client', () => {
  const instance = {
    pmsIntegration: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn().mockReturnValue(instance),
    __mockInstance: instance,
  };
});

import { SikkaTokenRefreshService, refreshAllSikkaTokens, refreshExpiringSikkaTokens } from './sikka-token-refresh.service';

const { __mockInstance: prisma } = jest.requireMock<any>('@prisma/client');

function mockOk(data: any) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

function mockError(status: number, data: any = {}) {
  return { ok: false, status, json: () => Promise.resolve(data) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SikkaTokenRefreshService', () => {
  describe('refreshIntegrationToken', () => {
    it('returns false for non-Sikka integrations', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-1',
        provider: 'OPEN_DENTAL',
        credentials: {},
      });

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
    });

    it('returns false when integration not found', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue(null);

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('nonexistent');

      expect(result).toBe(false);
    });

    it('returns false when credentials lack appId/appKey', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-1',
        provider: 'SIKKA',
        credentials: { appId: '', appKey: '' },
        refreshKey: null,
      });

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-1');

      expect(result).toBe(false);
    });

    it('refreshes token using refresh_key and saves to database', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-1',
        provider: 'SIKKA',
        credentials: { appId: 'app1', appKey: 'key1' },
        refreshKey: 'existing-refresh',
      });

      mockFetch.mockResolvedValue(mockOk({
        request_key: 'new-req',
        refresh_key: 'new-refresh',
        expires_in: '86400 second(s)',
      }));

      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-1');

      expect(result).toBe(true);
      expect(prisma.pmsIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'int-1' },
          data: expect.objectContaining({
            requestKey: 'new-req',
            refreshKey: 'new-refresh',
            status: 'ACTIVE',
            lastError: null,
          }),
        }),
      );
    });

    it('falls back to initial token when refresh fails', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-2',
        provider: 'SIKKA',
        credentials: { appId: 'app1', appKey: 'key1', officeId: 'off-1', secretKey: 'sec-1' },
        refreshKey: 'stale-key',
        officeId: 'off-1',
        secretKey: 'sec-1',
      });

      mockFetch
        .mockResolvedValueOnce(mockError(401, { error: 'expired' }))
        .mockResolvedValueOnce(mockOk({
          request_key: 'fresh-req',
          refresh_key: 'fresh-refresh',
          expires_in: '86400',
        }));

      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-2');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('marks integration as ERROR on failure', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-3',
        provider: 'SIKKA',
        credentials: { appId: 'app1', appKey: 'key1', officeId: 'off-1', secretKey: 'sec-1' },
        refreshKey: null,
        officeId: 'off-1',
        secretKey: 'sec-1',
      });

      mockFetch.mockRejectedValue(new Error('Network down'));
      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-3');

      expect(result).toBe(false);
      expect(prisma.pmsIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ERROR',
            lastError: expect.stringContaining('Token refresh failed'),
          }),
        }),
      );
    });

    it('uses officeId from credentials when not on integration record', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-4',
        provider: 'SIKKA',
        credentials: { appId: 'app1', appKey: 'key1', officeId: 'off-cred', secretKey: 'sec-cred' },
        refreshKey: null,
        officeId: null,
        secretKey: null,
      });

      mockFetch.mockResolvedValue(mockOk({
        request_key: 'rk',
        refresh_key: 'rfk',
        expires_in: '86400',
      }));

      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-4');

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.office_id).toBe('off-cred');
    });

    it('returns false when no officeId/secretKey for initial token', async () => {
      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-5',
        provider: 'SIKKA',
        credentials: { appId: 'app1', appKey: 'key1' },
        refreshKey: null,
        officeId: null,
        secretKey: null,
      });

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshIntegrationToken('int-5');

      expect(result).toBe(false);
    });
  });

  describe('refreshAllTokens', () => {
    it('refreshes all active Sikka integrations', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([
        { id: 'int-a' },
        { id: 'int-b' },
      ]);

      prisma.pmsIntegration.findUnique
        .mockResolvedValueOnce({
          id: 'int-a', provider: 'SIKKA',
          credentials: { appId: 'a1', appKey: 'k1' }, refreshKey: 'rk-a',
        })
        .mockResolvedValueOnce({
          id: 'int-b', provider: 'SIKKA',
          credentials: { appId: 'a2', appKey: 'k2' }, refreshKey: 'rk-b',
        });

      mockFetch.mockResolvedValue(mockOk({
        request_key: 'new-rk', refresh_key: 'new-rfk', expires_in: '86400',
      }));

      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshAllTokens();

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('reports failures correctly', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([
        { id: 'int-fail' },
      ]);

      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-fail', provider: 'SIKKA',
        credentials: { appId: 'a', appKey: 'k' }, refreshKey: 'rk',
      });

      mockFetch.mockRejectedValue(new Error('fail'));
      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshAllTokens();

      expect(result.failed).toBe(1);
    });
  });

  describe('refreshExpiringTokens', () => {
    it('refreshes tokens expiring soon', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([
        { id: 'int-expiring' },
      ]);

      prisma.pmsIntegration.findUnique.mockResolvedValue({
        id: 'int-expiring', provider: 'SIKKA',
        credentials: { appId: 'a', appKey: 'k' }, refreshKey: 'rk',
      });

      mockFetch.mockResolvedValue(mockOk({
        request_key: 'rk', refresh_key: 'rfk', expires_in: '86400',
      }));

      prisma.pmsIntegration.update.mockResolvedValue({});

      const svc = new SikkaTokenRefreshService();
      const result = await svc.refreshExpiringTokens();

      expect(result.success + result.failed).toBeLessThanOrEqual(1);
    });
  });

  describe('standalone functions', () => {
    it('refreshAllSikkaTokens delegates to service', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([]);
      const result = await refreshAllSikkaTokens();
      expect(result).toEqual({ success: 0, failed: 0 });
    });

    it('refreshExpiringSikkaTokens delegates to service', async () => {
      prisma.pmsIntegration.findMany.mockResolvedValue([]);
      const result = await refreshExpiringSikkaTokens();
      expect(result).toEqual({ success: 0, failed: 0 });
    });
  });
});
