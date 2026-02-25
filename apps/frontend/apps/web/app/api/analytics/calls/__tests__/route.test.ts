import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    vapiPhoneNumber: { findMany: jest.fn().mockResolvedValue([{ vapiPhoneId: 'pn-1' }]) },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  },
}));
jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));
jest.mock('~/lib/auth/admin', () => ({
  isAdminUser: jest.fn().mockResolvedValue(false),
}));
jest.mock('@kit/shared/vapi/vapi.service', () => ({
  createVapiService: jest.fn().mockReturnValue({
    listCalls: jest.fn().mockResolvedValue([]),
    getCallAnalytics: jest.fn().mockResolvedValue([]),
  }),
}));
jest.mock('@kit/shared/vapi/cost-calculator', () => ({
  calculateBlendedCost: jest.fn().mockReturnValue({ totalDollars: 0 }),
  getPlatformPricing: jest.fn().mockResolvedValue({
    twilioInboundPerMin: 0.0085,
    twilioOutboundPerMin: 0.014,
    serverCostPerMin: 0.005,
    markupPercent: 30,
  }),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: jest.fn().mockResolvedValue('VAPI'),
}));

describe('GET /api/analytics/calls', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return analytics', async () => {
    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
