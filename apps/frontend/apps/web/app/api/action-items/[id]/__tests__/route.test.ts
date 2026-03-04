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
      findFirst: jest.fn().mockResolvedValue({
        id: 'ai-1',
        accountId: 'acc-1',
        status: 'OPEN',
        reason: 'FOLLOW_UP_REQUIRED',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'ai-1',
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedByUserId: 'user-1',
      }),
    },
  },
}));

function makeRequest(body: any) {
  return new NextRequest('http://localhost/api/action-items/ai-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/action-items/:id', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves an action item', async () => {
    const res = await PATCH(makeRequest({ status: 'RESOLVED' }), { params: { id: 'ai-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('RESOLVED');

    const { prisma } = require('@kit/prisma');
    expect(prisma.actionItem.update).toHaveBeenCalledWith({
      where: { id: 'ai-1' },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
        resolvedByUserId: 'user-1',
      }),
    });
  });

  it('moves to in-progress', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.update.mockResolvedValueOnce({ id: 'ai-1', status: 'IN_PROGRESS' });

    const res = await PATCH(makeRequest({ status: 'IN_PROGRESS' }), { params: { id: 'ai-1' } });
    const body = await res.json();

    expect(body.status).toBe('IN_PROGRESS');
    expect(prisma.actionItem.update).toHaveBeenCalledWith({
      where: { id: 'ai-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    });
  });

  it('adds staff notes', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.update.mockResolvedValueOnce({ id: 'ai-1', staffNotes: 'Called back' });

    const res = await PATCH(makeRequest({ staffNotes: 'Called back' }), { params: { id: 'ai-1' } });
    const body = await res.json();

    expect(body.staffNotes).toBe('Called back');
    expect(prisma.actionItem.update).toHaveBeenCalledWith({
      where: { id: 'ai-1' },
      data: expect.objectContaining({ staffNotes: 'Called back' }),
    });
  });

  it('assigns a user', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.update.mockResolvedValueOnce({ id: 'ai-1', assignedToUserId: 'user-2' });

    const res = await PATCH(makeRequest({ assignedToUserId: 'user-2' }), { params: { id: 'ai-1' } });
    const body = await res.json();

    expect(body.assignedToUserId).toBe('user-2');
  });

  it('returns 404 when item not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest({ status: 'RESOLVED' }), { params: { id: 'bad-id' } });
    expect(res.status).toBe(404);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await PATCH(makeRequest({ status: 'RESOLVED' }), { params: { id: 'ai-1' } });
    expect(res.status).toBe(401);
  });

  it('rejects invalid status values', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.update.mockResolvedValueOnce({ id: 'ai-1', status: 'OPEN' });

    await PATCH(makeRequest({ status: 'INVALID' }), { params: { id: 'ai-1' } });

    const updateCall = prisma.actionItem.update.mock.calls[0][0];
    expect(updateCall.data.status).toBeUndefined();
  });
});
