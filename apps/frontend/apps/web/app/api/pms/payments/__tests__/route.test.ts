import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    processPayment: jest.fn().mockResolvedValue({ success: true, data: { transactionId: 'tx-1' } }),
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

function vapiRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/pms/payments', {
    method: 'POST',
    headers: { 'x-vapi-secret': 'valid-sig' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/pms/payments', () => {
  afterEach(() => jest.clearAllMocks());

  it('processes payment with valid data', async () => {
    const req = vapiRequest({
      data: { patientId: 'p1', amount: 100, method: 'credit_card' },
      call: { id: 'c1', metadata: { accountId: 'acc-1' } },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 401 when missing signature', async () => {
    const req = new NextRequest('http://localhost/api/pms/payments', {
      method: 'POST',
      body: JSON.stringify({ data: { patientId: 'p1', amount: 100 } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
