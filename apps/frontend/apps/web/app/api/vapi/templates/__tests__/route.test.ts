import { GET } from '../route';

jest.mock('@kit/prisma', () => ({
  prisma: {
    vapiSquadTemplate: { findMany: jest.fn().mockResolvedValue([{ id: 'sq-1' }]) },
    vapiAssistantTemplate: { findMany: jest.fn().mockResolvedValue([{ id: 'at-1' }]) },
  },
}));
jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('GET /api/vapi/templates', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return templates', async () => {
    const request = new Request('http://localhost/api/vapi/templates');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
