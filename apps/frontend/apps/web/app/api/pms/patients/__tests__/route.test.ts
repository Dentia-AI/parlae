import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

const originalEnv = process.env;
beforeAll(() => {
  process.env = { ...originalEnv, VAPI_WEBHOOK_SECRET: 'test-secret' };
});
afterAll(() => {
  process.env = originalEnv;
});

jest.mock('../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    searchPatients: jest.fn().mockResolvedValue({ success: true, data: [{ id: 'p1', firstName: 'Jane' }] }),
    createPatient: jest.fn().mockResolvedValue({ success: true, data: { id: 'p-new' } }),
  }),
  logPmsAccess: jest.fn().mockResolvedValue(undefined),
  redactPhi: jest.fn((d) => d),
}));

jest.mock('../../_lib/vapi-context', () => ({
  getContextFromVapiCall: jest.fn().mockResolvedValue({
    accountId: 'acc-1',
    pmsIntegrationId: 'pms-1',
    callId: 'call-1',
  }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pms-1' }),
    },
  },
}));

function bearerPostRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/pms/patients (search)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns patients matching query', async () => {
    const req = bearerPostRequest('http://localhost/api/pms/patients?query=Jane', {
      call: { id: 'c1' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 401 when no auth header', async () => {
    const req = new NextRequest('http://localhost/api/pms/patients?query=Jane', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/pms/patients (create)', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a patient with valid data', async () => {
    const req = bearerPostRequest('http://localhost/api/pms/patients', {
      data: { firstName: 'John', lastName: 'Doe' },
      call: { id: 'c1' },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 401 when auth fails', async () => {
    const req = new NextRequest('http://localhost/api/pms/patients', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-secret' },
      body: JSON.stringify({ firstName: 'A', lastName: 'B' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
