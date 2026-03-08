import { GET } from '../route';
import { NextRequest } from 'next/server';

const mockRetellGetCall = jest.fn();

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    callReference: {
      findFirst: jest.fn().mockResolvedValue({ callId: 'call-1', accountId: 'acc-1', provider: 'RETELL' }),
      create: jest.fn().mockResolvedValue({}),
    },
    vapiPhoneNumber: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    actionItem: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    outboundSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    aiActionLog: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock('~/lib/auth/admin', () => ({
  isAdminUser: jest.fn().mockReturnValue(false),
}));

jest.mock('@kit/shared/vapi/vapi.service', () => ({
  createVapiService: jest.fn().mockReturnValue({
    getCall: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: jest.fn().mockReturnValue({
    getCall: mockRetellGetCall,
  }),
}));

jest.mock('@kit/shared/vapi/cost-calculator', () => ({
  calculateBlendedCost: jest.fn().mockReturnValue({ totalCents: 150, totalDollars: 1.5 }),
  getPlatformPricing: jest.fn().mockResolvedValue({
    twilioInboundPerMin: 0.0085,
    twilioOutboundPerMin: 0.014,
    serverCostPerMin: 0.005,
    markupPercent: 30,
  }),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

function makeRetellCall(overrides: Record<string, any> = {}) {
  return {
    call_id: 'retell-call-1',
    call_status: 'ended',
    start_timestamp: 1700000000000,
    end_timestamp: 1700000120000,
    from_number: '+14165551234',
    to_number: '+14165559999',
    direction: 'inbound',
    agent_id: 'agent-1',
    recording_url: 'https://example.com/recording.mp3',
    transcript: 'AI: Hello\nUser: Hi',
    call_analysis: {
      call_outcome: 'appointment_booked',
      call_summary: 'Patient booked a cleaning',
      user_sentiment: 'Positive',
      patient_name: 'Jane Doe',
      custom_analysis_data: {
        customer_sentiment: 'positive',
      },
    },
    ...overrides,
  };
}

function makeRequest(id: string) {
  return [
    new NextRequest(`http://localhost/api/call-logs/${id}`),
    { params: Promise.resolve({ id }) },
  ] as const;
}

describe('GET /api/call-logs/[id]', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns Retell call detail when provider is RETELL', async () => {
    mockRetellGetCall.mockResolvedValueOnce(makeRetellCall());

    const [req, ctx] = makeRequest('retell-call-1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.callId).toBe('retell-call-1');
    expect(body.callType).toBe('INBOUND');
    expect(body.outcome).toBe('BOOKED');
    expect(body.contactName).toBe('Jane Doe');
    expect(body.summary).toBe('Patient booked a cleaning');
    expect(body.transcript).toBe('AI: Hello\nUser: Hi');
    expect(body.recordingUrl).toBe('https://example.com/recording.mp3');
  });

  it('calculates duration from Retell timestamps', async () => {
    mockRetellGetCall.mockResolvedValueOnce(makeRetellCall());

    const [req, ctx] = makeRequest('retell-call-1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(body.duration).toBe(120);
  });

  it('maps Retell sentiment correctly', async () => {
    mockRetellGetCall.mockResolvedValueOnce(makeRetellCall());

    const [req, ctx] = makeRequest('retell-call-1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(body.customerSentiment).toBe('positive');
  });

  it('maps various Retell outcomes', async () => {
    const outcomes = [
      { call_outcome: 'transferred_to_staff', expected: 'TRANSFERRED' },
      { call_outcome: 'caller_hung_up', expected: 'HUNG_UP' },
      { call_outcome: 'emergency_handled', expected: 'EMERGENCY' },
      { call_outcome: 'appointment_rescheduled', expected: 'RESCHEDULED' },
      { call_outcome: 'general_inquiry', expected: 'INFORMATION' },
      { call_outcome: 'voicemail', expected: 'VOICEMAIL' },
    ];

    for (const { call_outcome, expected } of outcomes) {
      jest.clearAllMocks();
      mockRetellGetCall.mockResolvedValueOnce(
        makeRetellCall({
          call_analysis: {
            call_outcome,
            custom_analysis_data: {},
          },
        }),
      );

      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({ id: 'acc-1' });
      prisma.callReference.findFirst.mockResolvedValueOnce({
        callId: 'c', accountId: 'acc-1', provider: 'RETELL',
      });

      const [req, ctx] = makeRequest('c');
      const res = await GET(req, ctx);
      const body = await res.json();
      expect(body.outcome).toBe(expected);
    }
  });

  it('returns 404 when Retell call not found', async () => {
    mockRetellGetCall.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('missing');
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
  });

  it('returns Vapi call detail when provider is VAPI', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.callReference.findFirst.mockResolvedValueOnce({
      callId: 'vapi-call-1', accountId: 'acc-1', provider: 'VAPI',
    });

    const { createVapiService } = require('@kit/shared/vapi/vapi.service');
    createVapiService.mockReturnValueOnce({
      getCall: jest.fn().mockResolvedValue({
        id: 'vapi-call-1',
        status: 'ended',
        type: 'inboundPhoneCall',
        startedAt: '2026-01-15T10:00:00Z',
        endedAt: '2026-01-15T10:02:00Z',
        customer: { number: '+15551234567', name: 'John' },
        analysis: {
          summary: 'Booked cleaning',
          structuredData: {
            callOutcome: 'appointment_booked',
            patientName: 'John',
            appointmentBooked: true,
          },
        },
        artifact: { transcript: 'AI: Hi\nUser: Hello' },
      }),
    });

    const [req, ctx] = makeRequest('vapi-call-1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.callId).toBe('vapi-call-1');
    expect(body.outcome).toBe('BOOKED');
    expect(body.contactName).toBe('John');
    expect(body.duration).toBe(120);
  });

  it('uses transcript_object when transcript string is absent', async () => {
    mockRetellGetCall.mockResolvedValueOnce(
      makeRetellCall({
        transcript: null,
        transcript_object: [
          { role: 'agent', content: 'Hello there' },
          { role: 'user', content: 'Hi' },
        ],
      }),
    );

    const [req, ctx] = makeRequest('retell-call-1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(body.transcript).toBe('AI: Hello there\nUser: Hi');
  });

  it('returns 404 when no callRef and phone not authorized', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.callReference.findFirst.mockResolvedValueOnce(null);
    prisma.vapiPhoneNumber.findFirst.mockResolvedValueOnce(null);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationSettings: { vapiPhoneId: 'other-phone' },
    });

    const { createVapiService } = require('@kit/shared/vapi/vapi.service');
    createVapiService.mockReturnValueOnce({
      getCall: jest.fn().mockResolvedValue({
        id: 'vapi-call-3',
        phoneNumberId: 'pn-unauthorized',
        status: 'ended',
        type: 'inboundPhoneCall',
        analysis: { structuredData: {} },
        artifact: {},
      }),
    });

    const [req, ctx] = makeRequest('vapi-call-3');
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
  });

  it('hides cost for non-admin users', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.callReference.findFirst.mockResolvedValueOnce({
      callId: 'v1', accountId: 'acc-1', provider: 'VAPI',
    });

    const { createVapiService } = require('@kit/shared/vapi/vapi.service');
    createVapiService.mockReturnValueOnce({
      getCall: jest.fn().mockResolvedValue({
        id: 'v1',
        status: 'ended',
        type: 'inboundPhoneCall',
        cost: 0.05,
        startedAt: '2026-01-15T10:00:00Z',
        endedAt: '2026-01-15T10:01:00Z',
        customer: { number: '+15551111111' },
        analysis: { structuredData: {} },
        artifact: {},
      }),
    });

    const [req, ctx] = makeRequest('v1');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(body.costCents).toBeNull();
  });

  it('includes cost for admin users', async () => {
    const { isAdminUser } = require('~/lib/auth/admin');
    isAdminUser.mockReturnValue(true);

    const { prisma } = require('@kit/prisma');
    prisma.callReference.findFirst.mockResolvedValueOnce({
      callId: 'v2', accountId: 'acc-1', provider: 'VAPI',
    });

    const { createVapiService } = require('@kit/shared/vapi/vapi.service');
    createVapiService.mockReturnValue({
      getCall: jest.fn().mockResolvedValue({
        id: 'v2',
        status: 'ended',
        type: 'inboundPhoneCall',
        cost: 0.05,
        startedAt: '2026-01-15T10:00:00Z',
        endedAt: '2026-01-15T10:01:00Z',
        customer: { number: '+15551111111' },
        analysis: { structuredData: {} },
        artifact: {},
      }),
    });

    const [req, ctx] = makeRequest('v2');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(body.costCents).toBe(150);

    isAdminUser.mockReturnValue(false);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const [req, ctx] = makeRequest('any');
    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
  });
});
