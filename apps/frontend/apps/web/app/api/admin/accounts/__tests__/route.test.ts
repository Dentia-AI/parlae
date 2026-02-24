import { GET } from '../route';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Test Clinic' }]),
    },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({
    id: 'admin-1',
    data: { accounts: [{ value: 'acc-admin' }] },
  }),
}));
jest.mock('~/lib/auth/admin', () => ({
  isAdminUser: jest.fn().mockReturnValue(true),
}));

describe('GET /api/admin/accounts', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return accounts list for admin', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('should return 401 for non-admin', async () => {
    const { isAdminUser } = require('~/lib/auth/admin');
    isAdminUser.mockReturnValueOnce(false);
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
