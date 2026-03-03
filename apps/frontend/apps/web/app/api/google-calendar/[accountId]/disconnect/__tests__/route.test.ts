import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));

function makeRequest(accountId: string) {
  return [
    new NextRequest(`http://localhost/api/google-calendar/${accountId}/disconnect`, { method: 'POST' }),
    { params: Promise.resolve({ accountId }) },
  ] as const;
}

describe('POST /api/google-calendar/[accountId]/disconnect', () => {
  afterEach(() => jest.clearAllMocks());

  it('clears Google Calendar fields for given accountId', async () => {
    const { prisma } = require('@kit/prisma');
    const [req, ctx] = makeRequest('acc-1');
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        googleCalendarConnected: false,
        googleCalendarAccessToken: null,
      }),
    });
  });

  it('returns 401 when no session', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('acc-1');
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });
});
