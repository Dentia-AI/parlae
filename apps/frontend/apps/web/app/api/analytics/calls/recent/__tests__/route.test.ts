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
jest.mock('@kit/shared/vapi/vapi.service', () => ({
  createVapiService: jest.fn().mockReturnValue({
    listCalls: jest.fn().mockResolvedValue([]),
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
    },
    ...overrides,
  };
}

describe('GET /api/analytics/calls/recent', () => {
  const { prisma } = require('@kit/prisma');

  afterEach(() => jest.clearAllMocks());

  it('should return recent calls for VAPI provider', async () => {
    mockGetAccountProvider.mockResolvedValue('VAPI');
    const request = new NextRequest('http://localhost/api/analytics/calls/recent');
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
    const foreignCall = makeRetellCall({ call_id: 'foreign-1', to_number: '+19055550000', from_number: '+19055551111' });
    mockRetellListCalls.mockResolvedValueOnce([clinicCall, foreignCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls/recent');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].id).toBe('clinic-1');
    expect(data.pagination.total).toBe(1);
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
    const oldNumberCall = makeRetellCall({ call_id: 'old-1', to_number: '+14165558888' });
    mockRetellListCalls.mockResolvedValueOnce([currentCall, oldNumberCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls/recent');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
  });

  it('should return empty when no clinic phones found', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: {},
      phoneNumberHistory: [],
    });

    const request = new NextRequest('http://localhost/api/analytics/calls/recent');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });

  it('should map rescheduled outcome correctly', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const rescheduledCall = makeRetellCall({
      call_id: 'resched-1',
      to_number: '+14165559999',
      call_analysis: {
        call_outcome: 'appointment_rescheduled',
        patient_name: 'Rescheduled Patient',
      },
    });
    mockRetellListCalls.mockResolvedValueOnce([rescheduledCall]);

    const request = new NextRequest('http://localhost/api/analytics/calls/recent');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].outcome).toBe('RESCHEDULED');
  });

  it('should respect pagination limit and offset', async () => {
    mockGetAccountProvider.mockResolvedValue('RETELL');

    prisma.retellPhoneNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: '+14165559999' },
    ]);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { phoneNumber: '+14165559999' },
      phoneNumberHistory: [],
    });

    const calls = Array.from({ length: 5 }, (_, i) =>
      makeRetellCall({
        call_id: `call-${i}`,
        to_number: '+14165559999',
        start_timestamp: Date.now() - (i * 60_000),
        end_timestamp: Date.now() - (i * 60_000) + 30_000,
      })
    );
    mockRetellListCalls.mockResolvedValueOnce(calls);

    const request = new NextRequest('http://localhost/api/analytics/calls/recent?limit=2&offset=1');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.calls).toHaveLength(2);
    expect(data.pagination.total).toBe(5);
    expect(data.pagination.hasMore).toBe(true);
  });
});
