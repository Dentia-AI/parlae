import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', publicData: {} }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));
jest.mock('~/lib/auth/is-admin', () => ({
  requireAdmin: jest.fn().mockResolvedValue(undefined),
}));

describe('POST /api/admin/billing/update', () => {
  afterEach(() => jest.clearAllMocks());

  it('should update billing config', async () => {
    const request = new NextRequest('http://localhost/api/admin/billing/update', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'acc-1', plan: 'pro', activationFee: 9900 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
