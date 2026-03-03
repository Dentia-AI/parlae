import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    outboundSettings: {
      findUnique: jest.fn().mockResolvedValue({
        patientCareEnabled: true,
        financialEnabled: false,
      }),
    },
    outboundCampaign: {
      count: jest.fn().mockResolvedValue(3),
    },
    campaignContact: {
      findMany: jest.fn().mockResolvedValue([
        { status: 'COMPLETED', outcome: 'booked' },
        { status: 'COMPLETED', outcome: 'confirmed' },
        { status: 'COMPLETED', outcome: 'no_answer' },
        { status: 'FAILED', outcome: null },
      ]),
    },
  },
}));

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/analytics/outbound${query ? `?${query}` : ''}`);
}

describe('GET /api/analytics/outbound', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns stats when outbound is enabled', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.outboundCalls).toBe(4);
    expect(body.activeCampaigns).toBe(3);
  });

  it('calculates reachRate and successRate correctly', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    // 3 COMPLETED out of 4 total = 75% reach rate
    expect(body.reachRate).toBe(75);
    // 2 positive outcomes (booked, confirmed) out of 4 total = 50%
    expect(body.successRate).toBe(50);
  });

  it('returns zeroed response when outbound is disabled', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundSettings.findUnique.mockResolvedValueOnce({
      patientCareEnabled: false,
      financialEnabled: false,
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.enabled).toBe(false);
    expect(body.outboundCalls).toBe(0);
  });

  it('returns zeroed response when no account', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.enabled).toBe(false);
    expect(body.outboundCalls).toBe(0);
  });
});
