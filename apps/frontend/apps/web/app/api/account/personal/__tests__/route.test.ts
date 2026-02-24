jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', name: 'Test Account', pictureUrl: null, publicData: null }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1', name: 'Updated', pictureUrl: null, publicData: null }),
    },
  },
}));

jest.mock('@kit/shared/auth', () => ({
  auth: jest.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com' },
  }),
}));

import { GET, PATCH } from '../route';

describe('/api/account/personal', () => {
  afterEach(() => jest.clearAllMocks());

  describe('GET', () => {
    it('should return account info', async () => {
      const response = await GET();
      expect(response.status).toBe(200);
    });

    it('should return 401 when not authenticated', async () => {
      const { auth } = require('@kit/shared/auth');
      auth.mockResolvedValueOnce(null);
      const response = await GET();
      expect(response.status).toBe(401);
    });
  });

  describe('PATCH', () => {
    it('should update account name', async () => {
      const request = new Request('http://localhost/api/account/personal', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request);
      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid name', async () => {
      const request = new Request('http://localhost/api/account/personal', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'a' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request);
      expect(response.status).toBe(400);
    });
  });
});
