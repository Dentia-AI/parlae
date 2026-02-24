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

describe('POST /api/auth/verify-email', () => {
  beforeEach(() => {
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.COGNITO_CLIENT_SECRET = 'test-secret';
    process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/test';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => jest.clearAllMocks());

  it('should verify email successfully', async () => {
    const request = new Request('http://localhost/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ username: 'john@example.com', code: '123456' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should return error for invalid code', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ __type: 'CodeMismatchException' }),
    });
    const request = new Request('http://localhost/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ username: 'john@example.com', code: '000000' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
