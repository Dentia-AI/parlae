import { GET } from '../route';
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
      findMany: jest.fn().mockResolvedValue([
        { id: 'ai-1', reason: 'FOLLOW_UP_REQUIRED', status: 'OPEN', direction: 'INBOUND', createdAt: new Date() },
        { id: 'ai-2', reason: 'TRANSFER_FAILED', status: 'OPEN', direction: 'OUTBOUND', createdAt: new Date() },
      ]),
      count: jest.fn().mockResolvedValue(2),
    },
    accountMembership: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'user-1', user: { id: 'user-1', displayName: 'Test User', email: 'test@example.com' } },
      ]),
    },
  },
}));

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/action-items${query ? `?${query}` : ''}`);
}

describe('GET /api/action-items', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns paginated action items with defaults', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('respects page and limit params', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.findMany.mockResolvedValueOnce([{ id: 'ai-1' }]);
    prisma.actionItem.count.mockResolvedValueOnce(10);

    const res = await GET(makeRequest('page=2&limit=5'));
    const body = await res.json();

    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(5);
    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it('filters by status', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('status=OPEN'));

    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('filters by direction', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('direction=INBOUND'));

    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ direction: 'INBOUND' }),
      }),
    );
  });

  it('filters by reason', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('reason=FOLLOW_UP_REQUIRED'));

    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reason: 'FOLLOW_UP_REQUIRED' }),
      }),
    );
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});
