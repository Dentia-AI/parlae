import { GET } from '../route';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?test'),
      })),
    },
  },
}));

describe('GET /api/google-calendar/auth-url', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns an OAuth URL', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toContain('https://accounts.google.com');
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 401 when no session', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
