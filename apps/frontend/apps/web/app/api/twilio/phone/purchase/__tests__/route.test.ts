import { POST } from '../route';

jest.mock('@kit/shared/twilio/server', () => ({
  createTwilioService: jest.fn().mockReturnValue({
    isEnabled: () => true,
    purchaseNumber: jest.fn().mockResolvedValue({
      phoneNumber: '+14155551234',
      sid: 'PN123',
    }),
  }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn().mockResolvedValue({
        paymentMethodVerified: true,
        stripePaymentMethodId: 'pm_123',
      }),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/twilio/phone/purchase', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/twilio/phone/purchase', () => {
  afterEach(() => jest.clearAllMocks());

  it('purchases a number when payment is verified', async () => {
    const res = await POST(makeRequest({ phoneNumber: '+14155551234', accountId: 'acc-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.number.phoneNumber).toBe('+14155551234');
  });

  it('returns 402 when payment not verified', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      paymentMethodVerified: false,
      stripePaymentMethodId: null,
    });

    const res = await POST(makeRequest({ phoneNumber: '+14155551234', accountId: 'acc-1' }));
    expect(res.status).toBe(402);
  });

  it('returns 400 when phoneNumber missing', async () => {
    const res = await POST(makeRequest({ accountId: 'acc-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when accountId missing', async () => {
    const res = await POST(makeRequest({ phoneNumber: '+14155551234' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ phoneNumber: '+14155551234', accountId: 'bad' }));
    expect(res.status).toBe(404);
  });
});
