import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        stripeCustomerId: 'cus_test',
        stripePaymentMethodId: 'pm_test',
        phoneIntegrationSettings: {},
        publicData: {},
      }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));
jest.mock('~/lib/auth/get-session', () => ({
  getEffectiveUserId: jest.fn().mockResolvedValue('user-1'),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('stripe', () => {
  const mockInstance = {
    paymentMethods: { attach: jest.fn().mockResolvedValue({}) },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
      }),
    },
  };
  return {
    __esModule: true,
    default: function Stripe() {
      return mockInstance;
    },
  };
});

describe('POST /api/stripe/charge-activation', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pi_test', status: 'succeeded' }),
    });
  });
  afterEach(() => jest.clearAllMocks());

  it('should charge activation fee', async () => {
    const request = new NextRequest('http://localhost/api/stripe/charge-activation', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'acc-1', amount: 9900 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should return 401 when not authenticated', async () => {
    const { getEffectiveUserId } = require('~/lib/auth/get-session');
    getEffectiveUserId.mockResolvedValueOnce(null);
    const request = new NextRequest('http://localhost/api/stripe/charge-activation', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'acc-1', amount: 9900 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
