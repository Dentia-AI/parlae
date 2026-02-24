jest.mock('server-only', () => ({}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, CAPTCHA_SECRET_TOKEN: 'test-captcha-secret' };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('verifyCaptchaToken', () => {
  async function loadModule() {
    return await import('./verify-captcha');
  }

  it('sends the token and secret to the Turnstile endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { verifyCaptchaToken } = await loadModule();
    await verifyCaptchaToken('user-captcha-token');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(options.method).toBe('POST');

    const body = options.body as FormData;
    expect(body.get('secret')).toBe('test-captcha-secret');
    expect(body.get('response')).toBe('user-captcha-token');
  });

  it('succeeds when verification returns success: true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { verifyCaptchaToken } = await loadModule();
    await expect(verifyCaptchaToken('valid-token')).resolves.toBeUndefined();
  });

  it('throws when CAPTCHA_SECRET_TOKEN is not set', async () => {
    process.env.CAPTCHA_SECRET_TOKEN = '';

    const { verifyCaptchaToken } = await loadModule();
    await expect(verifyCaptchaToken('any-token')).rejects.toThrow('CAPTCHA_SECRET_TOKEN is not set');
  });

  it('throws when fetch response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { verifyCaptchaToken } = await loadModule();
    await expect(verifyCaptchaToken('bad-token')).rejects.toThrow('Failed to verify CAPTCHA token');
  });

  it('throws when verification returns success: false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    });

    const { verifyCaptchaToken } = await loadModule();
    await expect(verifyCaptchaToken('invalid-token')).rejects.toThrow('Invalid CAPTCHA token');
  });
});
