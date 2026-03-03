import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
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

function makeRequest(accountId: string) {
  return [
    new NextRequest(`http://localhost/api/google-calendar/${accountId}/auth-url`),
    { params: Promise.resolve({ accountId }) },
  ] as const;
}

describe('GET /api/google-calendar/[accountId]/auth-url', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns OAuth URL for given accountId', async () => {
    const [req, ctx] = makeRequest('acc-1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.authUrl).toContain('https://accounts.google.com');
  });

  it('returns 401 when no session', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('acc-1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});
