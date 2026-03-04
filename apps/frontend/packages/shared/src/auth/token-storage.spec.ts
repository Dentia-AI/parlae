jest.mock('server-only', () => ({}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    cognitoTokens: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('./cognito-helpers', () => ({
  refreshCognitoTokens: jest.fn(),
}));

import { prisma } from '@kit/prisma';
import { refreshCognitoTokens } from './cognito-helpers';
import {
  storeCognitoTokens,
  getCognitoTokens,
  deleteCognitoTokens,
} from './token-storage';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    COGNITO_CLIENT_ID: 'test-client-id',
    COGNITO_CLIENT_SECRET: 'test-client-secret',
    COGNITO_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('storeCognitoTokens', () => {
  it('upserts tokens with calculated expiration', async () => {
    (prisma.cognitoTokens.upsert as jest.Mock).mockResolvedValue({});

    const before = Date.now();
    await storeCognitoTokens('user-1', {
      accessToken: 'access-tok',
      idToken: 'id-tok',
      refreshToken: 'refresh-tok',
      expiresIn: 3600,
    });
    const after = Date.now();

    expect(prisma.cognitoTokens.upsert).toHaveBeenCalledTimes(1);
    const call = (prisma.cognitoTokens.upsert as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'user-1' });
    expect(call.create.accessToken).toBe('access-tok');
    expect(call.create.idToken).toBe('id-tok');
    expect(call.create.refreshToken).toBe('refresh-tok');

    const expiresAt = call.create.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 3600 * 1000 + 100);
  });

  it('defaults to 1 hour expiration when expiresIn is not provided', async () => {
    (prisma.cognitoTokens.upsert as jest.Mock).mockResolvedValue({});

    const before = Date.now();
    await storeCognitoTokens('user-1', {
      accessToken: 'at',
      idToken: 'it',
    });

    const call = (prisma.cognitoTokens.upsert as jest.Mock).mock.calls[0][0];
    const expiresAt = call.create.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000 - 500);
  });

  it('does not throw when upsert fails (non-fatal)', async () => {
    (prisma.cognitoTokens.upsert as jest.Mock).mockRejectedValue(new Error('DB error'));

    await expect(
      storeCognitoTokens('user-1', { accessToken: 'at', idToken: 'it' }),
    ).resolves.toBeUndefined();
  });
});

