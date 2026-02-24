import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-1' }]),
    },
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'pms-1',
        officeId: 'office-1',
        secretKey: 'secret-key',
        status: 'ACTIVE',
        metadata: { practiceName: 'Test Dental' },
        features: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({
    id: 'user-1',
    data: { accounts: [{ value: 'acc-1' }] },
  }),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('GET /api/pms/connection-status', () => {
  beforeEach(() => {
    process.env.SIKKA_APP_ID = 'app-id';
    process.env.SIKKA_APP_KEY = 'app-key';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          request_key: 'req-key',
          refresh_key: 'ref-key',
          expires_in: '86400',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              office_id: 'office-1',
              practice_name: 'Test Dental',
              practice_management_system: 'Dentrix',
            },
          ],
        }),
      });
  });
  afterEach(() => jest.clearAllMocks());

  it('should return connection status', async () => {
    const request = new NextRequest('http://localhost/api/pms/connection-status?accountId=acc-1');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
