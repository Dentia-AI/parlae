import { NextResponse } from 'next/server';
import { GET, OPTIONS } from '../route';

// Mock the auth function
jest.mock('@kit/shared/auth', () => ({
  auth: jest.fn(),
}));

import { auth } from '@kit/shared/auth';

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('/api/auth/session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return authenticated user data when session exists', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      mockAuth.mockResolvedValue(mockSession);

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        isAuthenticated: true,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
      });
    });

    it('should return not authenticated when no session', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        isAuthenticated: false,
      });
    });

    it('should return not authenticated when session has no user', async () => {
      mockAuth.mockResolvedValue({
        expires: new Date().toISOString(),
      } as any);

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        isAuthenticated: false,
      });
    });

    it('should include CORS headers in response', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://hub.parlae.ca');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });

    it('should handle auth errors gracefully', async () => {
      // Suppress expected console.error during this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockAuth.mockRejectedValue(new Error('Auth error'));

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        isAuthenticated: false,
      });

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Session API] Error checking session:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should only include specific user fields', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          internalField: 'should-not-be-exposed',
        },
        expires: new Date().toISOString(),
      };

      mockAuth.mockResolvedValue(mockSession);

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);
      const data = await response.json();

      expect(data.user).toHaveProperty('id');
      expect(data.user).toHaveProperty('email');
      expect(data.user).toHaveProperty('name');
      expect(data.user).not.toHaveProperty('internalField');
    });

    it('should handle partial user data', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          // name is optional
        },
        expires: new Date().toISOString(),
      };

      mockAuth.mockResolvedValue(mockSession);

      const request = new Request('http://localhost:3000/api/auth/session');
      const response = await GET(request);
      const data = await response.json();

      expect(data.isAuthenticated).toBe(true);
      expect(data.user).toHaveProperty('id');
      expect(data.user).toHaveProperty('email');
    });
  });

  describe('OPTIONS', () => {
    it('should return 204 with CORS headers', async () => {
      const response = await OPTIONS();

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://hub.parlae.ca');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });

    it('should return no body', async () => {
      const response = await OPTIONS();
      const text = await response.text();

      expect(text).toBe('');
    });
  });
});

