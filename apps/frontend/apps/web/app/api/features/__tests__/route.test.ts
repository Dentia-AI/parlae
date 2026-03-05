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
        featureSettings: {
          'ai-receptionist': true,
          'inbound-calls': true,
          'sms-confirmations': true,
          'email-confirmations': true,
        },
      }),
      findUnique: jest.fn().mockResolvedValue({
        phoneIntegrationMethod: 'vapi',
        phoneIntegrationSettings: { vapiSquadId: 'squad-1' },
        paymentMethodVerified: true,
        featureSettings: {
          'ai-receptionist': true,
          'inbound-calls': true,
          'sms-confirmations': true,
          'email-confirmations': true,
        },
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
    pmsIntegration: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pms-1' }),
    },
  },
}));

describe('GET /api/features', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns feature settings merged with outbound settings and prerequisites', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.featureSettings['ai-receptionist']).toBe(true);
    expect(body.featureSettings['inbound-calls']).toBe(true);
    expect(body.featureSettings['sms-confirmations']).toBe(true);
    expect(body.featureSettings['email-confirmations']).toBe(true);
    expect(body.featureSettings['outbound-patient-care']).toBe(true);
    expect(body.featureSettings['outbound-financial']).toBe(false);
    expect(body.featureSettings['outbound-auto-approve']).toBe(false);
    expect(body.featureSettings['outbound-calls']).toBe(true);

    expect(body.wizardCompleted).toBe(true);
    expect(body.pmsConnected).toBe(true);
    expect(body.paymentVerified).toBe(true);
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns master toggle and inbound-calls from featureSettings', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      id: 'acc-1',
      featureSettings: { 'ai-receptionist': false, 'inbound-calls': false },
    });
    prisma.outboundSettings.findUnique.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json();

    expect(body.featureSettings['ai-receptionist']).toBe(false);
    expect(body.featureSettings['inbound-calls']).toBe(false);
  });

  it('derives outbound-calls as true when either patient-care or financial is enabled', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      id: 'acc-1',
      featureSettings: {},
    });
    prisma.outboundSettings.findUnique
      .mockResolvedValueOnce({ patientCareEnabled: false, financialEnabled: true })
      .mockResolvedValueOnce({ autoApproveCampaigns: false });

    const res = await GET();
    const body = await res.json();

    expect(body.featureSettings['outbound-calls']).toBe(true);
    expect(body.featureSettings['outbound-financial']).toBe(true);
    expect(body.featureSettings['outbound-patient-care']).toBe(false);
  });

  it('derives outbound-calls as false when both are disabled', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      id: 'acc-1',
      featureSettings: {},
    });
    prisma.outboundSettings.findUnique
      .mockResolvedValueOnce({ patientCareEnabled: false, financialEnabled: false })
      .mockResolvedValueOnce({ autoApproveCampaigns: false });

    const res = await GET();
    const body = await res.json();

    expect(body.featureSettings['outbound-calls']).toBe(false);
  });

  it('returns wizardCompleted=false when no phone integration', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      id: 'acc-1',
      featureSettings: {},
    });
    prisma.outboundSettings.findUnique.mockResolvedValue(null);
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationMethod: 'none',
      phoneIntegrationSettings: {},
      paymentMethodVerified: false,
    });

    const res = await GET();
    const body = await res.json();

    expect(body.wizardCompleted).toBe(false);
    expect(body.paymentVerified).toBe(false);
  });

  it('returns pmsConnected=false when no active PMS integration', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      id: 'acc-1',
      featureSettings: {},
    });
    prisma.outboundSettings.findUnique.mockResolvedValue(null);
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json();

    expect(body.pmsConnected).toBe(false);
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

  it('persists ai-receptionist master toggle when disabling', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'ai-receptionist': false },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { featureSettings: { 'ai-receptionist': false } },
    });
    expect(prisma.outboundSettings.upsert).not.toHaveBeenCalled();
  });

  it('persists inbound-calls toggle when disabling', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'inbound-calls': false },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { featureSettings: { 'inbound-calls': false } },
    });
  });

  it('persists email-confirmations toggle when disabling', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'email-confirmations': false },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { featureSettings: { 'email-confirmations': false } },
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

  it('blocks enabling ai-receptionist when wizard not completed', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationMethod: 'none',
      phoneIntegrationSettings: {},
      paymentMethodVerified: false,
    });

    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'ai-receptionist': true },
      }),
    });
    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('setup wizard');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('blocks enabling inbound-calls when wizard not completed', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationMethod: null,
      phoneIntegrationSettings: {},
      paymentMethodVerified: false,
    });

    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'inbound-calls': true },
      }),
    });
    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('setup wizard');
  });

  it('blocks enabling outbound-calls when PMS not connected', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationMethod: 'vapi',
      phoneIntegrationSettings: { vapiSquadId: 'squad-1' },
      paymentMethodVerified: true,
    });
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'outbound-calls': true },
      }),
    });
    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('PMS');
  });

  it('blocks enabling outbound when payment not verified', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationMethod: 'vapi',
      phoneIntegrationSettings: { vapiSquadId: 'squad-1' },
      paymentMethodVerified: false,
    });
    prisma.pmsIntegration.findFirst.mockResolvedValueOnce({ id: 'pms-1' });

    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'outbound-patient-care': true },
      }),
    });
    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('payment');
  });

  it('allows enabling master/inbound when wizard is completed', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: { 'ai-receptionist': true, 'inbound-calls': true },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalled();
  });

  it('allows disabling features without prerequisite checks', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      phoneIntegrationMethod: 'none',
      phoneIntegrationSettings: {},
      paymentMethodVerified: false,
    });

    const req = new NextRequest('http://localhost/api/features', {
      method: 'PUT',
      body: JSON.stringify({
        featureSettings: {
          'ai-receptionist': false,
          'inbound-calls': false,
          'outbound-calls': false,
        },
      }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalled();
  });
});
