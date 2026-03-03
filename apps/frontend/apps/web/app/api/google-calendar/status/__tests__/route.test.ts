import { GET } from '../route';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        googleCalendarConnected: true,
        googleCalendarEmail: 'user@gmail.com',
      }),
    },
  },
}));

describe('GET /api/google-calendar/status', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns connected status and email', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.email).toBe('user@gmail.com');
  });

  it('returns connected false when no account', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

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
