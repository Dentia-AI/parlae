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
    retellPhoneNumber: { findMany: jest.fn().mockResolvedValue([]) },
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
  }),
}));
jest.mock('@kit/shared/vapi/cost-calculator', () => ({
  calculateBlendedCost: jest.fn().mockReturnValue({ totalCents: 0 }),
  getPlatformPricing: jest.fn().mockResolvedValue({
    twilioInboundPerMin: 0.0085,
    twilioOutboundPerMin: 0.014,
    serverCostPerMin: 0.005,
    markupPercent: 30,
  }),
  DEFAULT_PRICING_RATES: {},
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
      call_summary: 'Test call summary',
    },
    ...overrides,
  };
}

describe('GET /api/call-logs', () => {
  const { prisma } = require('@kit/prisma');

  afterEach(() => jest.clearAllMocks());

  it('should return call logs for VAPI provider', async () => {
    mockGetAccountProvider.mockResolvedValue('VAPI');
    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('should filter retell calls by clinic phone number', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const clinicCall = makeRetellCall({ call_id: 'clinic-1', to_number: '+14165559999' });
    const otherClinicCall = makeRetellCall({ call_id: 'other-clinic-1', to_number: '+19055550000', from_number: '+19055551111' });
    mockRetellListCalls.mockResolvedValueOnce([clinicCall, otherClinicCall]);

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].callId).toBe('clinic-1');
    expect(data.pagination.total).toBe(1);
  });

  it('should not return calls from other clinics sharing the API key', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const foreignCalls = Array.from({ length: 5 }, (_, i) =>
      makeRetellCall({
        call_id: `foreign-${i}`,
        to_number: `+1905555000${i}`,
        from_number: `+1905555111${i}`,
      })
    );
    mockRetellListCalls.mockResolvedValueOnce(foreignCalls);

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
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
    const oldCall = makeRetellCall({ call_id: 'old-1', to_number: '+14165558888' });
    const foreignCall = makeRetellCall({ call_id: 'foreign-1', to_number: '+12125550000', from_number: '+12125551111' });
    mockRetellListCalls.mockResolvedValueOnce([currentCall, oldCall, foreignCall]);

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(2);
    expect(data.calls.map((c: any) => c.callId).sort()).toEqual(['current-1', 'old-1']);
  });

  it('should return empty when no clinic phones found', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: {},
      phoneNumberHistory: [],
    });

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(0);
  });

  it('should include outbound calls from clinic phone number', async () => {
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

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].callType).toBe('OUTBOUND');
  });

  it('should support client-side outcome filtering', async () => {
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
    const otherCall = makeRetellCall({
      call_id: 'other-1',
      to_number: '+14165559999',
      call_analysis: { call_outcome: 'general_inquiry' },
    });
    mockRetellListCalls.mockResolvedValueOnce([bookedCall, otherCall]);

    const request = new NextRequest('http://localhost/api/call-logs?outcome=BOOKED');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].outcome).toBe('BOOKED');
  });

  it('should normalize phone numbers with different formats', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    // Clinic phone stored with spaces/dashes in DB
    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+1 (416) 555-9999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+1-416-555-9999' },
      phoneNumberHistory: [],
    });

    // Retell returns the number in clean E.164 format
    const call = makeRetellCall({ call_id: 'norm-1', to_number: '+14165559999' });
    mockRetellListCalls.mockResolvedValueOnce([call]);

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(1);
  });

  it('should map retell call outcomes correctly', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const calls = [
      makeRetellCall({ call_id: 'c1', to_number: '+14165559999', call_analysis: { call_outcome: 'appointment_booked' } }),
      makeRetellCall({ call_id: 'c2', to_number: '+14165559999', call_analysis: { call_outcome: 'appointment_rescheduled' } }),
      makeRetellCall({ call_id: 'c3', to_number: '+14165559999', call_analysis: { call_outcome: 'appointment_cancelled' } }),
      makeRetellCall({ call_id: 'c4', to_number: '+14165559999', call_analysis: { call_outcome: 'caller_hung_up' } }),
      makeRetellCall({ call_id: 'c5', to_number: '+14165559999', call_analysis: { call_outcome: 'emergency_handled' } }),
    ];
    mockRetellListCalls.mockResolvedValueOnce(calls);

    const request = new NextRequest('http://localhost/api/call-logs');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    const outcomes = data.calls.map((c: any) => c.outcome);
    expect(outcomes).toContain('BOOKED');
    expect(outcomes).toContain('RESCHEDULED');
    expect(outcomes).toContain('CANCELLED');
    expect(outcomes).toContain('HUNG_UP');
    expect(outcomes).toContain('EMERGENCY');
  });
});
