import { GET } from '../route';
import { NextRequest } from 'next/server';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const originalEnv = process.env;
beforeAll(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_BACKEND_URL: 'http://backend:3333' };
});
afterAll(() => {
  process.env = originalEnv;
});

function makeState(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      accountId: 'acc-1',
      timestamp: Date.now(),
      ...overrides,
    }),
  ).toString('base64');
}

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/api/pms/sikka/oauth/callback?${query}`);
}

describe('GET /api/pms/sikka/oauth/callback', () => {
  afterEach(() => jest.clearAllMocks());

  it('exchanges code and redirects to success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const state = makeState();
    const res = await GET(makeRequest(`code=auth-code-123&state=${state}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('status=success');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://backend:3333/pms/sikka/exchange-code',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('redirects to error on expired state', async () => {
    const expiredState = makeState({ timestamp: Date.now() - 15 * 60 * 1000 });
    const res = await GET(makeRequest(`code=auth-code&state=${expiredState}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('status=error');
  });

  it('redirects to error when code is missing', async () => {
    const res = await GET(makeRequest(`state=${makeState()}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('status=error');
  });

  it('redirects to error when OAuth error is present', async () => {
    const res = await GET(makeRequest('error=access_denied&error_description=User%20denied'));

    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('status=error');
  });
});
