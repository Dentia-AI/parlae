import { PATCH } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    actionItem: {
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    notification: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

function makeRequest(body: any) {
  return new NextRequest('http://localhost/api/action-items/bulk', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/action-items/bulk', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves multiple items', async () => {
    const res = await PATCH(makeRequest({
      ids: ['ai-1', 'ai-2', 'ai-3'],
      action: 'resolve',
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(3);

    const { prisma } = require('@kit/prisma');
    expect(prisma.actionItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['ai-1', 'ai-2', 'ai-3'] },
        accountId: 'acc-1',
        status: { not: 'RESOLVED' },
      },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
        resolvedByUserId: 'user-1',
      }),
    });
  });

  it('dismisses notifications when resolving', async () => {
    await PATCH(makeRequest({
      ids: ['ai-1'],
      action: 'resolve',
    }));

    const { prisma } = require('@kit/prisma');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: 'acc-1',
        dismissed: false,
        link: '/home/action-items',
      },
      data: { dismissed: true },
    });
  });

  it('assigns items to a team member', async () => {
    const res = await PATCH(makeRequest({
      ids: ['ai-1', 'ai-2'],
      action: 'assign',
      assignedToUserId: 'user-2',
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(3);

    const { prisma } = require('@kit/prisma');
    expect(prisma.actionItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['ai-1', 'ai-2'] },
        accountId: 'acc-1',
        status: { not: 'RESOLVED' },
      },
      data: {
        status: 'IN_PROGRESS',
        assignedToUserId: 'user-2',
      },
    });
  });

  it('assigns to self via __self__ token', async () => {
    await PATCH(makeRequest({
      ids: ['ai-1'],
      action: 'assign',
      assignedToUserId: '__self__',
    }));

    const { prisma } = require('@kit/prisma');
    expect(prisma.actionItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToUserId: 'user-1',
        }),
      }),
    );
  });

  it('returns 400 when no IDs provided', async () => {
    const res = await PATCH(makeRequest({ ids: [], action: 'resolve' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when IDs missing', async () => {
    const res = await PATCH(makeRequest({ action: 'resolve' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    const res = await PATCH(makeRequest({ ids: ['ai-1'], action: 'delete' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when assign has no assignee', async () => {
    const res = await PATCH(makeRequest({ ids: ['ai-1'], action: 'assign' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await PATCH(makeRequest({ ids: ['ai-1'], action: 'resolve' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest({ ids: ['ai-1'], action: 'resolve' }));
    expect(res.status).toBe(404);
  });
});
