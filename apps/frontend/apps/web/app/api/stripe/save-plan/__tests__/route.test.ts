import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        publicData: {},
      }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({
    id: 'user-1',
    data: { accounts: [{ value: 'acc-1' }] },
  }),
}));

describe('POST /api/stripe/save-plan', () => {
  afterEach(() => jest.clearAllMocks());

  it('should save plan configuration', async () => {
    const request = new NextRequest('http://localhost/api/stripe/save-plan', {
      method: 'POST',
      body: JSON.stringify({
        locations: 1,
        features: ['basic'],
        estimatedCallVolume: 100,
        currency: 'usd',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should return 401 when not authenticated', async () => {
    const { getSessionUser } = require('@kit/shared/auth');
    getSessionUser.mockResolvedValueOnce(null);
    const request = new NextRequest('http://localhost/api/stripe/save-plan', {
      method: 'POST',
      body: JSON.stringify({ locations: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
