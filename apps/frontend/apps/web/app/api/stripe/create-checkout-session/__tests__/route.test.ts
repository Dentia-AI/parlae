jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { POST } from '../route';

describe('POST /api/stripe/create-checkout-session', () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = 'http://localhost:4000';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'cs_test',
        clientSecret: 'secret',
        url: 'https://checkout.stripe.com',
      }),
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('should proxy to backend and return session', async () => {
    const request = new Request('http://localhost/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'u-1',
        amountCents: 5000,
        currency: 'usd',
        paymentType: 'ONE_TIME',
        customerEmail: 'test@test.com',
        returnUrl: 'http://localhost/return',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
