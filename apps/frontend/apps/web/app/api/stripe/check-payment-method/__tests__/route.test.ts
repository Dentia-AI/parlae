import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        paymentMethodVerified: true,
        paymentMethodVerifiedAt: new Date(),
      }),
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

describe('GET /api/stripe/check-payment-method', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return payment method status', async () => {
    const request = new NextRequest(
      'http://localhost/api/stripe/check-payment-method?accountId=acc-1',
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.verified).toBe(true);
  });

  it('should return 401 when not authenticated', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);
    const request = new NextRequest(
      'http://localhost/api/stripe/check-payment-method?accountId=acc-1',
    );
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
