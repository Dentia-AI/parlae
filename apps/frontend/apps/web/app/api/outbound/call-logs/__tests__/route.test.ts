import { GET } from '../route';
import { NextRequest } from 'next/server';

const mockListCalls = jest.fn().mockResolvedValue([]);
jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: () => ({ listCalls: mockListCalls }),
}));

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: { findFirst: jest.fn() },
    outboundSettings: { findUnique: jest.fn() },
    campaignContact: { findMany: jest.fn() },
  },
}));

const { prisma: mockPrisma } = jest.requireMock('@kit/prisma') as {
  prisma: {
    account: { findFirst: jest.Mock };
    outboundSettings: { findUnique: jest.Mock };
    campaignContact: { findMany: jest.Mock };
  };
};

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/outbound/call-logs');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const SAMPLE_CALL = {
  call_id: 'call-1',
  agent_id: 'agent-pc',
  call_status: 'ended',
  direction: 'outbound',
  from_number: '+15551111111',
  to_number: '+15552222222',
  start_timestamp: Date.now() - 60_000,
  end_timestamp: Date.now(),
  duration_ms: 60_000,
  transcript: 'AI: Hello\nUser: Hi',
  call_analysis: {
    call_summary: 'Recall call',
    custom_analysis_data: { patient_name: 'John Doe', call_outcome: 'appointment_booked' },
  },
  metadata: { campaignId: 'camp-1', callType: 'RECALL' },
  disconnection_reason: 'agent_hangup',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1' });
  mockPrisma.outboundSettings.findUnique.mockResolvedValue(null);
  mockPrisma.campaignContact.findMany.mockResolvedValue([]);
  mockListCalls.mockResolvedValue([]);
});

