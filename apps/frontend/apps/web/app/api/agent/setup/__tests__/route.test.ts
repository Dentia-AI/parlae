import { POST } from '../route';

jest.mock('@kit/shared/twilio/server', () => ({
  createTwilioService: jest.fn().mockReturnValue({
    isEnabled: () => true,
    searchAvailableNumbers: jest.fn().mockResolvedValue([{ phoneNumber: '+14155551234' }]),
    purchaseNumber: jest.fn().mockResolvedValue({ phoneNumber: '+14155551234', sid: 'PN123' }),
    releaseNumber: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@kit/shared/vapi/server', () => ({
  createVapiService: jest.fn().mockReturnValue({
    isEnabled: () => true,
    createAssistant: jest.fn().mockResolvedValue({ id: 'asst-1', name: 'Test' }),
    importPhoneNumber: jest.fn().mockResolvedValue({ id: 'pn-1' }),
    deleteAssistant: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@kit/shared/gohighlevel/server', () => ({
  createGoHighLevelService: jest.fn().mockReturnValue({
    isEnabled: () => false,
  }),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/agent/setup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/setup', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates agent with phone number end-to-end', async () => {
    const res = await POST(
      makeRequest({
        customerName: 'Test Clinic',
        customerEmail: 'test@clinic.com',
        agentName: 'Dental AI',
        agentType: 'dental',
        voiceId: 'voice-1',
        systemPrompt: 'You are a dental receptionist.',
        ghlSubAccountId: 'ghl-1',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.agent).toBeDefined();
    expect(body.agent.phoneNumber).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ customerName: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when Twilio is not enabled', async () => {
    const { createTwilioService } = require('@kit/shared/twilio/server');
    createTwilioService.mockReturnValueOnce({ isEnabled: () => false });

    const res = await POST(
      makeRequest({
        customerName: 'Test',
        customerEmail: 'test@test.com',
        agentName: 'AI',
        voiceId: 'v1',
        systemPrompt: 'Test',
      }),
    );
    expect(res.status).toBe(500);
  });
});
