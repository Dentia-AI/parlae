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
