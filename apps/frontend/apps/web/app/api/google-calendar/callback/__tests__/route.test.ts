import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'at',
            refresh_token: 'rt',
            expiry_date: Date.now() + 3600000,
          },
        }),
        setCredentials: jest.fn(),
      })),
    },
    oauth2: jest.fn().mockReturnValue({
      userinfo: { get: jest.fn().mockResolvedValue({ data: { email: 'test@clinic.com' } }) },
    }),
    calendar: jest.fn().mockReturnValue({
      calendarList: {
        list: jest.fn().mockResolvedValue({
          data: { items: [{ id: 'primary', primary: true }] },
        }),
      },
    }),
  },
}));

describe('GET /api/google-calendar/callback', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/api/google-calendar/callback';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  });
  afterEach(() => jest.clearAllMocks());

  it('should handle OAuth callback', async () => {
    const request = new NextRequest(
      'http://localhost/api/google-calendar/callback?code=auth-code&state=acc-1',
    );
    const response = await GET(request);
    expect([200, 302, 307]).toContain(response.status);
  });

  it('should handle missing code by redirecting with error', async () => {
    const request = new NextRequest('http://localhost/api/google-calendar/callback?state=acc-1');
    const response = await GET(request);
    expect([302, 307, 400]).toContain(response.status);
  });
});
