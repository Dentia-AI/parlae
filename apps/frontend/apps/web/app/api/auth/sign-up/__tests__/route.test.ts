import { POST } from '../route';

jest.mock('@kit/shared/auth', () => ({
  ensureUserProvisioned: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@kit/shared/auth/cognito-helpers', () => ({
  createSecretHash: jest.fn().mockReturnValue('hash'),
  parseCognitoRegion: jest.fn().mockReturnValue('us-east-1'),
}));

jest.mock('@kit/shared/employee-management', () => ({
  acceptInvitation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@kit/shared/gohighlevel/server', () => ({
  createGoHighLevelService: jest.fn().mockReturnValue({
    syncContact: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('POST /api/auth/sign-up', () => {
  beforeEach(() => {
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.COGNITO_CLIENT_SECRET = 'test-secret';
    process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ UserConfirmed: false, UserSub: 'sub-123' }),
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('should return 400 for invalid body', async () => {
    const request = new Request('http://localhost/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return 201 for valid sign-up', async () => {
    const request = new Request('http://localhost/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'StrongP@ss123',
        confirmPassword: 'StrongP@ss123',
        acceptTerms: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should handle Cognito error', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ __type: 'UsernameExistsException', message: 'User exists' }),
    });

    const request = new Request('http://localhost/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'John Doe',
        email: 'existing@example.com',
        password: 'StrongP@ss123',
        confirmPassword: 'StrongP@ss123',
        acceptTerms: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
