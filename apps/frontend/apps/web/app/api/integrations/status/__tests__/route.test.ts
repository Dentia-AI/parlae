import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'acc-1',
          googleCalendarConnected: true,
          googleCalendarEmail: 'test@clinic.com',
          isPersonalAccount: true,
          setupProgress: {},
        },
      ]),
    },
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({
    id: 'user-1',
    data: { accounts: [{ value: 'acc-1' }] },
  }),
}));

describe('GET /api/integrations/status', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return integration status', async () => {
    const request = new NextRequest('http://localhost/api/integrations/status');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('should return 401 when not authenticated', async () => {
    const { getSessionUser } = require('@kit/shared/auth');
    getSessionUser.mockResolvedValueOnce(null);
    const request = new NextRequest('http://localhost/api/integrations/status');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
