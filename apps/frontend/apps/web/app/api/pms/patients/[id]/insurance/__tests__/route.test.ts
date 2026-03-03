import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    getPatientInsurance: jest.fn().mockResolvedValue({ success: true, data: [{ provider: 'Aetna' }] }),
    addPatientInsurance: jest.fn().mockResolvedValue({ success: true, data: { id: 'ins-1' } }),
  }),
  logPmsAccess: jest.fn().mockResolvedValue(undefined),
  verifyVapiSignature: jest.fn().mockReturnValue(true),
  getAccountIdFromVapiContext: jest.fn().mockReturnValue('acc-1'),
  redactPhi: jest.fn((d) => d),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pms-1' }),
    },
  },
}));

function vapiRequest(url: string, method: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { 'x-vapi-secret': 'valid-sig' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/pms/patients/[id]/insurance', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns insurance info', async () => {
    const req = vapiRequest('http://localhost/api/pms/patients/p1/insurance', 'POST', {
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await GET(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe('POST /api/pms/patients/[id]/insurance', () => {
  afterEach(() => jest.clearAllMocks());

  it('adds insurance with valid data', async () => {
    const req = vapiRequest('http://localhost/api/pms/patients/p1/insurance', 'POST', {
      data: { provider: 'Aetna', policyNumber: 'P123', isPrimary: true },
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await POST(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 401 when missing signature', async () => {
    const req = new NextRequest('http://localhost/api/pms/patients/p1/insurance', {
      method: 'POST',
      body: JSON.stringify({ data: { provider: 'X', policyNumber: '1', isPrimary: true } }),
    });
    const res = await POST(req, { params: { id: 'p1' } });
    expect(res.status).toBe(401);
  });
});