describe('GET /api/outbound/call-logs', () => {
  it('returns 401 when user is not authenticated', async () => {
    const { requireSession } = jest.requireMock('~/lib/auth/get-session');
    requireSession.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 404 when account not found', async () => {
    mockPrisma.account.findFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns empty list when no outbound agents configured', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.calls).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it('returns empty list when agents exist but have no IDs', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: null,
      financialRetellAgentId: null,
    });
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.calls).toEqual([]);
    expect(mockListCalls).not.toHaveBeenCalled();
  });

  it('fetches calls from Retell for each agent ID', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: 'agent-fin',
    });
    mockListCalls.mockResolvedValue([SAMPLE_CALL]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockListCalls).toHaveBeenCalledTimes(2);
    expect(mockListCalls).toHaveBeenCalledWith(
      expect.objectContaining({ filter_criteria: expect.objectContaining({ agent_id: ['agent-pc'] }) }),
    );
    expect(mockListCalls).toHaveBeenCalledWith(
      expect.objectContaining({ filter_criteria: expect.objectContaining({ agent_id: ['agent-fin'] }) }),
    );
  });

  it('maps Retell calls to the expected list item shape', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockListCalls.mockResolvedValueOnce([SAMPLE_CALL]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.calls).toHaveLength(1);
    const call = data.calls[0];
    expect(call.id).toBe('call-1');
    expect(call.phoneNumber).toBe('+15552222222');
    expect(call.callType).toBe('RECALL');
    expect(call.outcome).toBe('BOOKED');
    expect(call.contactName).toBe('John Doe');
    expect(call.summary).toBe('Recall call');
    expect(call.status).toBe('COMPLETED');
    expect(call.disconnectionReason).toBe('agent_hangup');
  });

  it('enriches calls with campaign contact data', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const minimalCall = {
      call_id: 'call-2',
      agent_id: 'agent-pc',
      call_status: 'ended',
      direction: 'outbound',
      to_number: '+15553333333',
      start_timestamp: Date.now() - 30_000,
      end_timestamp: Date.now(),
      call_analysis: {},
      metadata: {},
    };
    mockListCalls.mockResolvedValueOnce([minimalCall]);
    mockPrisma.campaignContact.findMany.mockResolvedValueOnce([
      {
        retellCallId: 'call-2',
        callContext: { patient_name: 'Jane Smith' },
        campaign: { name: 'Recall Q1', callType: 'RECALL' },
      },
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.calls[0].contactName).toBe('Jane Smith');
    expect(data.calls[0].campaignName).toBe('Recall Q1');
    expect(data.calls[0].callType).toBe('RECALL');
  });

  it('applies outcome filter', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const call1 = { ...SAMPLE_CALL, call_id: 'c1' };
    const call2 = {
      ...SAMPLE_CALL,
      call_id: 'c2',
      call_analysis: { custom_analysis_data: { call_outcome: 'voicemail' } },
    };
    mockListCalls.mockResolvedValueOnce([call1, call2]);

    const res = await GET(makeRequest({ outcome: 'BOOKED' }));
    const data = await res.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].id).toBe('c1');
  });

  it('applies callType filter', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const recallCall = { ...SAMPLE_CALL, call_id: 'c1', metadata: { callType: 'RECALL' } };
    const paymentCall = { ...SAMPLE_CALL, call_id: 'c2', metadata: { callType: 'PAYMENT' } };
    mockListCalls.mockResolvedValueOnce([recallCall, paymentCall]);

    const res = await GET(makeRequest({ callType: 'PAYMENT' }));
    const data = await res.json();
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].callType).toBe('PAYMENT');
  });

  it('applies search filter on contact name', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockListCalls.mockResolvedValueOnce([SAMPLE_CALL]);

    const res = await GET(makeRequest({ search: 'john' }));
    const data = await res.json();
    expect(data.calls).toHaveLength(1);
  });

  it('applies search filter that matches no results', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockListCalls.mockResolvedValueOnce([SAMPLE_CALL]);

    const res = await GET(makeRequest({ search: 'nomatch' }));
    const data = await res.json();
    expect(data.calls).toHaveLength(0);
  });

  it('paginates results correctly', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const calls = Array.from({ length: 25 }, (_, i) => ({
      ...SAMPLE_CALL,
      call_id: `call-${i}`,
      start_timestamp: Date.now() - (25 - i) * 60_000,
    }));
    mockListCalls.mockResolvedValueOnce(calls);

    const res = await GET(makeRequest({ page: '2', limit: '10' }));
    const data = await res.json();
    expect(data.calls).toHaveLength(10);
    expect(data.pagination.page).toBe(2);
    expect(data.pagination.total).toBe(25);
    expect(data.pagination.totalPages).toBe(3);
    expect(data.pagination.hasMore).toBe(true);
  });

  it('passes date filters to Retell API', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockListCalls.mockResolvedValueOnce([]);

    const start = '2025-01-01T00:00:00.000Z';
    const end = '2025-01-31T23:59:59.999Z';
    await GET(makeRequest({ startDate: start, endDate: end }));

    expect(mockListCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        filter_criteria: expect.objectContaining({
          after_start_timestamp: new Date(start).getTime(),
          before_start_timestamp: new Date(end).getTime(),
        }),
      }),
    );
  });

  it('returns filter aggregation data', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const call1 = { ...SAMPLE_CALL, call_id: 'c1', metadata: { callType: 'RECALL' } };
    const call2 = { ...SAMPLE_CALL, call_id: 'c2', metadata: { callType: 'PAYMENT' } };
    mockListCalls.mockResolvedValueOnce([call1, call2]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.filters.outcomes.length).toBeGreaterThan(0);
    expect(data.filters.callTypes.length).toBe(2);
  });

  it('handles Retell API failure gracefully', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockListCalls.mockRejectedValueOnce(new Error('Retell API error'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it('handles campaign contact lookup failure gracefully', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockListCalls.mockResolvedValueOnce([SAMPLE_CALL]);
    mockPrisma.campaignContact.findMany.mockRejectedValueOnce(new Error('Table not found'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.calls).toHaveLength(1);
  });

  it('sorts calls by start_timestamp descending', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const now = Date.now();
    const older = { ...SAMPLE_CALL, call_id: 'old', start_timestamp: now - 120_000, end_timestamp: now - 60_000 };
    const newer = { ...SAMPLE_CALL, call_id: 'new', start_timestamp: now - 30_000, end_timestamp: now };
    mockListCalls.mockResolvedValueOnce([older, newer]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.calls[0].id).toBe('new');
    expect(data.calls[1].id).toBe('old');
  });
});
