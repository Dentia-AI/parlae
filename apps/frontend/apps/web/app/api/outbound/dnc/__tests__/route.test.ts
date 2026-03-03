import { POST, DELETE } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    doNotCallEntry: {
      upsert: jest.fn().mockResolvedValue({ id: 'dnc-1', phoneNumber: '+15551234567', reason: 'manual' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outbound/dnc', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outbound/dnc', {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

describe('POST /api/outbound/dnc', () => {
  afterEach(() => jest.clearAllMocks());

  it('adds a DNC entry via upsert', async () => {
    const res = await POST(makePostRequest({ phoneNumber: '+15551234567', reason: 'patient_request' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.phoneNumber).toBe('+15551234567');

    const { prisma } = require('@kit/prisma');
    expect(prisma.doNotCallEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_phoneNumber: { accountId: 'acc-1', phoneNumber: '+15551234567' } },
      }),
    );
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const res = await POST(makePostRequest({ reason: 'manual' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await POST(makePostRequest({ phoneNumber: '+15551234567' }));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/outbound/dnc', () => {
  afterEach(() => jest.clearAllMocks());

  it('removes a DNC entry', async () => {
    const res = await DELETE(makeDeleteRequest({ id: 'dnc-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const { prisma } = require('@kit/prisma');
    expect(prisma.doNotCallEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: 'dnc-1', accountId: 'acc-1' },
    });
  });

  it('returns 400 when id is missing', async () => {
    const res = await DELETE(makeDeleteRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await DELETE(makeDeleteRequest({ id: 'dnc-1' }));
    expect(res.status).toBe(401);
  });
});
