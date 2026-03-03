import { GET, PATCH } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    getPatient: jest.fn().mockResolvedValue({ success: true, data: { id: 'p1', firstName: 'Jane' } }),
    updatePatient: jest.fn().mockResolvedValue({ success: true, data: { id: 'p1' } }),
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
    headers: { 'x-vapi-secret': 'valid-signature' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/pms/patients/[id]', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns patient by ID', async () => {
    const req = vapiRequest('http://localhost/api/pms/patients/p1', 'POST', {
      call: { id: 'call-1', metadata: { accountId: 'acc-1' } },
    });
    const res = await GET(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 401 when missing signature', async () => {
    const req = new NextRequest('http://localhost/api/pms/patients/p1', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await GET(req, { params: { id: 'p1' } });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/pms/patients/[id]', () => {
  afterEach(() => jest.clearAllMocks());

  it('updates patient fields', async () => {
    const req = vapiRequest('http://localhost/api/pms/patients/p1', 'PATCH', {
      data: { firstName: 'Updated' },
      call: { id: 'call-1', metadata: { accountId: 'acc-1' } },
    });
    const res = await PATCH(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
