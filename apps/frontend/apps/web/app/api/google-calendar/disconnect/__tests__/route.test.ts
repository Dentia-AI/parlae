import { POST } from '../route';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));

describe('POST /api/google-calendar/disconnect', () => {
  afterEach(() => jest.clearAllMocks());

  it('clears Google Calendar fields and returns success', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        googleCalendarConnected: false,
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
      }),
    });
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await POST();
    expect(res.status).toBe(404);
  });

  it('returns 401 when no session', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const res = await POST();
    expect(res.status).toBe(401);
  });
});
