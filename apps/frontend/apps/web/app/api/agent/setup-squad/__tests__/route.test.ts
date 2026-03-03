import { POST } from '../route';

jest.mock('@kit/shared/twilio/server', () => ({
  createTwilioService: jest.fn().mockReturnValue({
    isEnabled: () => false,
  }),
}));

jest.mock('@kit/shared/vapi/server', () => ({
  createVapiService: jest.fn().mockReturnValue({
    isEnabled: () => false,
  }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      update: jest.fn().mockResolvedValue({}),
    },
    agentTemplate: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

jest.mock('@kit/shared/vapi/templates', () => ({
  getDentalClinicTemplate: jest.fn(),
  buildSquadPayloadFromTemplate: jest.fn(),
  dbShapeToTemplate: jest.fn(),
  DENTAL_CLINIC_TEMPLATE_VERSION: '1.0',
  CALL_ANALYSIS_SCHEMA: {},
  getAllFunctionToolDefinitions: jest.fn().mockReturnValue([]),
  prepareToolDefinitionsForCreation: jest.fn().mockReturnValue([]),
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/agent/setup-squad', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/setup-squad', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 500 when Vapi is not enabled', async () => {
    const res = await POST(
      makeRequest({
        customerName: 'Test Clinic',
        squadType: 'dental-clinic',
        businessInfo: { services: ['Cleanings'] },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Vapi');
  });

  it('does not crash with empty body', async () => {
    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(body.success).toBe(false);
  });
});
