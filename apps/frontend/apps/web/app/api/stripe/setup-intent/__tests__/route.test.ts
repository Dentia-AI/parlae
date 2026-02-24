import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        name: 'Test Account',
        email: 'test@test.com',
      }),
      findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', stripeCustomerId: null }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({
    id: 'user-1',
    email: 'test@test.com',
    data: { accounts: [{ value: 'acc-1' }] },
  }),
}));

jest.mock('stripe', () => {
  const mockInstance = {
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
    setupIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'seti_test',
        client_secret: 'seti_secret',
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

describe('POST /api/stripe/setup-intent', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'seti_test', client_secret: 'seti_secret' }),
    });
  });
  afterEach(() => jest.clearAllMocks());

  it('should create setup intent', async () => {
    const request = new NextRequest('http://localhost/api/stripe/setup-intent', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'acc-1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
