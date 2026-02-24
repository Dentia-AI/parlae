import { GET } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    agentTemplate: { findMany: jest.fn().mockResolvedValue([{ id: 'at-1' }]) },
  },
}));
jest.mock('@kit/shared/auth', () => ({
  getSessionUser: jest.fn().mockResolvedValue({ id: 'admin-1' }),
}));
jest.mock('~/lib/auth/admin', () => ({
  isAdminUser: jest.fn().mockReturnValue(true),
}));

describe('GET /api/admin/agent-templates/list', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return agent templates', async () => {
    const request = new NextRequest('http://localhost/api/admin/agent-templates/list');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
