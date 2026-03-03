import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({
    user: { id: 'user-1' },
  }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    outboundCampaign: {
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

function makeRequest() {
  return new NextRequest('http://localhost/api/outbound/campaigns/approve-all', {
    method: 'POST',
  });
}

describe('POST /api/outbound/campaigns/approve-all', () => {
  afterEach(() => jest.clearAllMocks());

  it('approves all DRAFT campaigns and returns the count', async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.approved).toBe(3);

    const { prisma } = require('@kit/prisma');
    expect(prisma.outboundCampaign.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', status: 'DRAFT' },
      data: {
        status: 'ACTIVE',
        scheduledStartAt: expect.any(Date),
      },
    });
  });

  it('returns 0 approved when no DRAFT campaigns exist', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.approved).toBe(0);
  });

  it('returns 404 when user has no account', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Account not found');
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});
