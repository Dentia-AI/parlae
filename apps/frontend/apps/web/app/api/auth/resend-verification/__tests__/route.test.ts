import { POST } from '../route';

jest.mock('@kit/shared/auth/cognito-helpers', () => ({
  createSecretHash: jest.fn().mockReturnValue('hash'),
  parseCognitoRegion: jest.fn().mockReturnValue('us-east-1'),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.COGNITO_CLIENT_SECRET = 'test-secret';
    process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/test';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => jest.clearAllMocks());

  it('should resend verification code', async () => {
    const request = new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ username: 'john@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should handle Cognito error', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ __type: 'LimitExceededException' }),
    });
    const request = new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ username: 'john@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
