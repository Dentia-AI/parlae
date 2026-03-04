import { PATCH } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({
    user: { id: 'user-1' },
  }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    outboundCampaign: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'camp-1',
        accountId: 'acc-1',
        status: 'DRAFT',
      }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'camp-1', accountId: 'acc-1', ...data }),
      ),
    },
  },
}));

function makePatchRequest(id: string, body: Record<string, unknown>) {
  return [
    new NextRequest(`http://localhost/api/outbound/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

describe('PATCH /api/outbound/campaigns/[id] — approve action', () => {
  afterEach(() => jest.clearAllMocks());

  it('approves a DRAFT campaign and sets it to ACTIVE with scheduledStartAt', async () => {
    const [req, ctx] = makePatchRequest('camp-1', { action: 'approve' });
    const res = await PATCH(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ACTIVE');
    expect(body.scheduledStartAt).toBeDefined();

    const { prisma } = require('@kit/prisma');
    expect(prisma.outboundCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        scheduledStartAt: expect.any(Date),
      }),
    });
  });

  it('rejects approve on a non-DRAFT campaign', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp-1',
      accountId: 'acc-1',
      status: 'ACTIVE',
    });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'approve' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Cannot approve');
  });

  it('returns 404 when campaign does not exist', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce(null);

    const [req, ctx] = makePatchRequest('bad-id', { action: 'approve' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid action', async () => {
    const [req, ctx] = makePatchRequest('camp-1', { action: 'explode' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid action');
  });

  it('does not set scheduledStartAt for non-approve actions', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp-1',
      accountId: 'acc-1',
      status: 'ACTIVE',
    });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'pause' });
    await PATCH(req, ctx);

    expect(prisma.outboundCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'PAUSED' },
    });
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'approve' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/outbound/campaigns/[id] — setChannel action', () => {
  afterEach(() => jest.clearAllMocks());

  it('sets channel on a DRAFT campaign', async () => {
    const { prisma } = require('@kit/prisma');
    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'SMS' });
    const res = await PATCH(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.channel).toBe('SMS');
    expect(prisma.outboundCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { channel: 'SMS' },
    });
  });

  it('sets channel to NONE on a DRAFT campaign', async () => {
    const { prisma } = require('@kit/prisma');
    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'NONE' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    expect(prisma.outboundCampaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { channel: 'NONE' },
    });
  });

  it('allows channel change on ACTIVE campaigns', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp-1',
      accountId: 'acc-1',
      status: 'ACTIVE',
    });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'EMAIL' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
  });

  it('allows channel change on PAUSED campaigns', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp-1',
      accountId: 'acc-1',
      status: 'PAUSED',
    });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'PHONE' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
  });

  it('rejects channel change on COMPLETED campaigns', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp-1',
      accountId: 'acc-1',
      status: 'COMPLETED',
    });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'SMS' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('cannot be changed');
  });

  it('rejects channel change on CANCELLED campaigns', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp-1',
      accountId: 'acc-1',
      status: 'CANCELLED',
    });

    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'SMS' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
  });

  it('rejects invalid channel value', async () => {
    const [req, ctx] = makePatchRequest('camp-1', { action: 'setChannel', channel: 'PIGEON' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid channel');
  });
});
