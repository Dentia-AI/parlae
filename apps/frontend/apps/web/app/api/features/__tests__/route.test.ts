import { GET, PUT } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        featureSettings: { smsEnabled: true, outboundEnabled: false },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

describe('GET /api/features', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns feature settings', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.featureSettings.smsEnabled).toBe(true);
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/features', () => {
  afterEach(() => jest.clearAllMocks());

  it('updates feature settings', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({ featureSettings: { smsEnabled: false } }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { featureSettings: { smsEnabled: false } },
    });
  });

  it('returns 400 for invalid body', async () => {
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({ featureSettings: 'not-an-object' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockRejectedValueOnce(new Error('Unauthorized'));

    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({ featureSettings: {} }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });
});
