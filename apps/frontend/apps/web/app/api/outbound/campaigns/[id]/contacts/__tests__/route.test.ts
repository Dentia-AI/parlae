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
    outboundCampaign: {
      findFirst: jest.fn().mockResolvedValue({ id: 'camp-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    campaignContact: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', phoneNumber: '+15551111111' },
        { id: 'c2', phoneNumber: '+15552222222' },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    doNotCallEntry: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  },
}));

function makeRequest(campaignId: string, body: Record<string, unknown>) {
  return [
    new NextRequest(`http://localhost/api/outbound/campaigns/${campaignId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: campaignId }) },
  ] as const;
}

describe('POST /api/outbound/campaigns/[id]/contacts', () => {
  afterEach(() => jest.clearAllMocks());

  it('remove action deletes contacts and decrements totalContacts', async () => {
    const { prisma } = require('@kit/prisma');
    const [req, ctx] = makeRequest('camp-1', { action: 'remove', contactIds: ['c1', 'c2'] });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.removed).toBe(2);
    expect(prisma.outboundCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { totalContacts: { decrement: 2 } },
    });
  });

  it('add_to_dnc action adds phones to DNC and marks contacts SKIPPED', async () => {
    const { prisma } = require('@kit/prisma');
    const [req, ctx] = makeRequest('camp-1', { action: 'add_to_dnc', contactIds: ['c1', 'c2'] });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dncAdded).toBe(2);
    expect(prisma.doNotCallEntry.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.campaignContact.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] }, campaignId: 'camp-1' },
      data: { status: 'SKIPPED', outcome: 'dnc_added' },
    });
  });

  it('returns 400 for missing action or contactIds', async () => {
    const [req, ctx] = makeRequest('camp-1', { action: 'remove' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 404 when campaign not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce(null);

    const [req, ctx] = makeRequest('bad-id', { action: 'remove', contactIds: ['c1'] });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid action', async () => {
    const [req, ctx] = makeRequest('camp-1', { action: 'explode', contactIds: ['c1'] });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });
});
