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
        featureSettings: { 'sms-confirmations': true, 'inbound-calls': true },
      }),
      findUnique: jest.fn().mockResolvedValue({
        featureSettings: { 'sms-confirmations': true, 'inbound-calls': true },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    outboundSettings: {
      findUnique: jest.fn().mockResolvedValue({
        patientCareEnabled: true,
        financialEnabled: false,
        autoApproveCampaigns: false,
      }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  },
}));

describe('GET /api/features', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns feature settings merged with outbound settings', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.featureSettings['sms-confirmations']).toBe(true);
    expect(body.featureSettings['outbound-patient-care']).toBe(true);
    expect(body.featureSettings['outbound-financial']).toBe(false);
    expect(body.featureSettings['outbound-auto-approve']).toBe(false);
    expect(body.featureSettings['outbound-calls']).toBe(true);
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

  it('updates feature settings and syncs outbound toggles', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: {
          'sms-confirmations': false,
          'outbound-patient-care': true,
          'outbound-financial': false,
        },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        featureSettings: {
          'sms-confirmations': false,
          'outbound-patient-care': true,
          'outbound-financial': false,
        },
      },
    });
    expect(prisma.outboundSettings.upsert).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      update: { patientCareEnabled: true, financialEnabled: false },
      create: { accountId: 'acc-1', patientCareEnabled: true, financialEnabled: false },
    });
  });

  it('does not sync outbound when no outbound keys present', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({ featureSettings: { 'sms-confirmations': false } }),
    });
    await PUT(req);

    expect(prisma.outboundSettings.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body', async () => {
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({ featureSettings: 'not-an-object' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('syncs auto-approve toggle to outboundSettings', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: {
          'outbound-auto-approve': true,
        },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.outboundSettings.upsert).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      update: { autoApproveCampaigns: true },
      create: { accountId: 'acc-1', autoApproveCampaigns: true },
    });
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
