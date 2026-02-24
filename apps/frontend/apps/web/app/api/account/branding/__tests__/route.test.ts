jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        brandingLogoUrl: null,
        brandingPrimaryColor: '#3b82f6',
        brandingBusinessName: 'Test Clinic',
      }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  },
}));

jest.mock('~/lib/auth/get-session', () => ({
  getUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
}));

import { GET, PATCH } from '../route';
import { NextRequest } from 'next/server';

describe('/api/account/branding', () => {
  afterEach(() => jest.clearAllMocks());

  describe('GET', () => {
    it('should return branding settings', async () => {
      const request = new NextRequest('http://localhost/api/account/branding');
      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('PATCH', () => {
    it('should update branding', async () => {
      const request = new NextRequest('http://localhost/api/account/branding', {
        method: 'PATCH',
        body: JSON.stringify({ businessName: 'Updated Clinic' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request);
      expect(response.status).toBe(200);
    });
  });
});
