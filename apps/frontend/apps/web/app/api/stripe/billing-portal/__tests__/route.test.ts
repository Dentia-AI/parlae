import { POST } from '../route';
import { NextRequest } from 'next/server';

const originalEnv = process.env;
beforeAll(() => {
  process.env = { ...originalEnv, STRIPE_SECRET_KEY: 'sk_test_fake' };
});
afterAll(() => {
  process.env = originalEnv;
});

jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        stripeCustomerId: 'cus_123',
        name: 'Test Clinic',
        email: 'test@clinic.com',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
    billingPortal: {
      sessions: { create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session' }) },
    },
  })),
}));

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/stripe/billing-portal', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/stripe/billing-portal', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a portal session and returns URL', async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://billing.stripe.com/session');
  });

  it('creates Stripe customer if none exists', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      id: 'acc-1',
      stripeCustomerId: null,
      name: 'Test Clinic',
      email: 'test@clinic.com',
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBeDefined();
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeCustomerId: 'cus_new' } }),
    );
  });

  it('returns 401 when no session', async () => {
    const { getSessionUser } = require('@kit/shared/auth');
    getSessionUser.mockResolvedValueOnce(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });
});
