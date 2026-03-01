import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: jest.fn().mockResolvedValue('VAPI'),
}));

const { getAccountProvider: mockGetAccountProvider } =
  jest.requireMock<{ getAccountProvider: jest.Mock }>('@kit/shared/voice-provider');

const mockRetellListCalls = jest.fn().mockResolvedValue([]);

jest.mock('@kit/prisma', () => ({
  prisma: {
    vapiPhoneNumber: { findMany: jest.fn().mockResolvedValue([{ vapiPhoneId: 'pn-1' }]) },
    retellPhoneNumber: { findMany: jest.fn().mockResolvedValue([{ phoneNumber: '+14165559999' }]) },
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
jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: jest.fn().mockReturnValue({
    listCalls: mockRetellListCalls,
  }),
}), { virtual: true });

function makeRetellCall(overrides: Record<string, any> = {}) {
  return {
    call_id: `retell-call-${Math.random().toString(36).slice(2, 8)}`,
    call_status: 'ended',
    start_timestamp: Date.now() - 120_000,
    end_timestamp: Date.now(),
    from_number: '+14165551234',
    to_number: '+14165559999',
    direction: 'inbound',
    call_analysis: {
      call_outcome: 'appointment_booked',
      caller_satisfied: true,
      patient_name: 'Test Patient',
      appointment_type: 'Cleaning',
    },
    ...overrides,
  };
}

describe('GET /api/analytics/calls', () => {
  const { prisma } = require('@kit/prisma');

  afterEach(() => jest.clearAllMocks());

  it('should return analytics for VAPI provider', async () => {
    mockGetAccountProvider.mockResolvedValue('VAPI');
    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('should return analytics for RETELL provider with phone-based filtering', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const matchingCall = makeRetellCall({ call_id: 'match-1', to_number: '+14165559999' });
    const otherClinicCall = makeRetellCall({ call_id: 'other-1', to_number: '+19055550000', from_number: '+19055551111' });
    mockRetellListCalls.mockResolvedValueOnce([matchingCall, otherClinicCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics).toBeDefined();
    expect(data.metrics.totalCalls).toBe(1);
  });

  it('should exclude calls not matching clinic phone numbers', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const foreignCalls = [
      makeRetellCall({ call_id: 'foreign-1', to_number: '+12125550000', from_number: '+12125551111' }),
      makeRetellCall({ call_id: 'foreign-2', to_number: '+13105550000', from_number: '+13105551111' }),
    ];
    mockRetellListCalls.mockResolvedValueOnce(foreignCalls);

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCalls).toBe(0);
  });

  it('should include calls matching from_number (outbound)', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const outboundCall = makeRetellCall({
      call_id: 'outbound-1',
      from_number: '+14165559999',
      to_number: '+14165551234',
      direction: 'outbound',
    });
    mockRetellListCalls.mockResolvedValueOnce([outboundCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCalls).toBe(1);
  });

  it('should include calls from historical phone numbers', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [
        { phoneNumber: '+14165558888', retiredAt: '2026-01-15T00:00:00.000Z' },
      ],
    });

    const currentCall = makeRetellCall({ call_id: 'current-1', to_number: '+14165559999' });
    const historicalCall = makeRetellCall({ call_id: 'historical-1', to_number: '+14165558888' });
    const foreignCall = makeRetellCall({ call_id: 'foreign-1', to_number: '+12125550000', from_number: '+12125551111' });
    mockRetellListCalls.mockResolvedValueOnce([currentCall, historicalCall, foreignCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCalls).toBe(2);
  });

  it('should return empty result when no clinic phones found', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: {},
      phoneNumberHistory: [],
    });

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCalls).toBe(0);
  });

  it('should count rescheduled calls as bookings in booking rate', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const bookedCall = makeRetellCall({
      call_id: 'booked-1',
      to_number: '+14165559999',
      call_analysis: { call_outcome: 'appointment_booked' },
    });
    const rescheduledCall = makeRetellCall({
      call_id: 'resched-1',
      to_number: '+14165559999',
      call_analysis: { call_outcome: 'appointment_rescheduled' },
    });
    const otherCall = makeRetellCall({
      call_id: 'other-1',
      to_number: '+14165559999',
      call_analysis: { call_outcome: 'general_inquiry' },
    });
    mockRetellListCalls.mockResolvedValueOnce([bookedCall, rescheduledCall, otherCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCalls).toBe(3);
    // general_inquiry maps to INFORMATION which is excluded from booking rate denominator
    // booking rate = (booked + rescheduled) / booking-eligible calls = 2/2 = 100
    expect(data.metrics.bookingRate).toBe(100);
  });

  it('should include inactive retell phone numbers for filtering', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
      { phoneNumber: '+14165558888' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const activeCall = makeRetellCall({ call_id: 'active-1', to_number: '+14165559999' });
    const inactiveCall = makeRetellCall({ call_id: 'inactive-1', to_number: '+14165558888' });
    mockRetellListCalls.mockResolvedValueOnce([activeCall, inactiveCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.metrics.totalCalls).toBe(2);
  });
});
