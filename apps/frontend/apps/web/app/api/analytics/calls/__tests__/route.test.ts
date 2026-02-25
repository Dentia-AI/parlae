import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: jest.fn().mockResolvedValue('VAPI'),
}));

const { getAccountProvider: mockGetAccountProvider } =
  jest.requireMock<{ getAccountProvider: jest.Mock }>('@kit/shared/voice-provider');

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

describe('GET /api/analytics/calls', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return analytics for VAPI provider', async () => {
    mockGetAccountProvider.mockResolvedValue('VAPI');
    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('should return analytics for RETELL provider', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: {
        retellReceptionistAgentId: 'agent-retell-1',
      },
    });

    jest.mock('@kit/shared/retell/retell.service', () => ({
      createRetellService: jest.fn().mockReturnValue({
        listCalls: jest.fn().mockResolvedValue([
          {
            call_id: 'retell-call-1',
            call_status: 'ended',
            start_timestamp: Date.now() - 120_000,
            end_timestamp: Date.now(),
            from_number: '+14165551234',
            direction: 'inbound',
            call_analysis: {
              call_outcome: 'appointment_booked',
              caller_satisfied: true,
              patient_name: 'Test Patient',
              appointment_type: 'Cleaning',
            },
          },
        ]),
      }),
    }), { virtual: true });

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics).toBeDefined();
    expect(data.metrics.totalCalls).toBeGreaterThanOrEqual(0);
  });
});
