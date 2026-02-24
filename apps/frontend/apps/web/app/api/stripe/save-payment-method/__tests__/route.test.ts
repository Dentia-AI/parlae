import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', stripeCustomerId: 'cus_test' }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));
jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('stripe', () => ({
  default: jest.fn().mockReturnValue({
    customers: {
      update: jest.fn().mockResolvedValue({}),
    },
  }),
}));

describe('POST /api/stripe/save-payment-method', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  });
  afterEach(() => jest.clearAllMocks());

  it('should save payment method', async () => {
    const request = new NextRequest('http://localhost/api/stripe/save-payment-method', {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId: 'pm_test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should return 401 when not authenticated', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);
    const request = new NextRequest('http://localhost/api/stripe/save-payment-method', {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId: 'pm_test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
