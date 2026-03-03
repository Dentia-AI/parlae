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
    aiActionLog: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'log-1', source: 'pms', action: 'create_patient', status: 'completed', createdAt: new Date() },
        { id: 'log-2', source: 'gcal', action: 'book_appointment', status: 'completed', createdAt: new Date() },
      ]),
      count: jest.fn().mockResolvedValue(2),
    },
  },
}));

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/activity-log${query ? `?${query}` : ''}`);
}

describe('GET /api/activity-log', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns paginated logs with default params', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.logs).toHaveLength(2);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 2,
      totalPages: 1,
    });
  });

  it('respects page and limit query params', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.aiActionLog.findMany.mockResolvedValueOnce([{ id: 'log-1' }]);
    prisma.aiActionLog.count.mockResolvedValueOnce(5);

    const res = await GET(makeRequest('page=2&limit=1'));
    const body = await res.json();

    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.total).toBe(5);
    expect(body.pagination.totalPages).toBe(5);

    expect(prisma.aiActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1 }),
    );
  });

  it('filters by source', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('source=pms'));

    expect(prisma.aiActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'pms' }),
      }),
    );
  });

  it('does not add source filter when source is "all"', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('source=all'));

    const callArgs = prisma.aiActionLog.findMany.mock.calls[0][0];
    expect(callArgs.where.source).toBeUndefined();
  });

  it('filters by action and status', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('action=create_patient&status=completed'));

    expect(prisma.aiActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'create_patient', status: 'completed' }),
      }),
    );
  });

  it('applies search across multiple fields', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('search=PAT-123'));

    const callArgs = prisma.aiActionLog.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toBeDefined();
    expect(callArgs.where.OR).toHaveLength(5);
  });

  it('filters by date range', async () => {
    const { prisma } = require('@kit/prisma');

    await GET(makeRequest('startDate=2026-01-01&endDate=2026-01-31'));

    const callArgs = prisma.aiActionLog.findMany.mock.calls[0][0];
    expect(callArgs.where.createdAt).toBeDefined();
    expect(callArgs.where.createdAt.gte).toEqual(new Date('2026-01-01'));
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
