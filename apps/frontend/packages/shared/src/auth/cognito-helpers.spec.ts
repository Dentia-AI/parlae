import { createHmac } from 'node:crypto';

jest.mock('@kit/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@kit/prisma';
import {
  parseCognitoRegion,
  createSecretHash,
  initiateUserPasswordAuth,
  refreshCognitoTokens,
  getCognitoUser,
} from './cognito-helpers';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const BASE_PARAMS = {
  clientId: 'client-123',
  clientSecret: 'super-secret',
  issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cognito-helpers', () => {
  describe('parseCognitoRegion', () => {
    it('extracts region from a standard Cognito issuer URL', () => {
      expect(parseCognitoRegion('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC'))
        .toBe('us-east-1');
    });

    it('extracts region from eu-west-1', () => {
      expect(parseCognitoRegion('https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_XYZ'))
        .toBe('eu-west-1');
    });

    it('extracts region from ca-central-1', () => {
      expect(parseCognitoRegion('https://cognito-idp.ca-central-1.amazonaws.com/ca-central-1_POOL'))
        .toBe('ca-central-1');
    });

    it('throws for an invalid hostname with fewer than 2 segments', () => {
      expect(() => parseCognitoRegion('https://localhost/')).toThrow('Invalid Cognito issuer hostname');
    });
  });

  describe('createSecretHash', () => {
    it('generates a base64 HMAC-SHA256 of username+clientId keyed by clientSecret', () => {
      const hash = createSecretHash('myClientId', 'mySecret', 'user@test.com');

      const expected = createHmac('sha256', 'mySecret')
        .update('user@test.commyClientId')
        .digest('base64');

      expect(hash).toBe(expected);
    });

    it('returns a base64 string', () => {
      const hash = createSecretHash('id', 'secret', 'user');
      expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    });
  });

  describe('initiateUserPasswordAuth', () => {
    it('calls Cognito InitiateAuth and returns tokens on success', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ cognitoUsername: 'cog-user-1' });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'access-tok',
            IdToken: 'id-tok',
            RefreshToken: 'refresh-tok',
            ExpiresIn: 3600,
          },
        }),
      });

      const result = await initiateUserPasswordAuth({
        email: 'Test@Example.com',
        password: 'pass123',
        ...BASE_PARAMS,
      });

      expect(result.accessToken).toBe('access-tok');
      expect(result.idToken).toBe('id-tok');
      expect(result.refreshToken).toBe('refresh-tok');
      expect(result.expiresIn).toBe(3600);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: { cognitoUsername: true },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://cognito-idp.us-east-1.amazonaws.com/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"USERNAME":"cog-user-1"'),
        }),
      );
    });

    it('falls back to email as username when no cognito username exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'at',
            IdToken: 'it',
          },
        }),
      });

      await initiateUserPasswordAuth({
        email: 'user@test.com',
        password: 'pass',
        ...BASE_PARAMS,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.AuthParameters.USERNAME).toBe('user@test.com');
    });

    it('throws on non-ok response', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          __type: 'NotAuthorizedException',
          message: 'Incorrect username or password.',
        }),
      });

      await expect(
        initiateUserPasswordAuth({ email: 'bad@test.com', password: 'wrong', ...BASE_PARAMS }),
      ).rejects.toThrow('NotAuthorizedException');
    });

    it('throws when AuthenticationResult is missing', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(
        initiateUserPasswordAuth({ email: 'a@b.com', password: 'x', ...BASE_PARAMS }),
      ).rejects.toThrow('AuthenticationResultMissing');
    });
  });

  describe('refreshCognitoTokens', () => {
    it('calls REFRESH_TOKEN_AUTH flow and returns new tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'new-access',
            IdToken: 'new-id',
            ExpiresIn: 3600,
          },
        }),
      });

      const result = await refreshCognitoTokens({
        refreshToken: 'old-refresh',
        username: 'user@test.com',
        ...BASE_PARAMS,
      });

      expect(result.accessToken).toBe('new-access');
      expect(result.idToken).toBe('new-id');
      expect(result.refreshToken).toBeUndefined();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.AuthFlow).toBe('REFRESH_TOKEN_AUTH');
      expect(body.AuthParameters.REFRESH_TOKEN).toBe('old-refresh');
    });

    it('includes new refresh token if present in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'at',
            IdToken: 'it',
            RefreshToken: 'new-refresh-tok',
          },
        }),
      });

      const result = await refreshCognitoTokens({
        refreshToken: 'old',
        username: 'user@test.com',
        ...BASE_PARAMS,
      });

      expect(result.refreshToken).toBe('new-refresh-tok');
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          __type: 'NotAuthorizedException',
          message: 'Invalid refresh token.',
        }),
      });

      await expect(
        refreshCognitoTokens({
          refreshToken: 'expired',
          username: 'user@test.com',
          ...BASE_PARAMS,
        }),
      ).rejects.toThrow('NotAuthorizedException');
    });
  });

  describe('getCognitoUser', () => {
    it('returns username and attributes on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          Username: 'cog-user-42',
          UserAttributes: [
            { Name: 'email', Value: 'user@example.com' },
            { Name: 'sub', Value: 'uuid-1234' },
          ],
        }),
      });

      const user = await getCognitoUser({
        accessToken: 'my-access-token',
        issuer: BASE_PARAMS.issuer,
      });

      expect(user.username).toBe('cog-user-42');
      expect(user.attributes.email).toBe('user@example.com');
      expect(user.attributes.sub).toBe('uuid-1234');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.AccessToken).toBe('my-access-token');
    });

    it('throws when Username is missing in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ UserAttributes: [] }),
      });

      await expect(
        getCognitoUser({ accessToken: 'tok', issuer: BASE_PARAMS.issuer }),
      ).rejects.toThrow('CognitoUserMissingUsername');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ __type: 'NotAuthorizedException' }),
      });

      await expect(
        getCognitoUser({ accessToken: 'bad-tok', issuer: BASE_PARAMS.issuer }),
      ).rejects.toThrow('NotAuthorizedException');
    });

    it('handles empty or malformed UserAttributes gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          Username: 'user-1',
          UserAttributes: [
            { Name: 'email' }, // missing Value
            null, // malformed
            { Name: 'sub', Value: 'abc' },
          ],
        }),
      });

      const user = await getCognitoUser({
        accessToken: 'tok',
        issuer: BASE_PARAMS.issuer,
      });

      expect(user.username).toBe('user-1');
      expect(user.attributes.sub).toBe('abc');
      expect(user.attributes.email).toBeUndefined();
    });
  });
});
