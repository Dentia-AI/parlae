import { GET } from '../route';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({
        provider: 'SIKKA',
        config: { practiceName: 'Test Dental' },
      }),
    },
  },
}));

describe('GET /api/pms/status', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns connected status with provider and practice name', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.providerName).toBe('SIKKA');
    expect(body.practiceName).toBe('Test Dental');
  });

  it('returns disconnected when no integration', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json();

    expect(body.connected).toBe(false);
  });

  it('returns 401 when no session', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