describe('getCognitoTokens', () => {
  it('returns tokens when they are valid and not about to expire', async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'valid-access',
      idToken: 'valid-id',
      refreshToken: 'valid-refresh',
      expiresAt: futureDate,
    });

    const result = await getCognitoTokens('user-1');

    expect(result).toEqual({
      accessToken: 'valid-access',
      idToken: 'valid-id',
      refreshToken: 'valid-refresh',
    });
  });

  it('returns null when no tokens exist', async () => {
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getCognitoTokens('user-unknown');

    expect(result).toBeNull();
  });

  it('refreshes tokens when they are expired', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'expired-access',
      idToken: 'expired-id',
      refreshToken: 'old-refresh',
      expiresAt: pastDate,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      cognitoUsername: 'cog-user',
      email: 'user@test.com',
    });
    (refreshCognitoTokens as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      idToken: 'new-id',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
    });
    (prisma.cognitoTokens.upsert as jest.Mock).mockResolvedValue({});

    const result = await getCognitoTokens('user-1');

    expect(result).toEqual({
      accessToken: 'new-access',
      idToken: 'new-id',
      refreshToken: 'new-refresh',
    });
    expect(refreshCognitoTokens).toHaveBeenCalledWith({
      refreshToken: 'old-refresh',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST',
      username: 'cog-user',
    });
  });

  it('refreshes tokens when they are about to expire (within 5 min)', async () => {
    const almostExpired = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'almost-expired',
      idToken: 'almost-id',
      refreshToken: 'rf-tok',
      expiresAt: almostExpired,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      cognitoUsername: null,
      email: 'fallback@test.com',
    });
    (refreshCognitoTokens as jest.Mock).mockResolvedValue({
      accessToken: 'refreshed-access',
      idToken: 'refreshed-id',
      expiresIn: 3600,
    });
    (prisma.cognitoTokens.upsert as jest.Mock).mockResolvedValue({});

    const result = await getCognitoTokens('user-2');

    expect(result).toEqual({
      accessToken: 'refreshed-access',
      idToken: 'refreshed-id',
      refreshToken: 'rf-tok',
    });
    expect(refreshCognitoTokens).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'fallback@test.com' }),
    );
  });

  it('returns null when expired and no refresh token available', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000);
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'expired-access',
      idToken: 'expired-id',
      refreshToken: null,
      expiresAt: pastDate,
    });

    const result = await getCognitoTokens('user-no-refresh');

    expect(result).toBeNull();
  });

  it('returns null when user is not found during refresh', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000);
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'exp',
      idToken: 'exp',
      refreshToken: 'rf',
      expiresAt: pastDate,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await getCognitoTokens('user-gone');

    expect(result).toBeNull();
  });

  it('returns null when user has no username or email for refresh', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000);
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'exp',
      idToken: 'exp',
      refreshToken: 'rf',
      expiresAt: pastDate,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      cognitoUsername: null,
      email: null,
    });

    const result = await getCognitoTokens('user-no-username');

    expect(result).toBeNull();
  });

  it('returns null when Cognito env vars are not configured', async () => {
    process.env.COGNITO_CLIENT_ID = '';
    const pastDate = new Date(Date.now() - 60 * 1000);
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'exp',
      idToken: 'exp',
      refreshToken: 'rf',
      expiresAt: pastDate,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      cognitoUsername: 'cog',
      email: 'e@t.com',
    });

    const result = await getCognitoTokens('user-no-env');

    expect(result).toBeNull();
  });

  it('returns null when refresh fails', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000);
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'exp',
      idToken: 'exp',
      refreshToken: 'rf',
      expiresAt: pastDate,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      cognitoUsername: 'cog',
      email: 'e@t.com',
    });
    (refreshCognitoTokens as jest.Mock).mockRejectedValue(new Error('Refresh failed'));

    const result = await getCognitoTokens('user-refresh-fail');

    expect(result).toBeNull();
  });

  it('returns null when prisma query throws', async () => {
    (prisma.cognitoTokens.findUnique as jest.Mock).mockRejectedValue(new Error('DB down'));

    const result = await getCognitoTokens('user-db-fail');

    expect(result).toBeNull();
  });

  it('reuses old refresh token when new one is not provided', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000);
    (prisma.cognitoTokens.findUnique as jest.Mock).mockResolvedValue({
      accessToken: 'exp',
      idToken: 'exp',
      refreshToken: 'old-rf',
      expiresAt: pastDate,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      cognitoUsername: 'cog',
      email: 'e@t.com',
    });
    (refreshCognitoTokens as jest.Mock).mockResolvedValue({
      accessToken: 'new-at',
      idToken: 'new-it',
      expiresIn: 3600,
    });
    (prisma.cognitoTokens.upsert as jest.Mock).mockResolvedValue({});

    const result = await getCognitoTokens('user-keep-refresh');

    expect(result).toEqual({
      accessToken: 'new-at',
      idToken: 'new-it',
      refreshToken: 'old-rf',
    });

    expect(prisma.cognitoTokens.upsert).toHaveBeenCalled();
    const storeCall = (prisma.cognitoTokens.upsert as jest.Mock).mock.calls[0][0];
    expect(storeCall.create.refreshToken).toBe('old-rf');
  });
});

describe('deleteCognitoTokens', () => {
  it('deletes tokens for the given user', async () => {
    (prisma.cognitoTokens.delete as jest.Mock).mockResolvedValue({});

    await deleteCognitoTokens('user-1');

    expect(prisma.cognitoTokens.delete).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('does not throw when tokens do not exist', async () => {
    (prisma.cognitoTokens.delete as jest.Mock).mockRejectedValue(new Error('Not found'));

    await expect(deleteCognitoTokens('user-missing')).resolves.toBeUndefined();
  });
});
