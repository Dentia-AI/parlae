import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        publicData: { plan: 'starter' },
      }),
    },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({
    id: 'user-1',
    data: { accounts: [{ value: 'acc-1' }] },
  }),
}));

describe('GET /api/billing/config', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return billing config', async () => {
    const request = new NextRequest('http://localhost/api/billing/config');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
