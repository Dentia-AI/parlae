import { GET } from '../route';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', vapiSquadId: 'sq-1' }]),
    },
  },
}));
jest.mock('~/lib/auth/is-admin', () => ({
  requireAdmin: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@kit/shared/vapi/server', () => ({
  createVapiService: jest.fn().mockReturnValue({
    isEnabled: jest.fn().mockReturnValue(true),
    listSquads: jest.fn().mockResolvedValue([]),
    listAssistants: jest.fn().mockResolvedValue([]),
    listTools: jest.fn().mockResolvedValue([]),
  }),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('GET /api/admin/squads', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return squads', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });
});
