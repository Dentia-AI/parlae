import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    getPatientNotes: jest.fn().mockResolvedValue({ success: true, data: [{ id: 'n1', content: 'Test note' }] }),
    addPatientNote: jest.fn().mockResolvedValue({ success: true, data: { id: 'n-new' } }),
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

describe('GET /api/pms/patients/[id]/notes', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns patient notes', async () => {
    const req = vapiRequest('http://localhost/api/pms/patients/p1/notes', 'POST', {
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await GET(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe('POST /api/pms/patients/[id]/notes', () => {
  afterEach(() => jest.clearAllMocks());

  it('adds a note', async () => {
    const req = vapiRequest('http://localhost/api/pms/patients/p1/notes', 'POST', {
      data: { content: 'Follow-up note' },
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await POST(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });
});
