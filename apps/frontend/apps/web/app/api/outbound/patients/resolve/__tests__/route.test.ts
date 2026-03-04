import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock('~/api/pms/_lib/pms-utils', () => ({
  getPmsService: jest.fn().mockResolvedValue({
    getPatient: jest.fn().mockResolvedValue({
      success: true,
      data: { firstName: 'Jane', lastName: 'Smith' },
    }),
  }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outbound/patients/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/outbound/patients/resolve', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 200 with fallback names when no PMS integration', async () => {
    const res = await POST(makeRequest({ patientIds: ['pat-1', 'pat-2'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.names['pat-1']).toBe('pat-1');
    expect(body.names['pat-2']).toBe('pat-2');
    expect(body.source).toBe('fallback');
  });

  it('returns 200 with fallback when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.names['pat-1']).toBe('pat-1');
    expect(body.source).toBe('fallback');
  });

  it('returns 200 with fallback when pmsIntegration lookup throws', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.pmsIntegration.findFirst.mockRejectedValueOnce(new Error('table not found'));

    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.names['pat-1']).toBe('pat-1');
    expect(body.source).toBe('fallback');
  });

  it('returns 200 with fallback when PMS service creation throws', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });
    const { getPmsService } = require('~/api/pms/_lib/pms-utils');
    getPmsService.mockRejectedValueOnce(new Error('PMS unavailable'));

    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.names['pat-1']).toBe('pat-1');
    expect(body.source).toBe('fallback');
  });

  it('returns 400 when patientIds is empty', async () => {
    const res = await POST(makeRequest({ patientIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when patientIds is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    expect(res.status).toBe(401);
  });

  it('caps patientIds at 100', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `pat-${i}`);
    const res = await POST(makeRequest({ patientIds: ids }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body.names)).toHaveLength(100);
  });

  it('never returns 500 for valid request body', async () => {
    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    expect(res.status).not.toBe(500);
  });
});
