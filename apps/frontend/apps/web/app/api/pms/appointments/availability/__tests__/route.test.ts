import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('../../../_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    checkAvailability: jest.fn().mockResolvedValue({
      success: true,
      data: [
        { date: '2026-03-15', time: '10:00', available: true },
        { date: '2026-03-15', time: '11:00', available: true },
      ],
    }),
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

describe('GET /api/pms/appointments/availability', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns available slots', async () => {
    const req = new NextRequest('http://localhost/api/pms/appointments/availability?date=2026-03-15', {
      method: 'POST',
      headers: { 'x-vapi-secret': 'valid-sig' },
      body: JSON.stringify({ call: { id: 'c1', metadata: { accountId: 'acc-1' } } }),
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 401 when missing signature', async () => {
    const req = new NextRequest('http://localhost/api/pms/appointments/availability?date=2026-03-15', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
