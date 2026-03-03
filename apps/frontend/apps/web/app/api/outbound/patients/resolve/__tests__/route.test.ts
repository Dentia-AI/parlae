import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-1' }]),
    },
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({ accountId: 'acc-1' }),
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

  it('falls back to IDs when no PMS integration', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.names['pat-1']).toBe('pat-1');
    expect(body.source).toBe('fallback');
  });

  it('returns names map with source field when integration exists', async () => {
    const res = await POST(makeRequest({ patientIds: ['pat-1', 'pat-2'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.names).toBeDefined();
    expect(body.source).toBeDefined();
    expect(Object.keys(body.names)).toHaveLength(2);
  });

  it('returns 400 when patientIds is empty or missing', async () => {
    const res = await POST(makeRequest({ patientIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await POST(makeRequest({ patientIds: ['pat-1'] }));
    expect(res.status).toBe(401);
  });
});
