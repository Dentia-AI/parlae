import { GET } from '../route';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    actionItem: {
      count: jest.fn().mockResolvedValue(7),
    },
  },
}));

describe('GET /api/action-items/count', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the count of OPEN action items', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(7);

    const { prisma } = require('@kit/prisma');
    expect(prisma.actionItem.count).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', status: 'OPEN' },
    });
  });

  it('returns 0 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json();

    expect(body.count).toBe(0);
  });

  it('returns 0 on error', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.actionItem.count.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = await res.json();

    expect(body.count).toBe(0);
  });
});
