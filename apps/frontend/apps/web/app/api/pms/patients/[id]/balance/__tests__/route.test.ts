import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    getPatientBalance: jest.fn().mockResolvedValue({ success: true, data: { balance: 150.00 } }),
  }),
  logPmsAccess: jest.fn().mockResolvedValue(undefined),
  verifyVapiSignature: jest.fn().mockReturnValue(true),
  getAccountIdFromVapiContext: jest.fn().mockReturnValue('acc-1'),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pms-1' }),
    },
  },
}));

describe('GET /api/pms/patients/[id]/balance', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns patient balance', async () => {
    const req = new NextRequest('http://localhost/api/pms/patients/p1/balance', {
      method: 'POST',
      headers: { 'x-vapi-secret': 'valid-sig' },
      body: JSON.stringify({ call: { id: 'c1', metadata: { accountId: 'acc-1' } } }),
    });
    const res = await GET(req, { params: { id: 'p1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.balance).toBe(150.00);
  });

  it('returns 401 when missing signature', async () => {
    const req = new NextRequest('http://localhost/api/pms/patients/p1/balance', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await GET(req, { params: { id: 'p1' } });
    expect(res.status).toBe(401);
  });
});
