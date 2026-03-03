import { GET } from '../route';

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
        stripeCustomerId: 'cus_123',
        stripePaymentMethodId: 'pm_123',
        paymentMethodVerified: true,
      }),
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
    paymentMethods: {
      retrieve: jest.fn().mockResolvedValue({
        card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2027 },
      }),
    },
  })),
}));

describe('GET /api/stripe/payment-method', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns payment method details', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasPaymentMethod).toBe(true);
    expect(body.card.brand).toBe('visa');
    expect(body.card.last4).toBe('4242');
  });

  it('returns no payment method when IDs missing', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      stripeCustomerId: null,
      stripePaymentMethodId: null,
      paymentMethodVerified: false,
    });

    const res = await GET();
    const body = await res.json();

    expect(body.hasPaymentMethod).toBe(false);
    expect(body.card).toBeNull();
  });

  it('returns 401 when no session', async () => {
    const { getSessionUser } = require('@kit/shared/auth');
    getSessionUser.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
