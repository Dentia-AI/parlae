import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Clinic A' }]),
    },
  },
}));
jest.mock('~/lib/auth/is-admin', () => ({
  requireAdmin: jest.fn().mockResolvedValue(undefined),
}));

describe('GET /api/admin/billing/clinics', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return clinics with billing config', async () => {
    const request = new NextRequest('http://localhost/api/admin/billing/clinics');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
