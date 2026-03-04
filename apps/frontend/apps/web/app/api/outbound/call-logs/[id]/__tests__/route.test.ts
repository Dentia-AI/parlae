import { GET } from '../route';
import { NextRequest } from 'next/server';

const mockGetCall = jest.fn();
jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: () => ({ getCall: mockGetCall }),
}));

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: { findFirst: jest.fn() },
    outboundSettings: { findUnique: jest.fn() },
    campaignContact: { findFirst: jest.fn() },
  },
}));

const { prisma: mockPrisma } = jest.requireMock('@kit/prisma') as {
  prisma: {
    account: { findFirst: jest.Mock };
    outboundSettings: { findUnique: jest.Mock };
    campaignContact: { findFirst: jest.Mock };
  };
};

function makeRequest(callId: string) {
  return new NextRequest(new URL(`http://localhost/api/outbound/call-logs/${callId}`));
}

const makeParams = (id: string) => Promise.resolve({ id });

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
  transcript_object: [
    { role: 'agent', content: 'Hello' },
    { role: 'user', content: 'Hi' },
  ],
  recording_url: 'https://example.com/recording.mp3',
  public_log_url: 'https://example.com/log',
  call_analysis: {
    call_summary: 'Recall outbound call completed successfully.',
    user_sentiment: 'Positive',
    custom_analysis_data: {
      patient_name: 'John Doe',
      patient_email: 'john@example.com',
      call_outcome: 'appointment_booked',
      appointment_booked: true,
      appointment_type: 'Cleaning',
      appointment_date: '2025-03-15',
      follow_up_required: false,
    },
  },
  metadata: {
    campaignId: 'camp-1',
    contactId: 'contact-1',
    callType: 'RECALL',
  },
  disconnection_reason: 'agent_hangup',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1' });
  mockPrisma.outboundSettings.findUnique.mockResolvedValue(null);
  mockPrisma.campaignContact.findFirst.mockResolvedValue(null);
  mockGetCall.mockResolvedValue(null);
});

describe('GET /api/outbound/call-logs/[id]', () => {
  it('returns 401 when user is not authenticated', async () => {
    const { requireSession } = jest.requireMock('~/lib/auth/get-session');
    requireSession.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(401);
  });

  it('returns 404 when account not found', async () => {
    mockPrisma.account.findFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(404);
  });

  it('returns 404 when no outbound agents configured', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('No outbound agents configured');
  });

  it('returns 404 when agents have no IDs', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: null,
      financialRetellAgentId: null,
    });
    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(404);
  });

  it('returns 404 when call not found in Retell', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockGetCall.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Call not found');
  });

  it('returns 404 when call belongs to a different agent', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockGetCall.mockResolvedValueOnce({ ...SAMPLE_CALL, agent_id: 'some-other-agent' });
    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Call not found');
  });

  it('returns full call detail for a valid outbound call (patient care agent)', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockGetCall.mockResolvedValueOnce(SAMPLE_CALL);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.id).toBe('call-1');
    expect(data.callId).toBe('call-1');
    expect(data.phoneNumber).toBe('+15552222222');
    expect(data.callType).toBe('RECALL');
    expect(data.direction).toBe('outbound');
    expect(data.outcome).toBe('BOOKED');
    expect(data.contactName).toBe('John Doe');
    expect(data.contactEmail).toBe('john@example.com');
    expect(data.summary).toBe('Recall outbound call completed successfully.');
    expect(data.transcript).toBe('AI: Hello\nUser: Hi');
    expect(data.recordingUrl).toBe('https://example.com/recording.mp3');
    expect(data.appointmentSet).toBe(true);
    expect(data.status).toBe('COMPLETED');
    expect(data.metadata.retellAgentId).toBe('agent-pc');
    expect(data.metadata.disconnectionReason).toBe('agent_hangup');
    expect(data.metadata.campaignId).toBe('camp-1');
  });

  it('returns full call detail for a financial agent call', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: null,
      financialRetellAgentId: 'agent-fin',
    });
    const finCall = { ...SAMPLE_CALL, agent_id: 'agent-fin', metadata: { callType: 'PAYMENT' } };
    mockGetCall.mockResolvedValueOnce(finCall);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.callType).toBe('PAYMENT');
  });

  it('enriches call with campaign contact data', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const callWithoutAnalysis = {
      ...SAMPLE_CALL,
      call_analysis: {},
      metadata: {},
    };
    mockGetCall.mockResolvedValueOnce(callWithoutAnalysis);
    mockPrisma.campaignContact.findFirst.mockResolvedValueOnce({
      callContext: { patient_name: 'Jane from Campaign' },
      campaign: { name: 'Recall Jan 2025', callType: 'RECALL' },
    });

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    const data = await res.json();
    expect(data.contactName).toBe('Jane from Campaign');
    expect(data.campaignName).toBe('Recall Jan 2025');
    expect(data.callType).toBe('RECALL');
  });

  it('handles campaign contact lookup failure gracefully', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockGetCall.mockResolvedValueOnce(SAMPLE_CALL);
    mockPrisma.campaignContact.findFirst.mockRejectedValueOnce(new Error('Table not found'));

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('call-1');
  });

  it('correctly maps various outcome types', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });

    const voicemailCall = {
      ...SAMPLE_CALL,
      call_analysis: { custom_analysis_data: { call_outcome: 'voicemail' } },
    };
    mockGetCall.mockResolvedValueOnce(voicemailCall);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    const data = await res.json();
    expect(data.outcome).toBe('VOICEMAIL');
  });

  it('uses transcript_object when transcript string is not available', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const callWithObjTranscript = {
      ...SAMPLE_CALL,
      transcript: null,
      transcript_object: [
        { role: 'agent', content: 'Good morning' },
        { role: 'user', content: 'Hello' },
      ],
    };
    mockGetCall.mockResolvedValueOnce(callWithObjTranscript);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    const data = await res.json();
    expect(data.transcript).toBe('AI: Good morning\nUser: Hello');
  });

  it('handles Retell API failure', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    mockGetCall.mockRejectedValueOnce(new Error('Retell unavailable'));

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    expect(res.status).toBe(500);
  });

  it('computes duration from timestamps', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const now = Date.now();
    const call = {
      ...SAMPLE_CALL,
      start_timestamp: now - 120_000,
      end_timestamp: now,
      duration_ms: undefined,
    };
    mockGetCall.mockResolvedValueOnce(call);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    const data = await res.json();
    expect(data.duration).toBe(120);
  });

  it('handles missing timestamps with duration_ms fallback', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const call = {
      ...SAMPLE_CALL,
      start_timestamp: null,
      end_timestamp: null,
      duration_ms: 90_000,
    };
    mockGetCall.mockResolvedValueOnce(call);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    const data = await res.json();
    expect(data.duration).toBe(90);
  });

  it('detects customer sentiment from Retell analysis', async () => {
    mockPrisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'agent-pc',
      financialRetellAgentId: null,
    });
    const call = {
      ...SAMPLE_CALL,
      call_analysis: {
        user_sentiment: 'Negative',
        custom_analysis_data: { customer_sentiment: '', call_outcome: 'voicemail' },
      },
    };
    mockGetCall.mockResolvedValueOnce(call);

    const res = await GET(makeRequest('call-1'), { params: makeParams('call-1') });
    const data = await res.json();
    expect(data.customerSentiment).toBe('negative');
  });
});
