import { GET } from '../route';

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    delete: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
  }),
}));

describe('GET /api/auth/clear-session', () => {
  afterEach(() => jest.clearAllMocks());

  it('should clear session and return success', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
