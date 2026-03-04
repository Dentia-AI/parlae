jest.mock('react', () => ({
  cache: (fn: any) => fn,
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    impersonationSession: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('./nextauth', () => ({
  auth: jest.fn(),
}));

import { cookies } from 'next/headers';
import { prisma } from '@kit/prisma';
import { auth } from './nextauth';
import { getImpersonationInfo } from './impersonation';

const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getImpersonationInfo', () => {
  it('returns null when no impersonation-token cookie exists', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue(undefined),
    });

    const result = await getImpersonationInfo();

    expect(result).toBeNull();
  });

  it('returns null when cookie exists but no session (no admin user)', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: 'token-123' }),
    });
    (auth as jest.Mock).mockResolvedValue(null);

    const result = await getImpersonationInfo();

    expect(result).toBeNull();
  });

  it('returns null when session exists but has no user id', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: 'token-123' }),
    });
    (auth as jest.Mock).mockResolvedValue({ user: {} });

    const result = await getImpersonationInfo();

    expect(result).toBeNull();
  });

  it('returns impersonation session when token and admin are valid', async () => {
    const mockSession = {
      sessionToken: 'token-abc',
      adminId: 'admin-1',
      isActive: true,
      admin: { email: 'admin@test.com', displayName: 'Admin' },
      targetUser: { email: 'target@test.com', displayName: 'Target' },
    };

    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: 'token-abc' }),
    });
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1' } });
    (prisma.impersonationSession.findFirst as jest.Mock).mockResolvedValue(mockSession);

    const result = await getImpersonationInfo();

    expect(result).toEqual(mockSession);
    expect(prisma.impersonationSession.findFirst).toHaveBeenCalledWith({
      where: {
        sessionToken: 'token-abc',
        adminId: 'admin-1',
        isActive: true,
      },
      include: {
        admin: { select: { email: true, displayName: true } },
        targetUser: { select: { email: true, displayName: true } },
      },
    });
  });

  it('returns null when no matching impersonation session is found', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: 'token-xyz' }),
    });
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1' } });
    (prisma.impersonationSession.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getImpersonationInfo();

    expect(result).toBeNull();
  });
});
