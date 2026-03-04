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
        providerName: null,
        config: { practiceName: 'Test Dental' },
        metadata: null,
      }),
    },
  },
}));

describe('GET /api/pms/status', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns practice name instead of raw SIKKA enum', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.providerName).toBe('Test Dental');
    expect(body.practiceName).toBe('Test Dental');
  });

  it('returns actualPmsType from metadata when available', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce({
      provider: 'SIKKA',
      providerName: null,
      config: null,
      metadata: { actualPmsType: 'Opendental', practiceName: 'Smile Clinic' },
    });

    const res = await GET();
    const body = await res.json();

    expect(body.connected).toBe(true);
    expect(body.providerName).toBe('Opendental');
    expect(body.practiceName).toBe('Smile Clinic');
  });

  it('returns null providerName when only raw enum exists', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce({
      provider: 'SIKKA',
      providerName: null,
      config: null,
      metadata: null,
    });

    const res = await GET();
    const body = await res.json();

    expect(body.connected).toBe(true);
    expect(body.providerName).toBeNull();
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
