jest.mock('@kit/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: { upsert: jest.fn() },
    accountMembership: { upsert: jest.fn() },
  },
}));

import { prisma } from '@kit/prisma';
import { ensureUserProvisioned } from './ensure-user';

const mockUser = prisma.user as any;
const mockAccount = prisma.account as any;
const mockRole = prisma.role as any;
const mockMembership = prisma.accountMembership as any;
const mockTransaction = prisma.$transaction as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();

  mockTransaction.mockImplementation(async (fn: any) => {
    const tx = {
      user: mockUser,
      account: mockAccount,
      role: mockRole,
      accountMembership: mockMembership,
    };
    return fn(tx);
  });

  mockRole.upsert.mockResolvedValue({ name: 'owner', hierarchyLevel: 100 });
  mockMembership.upsert.mockResolvedValue({});
});

describe('ensureUserProvisioned', () => {
  describe('new user creation', () => {
    it('creates a new user, account, role, and membership', async () => {
      const createdUser = { id: 'user-1', email: 'test@example.com', displayName: 'Test' };
      const createdAccount = { id: 'acc-1', name: 'Test', slug: 'test', primaryOwnerId: 'user-1' };

      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue(createdUser);
      mockAccount.findFirst.mockResolvedValue(null);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(createdAccount);

      const result = await ensureUserProvisioned({
        userId: 'user-1',
        email: 'Test@Example.com',
        displayName: 'Test',
      });

      expect(result.user).toEqual(createdUser);
      expect(result.account).toEqual(createdAccount);

      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'user-1',
          email: 'test@example.com',
          displayName: 'Test',
          role: 'ACCOUNT_MANAGER',
        }),
      });

      expect(mockAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isPersonalAccount: true,
          primaryOwnerId: 'user-1',
          email: 'test@example.com',
        }),
      });

      expect(mockRole.upsert).toHaveBeenCalledWith({
        where: { name: 'owner' },
        update: {},
        create: { name: 'owner', hierarchyLevel: 100 },
      });

      expect(mockMembership.upsert).toHaveBeenCalledWith({
        where: { accountId_userId: { accountId: 'acc-1', userId: 'user-1' } },
        update: {},
        create: { accountId: 'acc-1', userId: 'user-1', roleName: 'owner' },
      });
    });

    it('derives display name from email when not provided', async () => {
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'user-2', email: 'john.doe@test.com', displayName: 'John Doe' });
      mockAccount.findFirst.mockResolvedValue(null);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue({ id: 'acc-2', name: 'John Doe', primaryOwnerId: 'user-2' });

      await ensureUserProvisioned({
        userId: 'user-2',
        email: 'john.doe@test.com',
      });

      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ displayName: 'John Doe' }),
      });
    });

    it('generates a unique slug when conflicts exist', async () => {
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'user-3', email: 'taken@test.com' });
      mockAccount.findFirst.mockResolvedValue(null);
      mockAccount.findUnique
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);
      mockAccount.create.mockResolvedValue({ id: 'acc-3' });

      await ensureUserProvisioned({
        userId: 'user-3',
        email: 'taken@test.com',
        displayName: 'Taken',
      });

      expect(mockAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'taken-2' }),
      });
    });
  });

  describe('existing user', () => {
    it('skips user creation if user already exists', async () => {
      const existingUser = { id: 'user-1', email: 'existing@test.com', displayName: 'Existing', cognitoUsername: 'cog-1' };
      const existingAccount = { id: 'acc-1', name: 'Existing', primaryOwnerId: 'user-1' };

      mockUser.findUnique.mockResolvedValue(existingUser);
      mockAccount.findFirst.mockResolvedValue(existingAccount);

      const result = await ensureUserProvisioned({
        userId: 'user-1',
        email: 'existing@test.com',
        cognitoUsername: 'cog-1',
      });

      expect(result.user).toEqual(existingUser);
      expect(result.account).toEqual(existingAccount);
      expect(mockUser.create).not.toHaveBeenCalled();
      expect(mockAccount.create).not.toHaveBeenCalled();
    });

    it('updates displayName if current user has none', async () => {
      const existingUser = { id: 'user-1', email: 'u@test.com', displayName: null, cognitoUsername: null };
      const updatedUser = { ...existingUser, displayName: 'New Name' };

      mockUser.findUnique.mockResolvedValue(existingUser);
      mockUser.update.mockResolvedValue(updatedUser);
      mockAccount.findFirst
        .mockResolvedValueOnce({ id: 'acc-1', name: 'u@test.com', primaryOwnerId: 'user-1' })
        .mockResolvedValueOnce({ id: 'acc-1', name: 'u@test.com', primaryOwnerId: 'user-1' });
      mockAccount.update.mockResolvedValue({});

      const result = await ensureUserProvisioned({
        userId: 'user-1',
        email: 'u@test.com',
        displayName: 'New Name',
      });

      expect(mockUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ displayName: 'New Name' }),
      });
      expect(result.user).toEqual(updatedUser);
    });

    it('updates cognitoUsername when existing user has none', async () => {
      const existingUser = { id: 'user-1', email: 'u@test.com', displayName: 'User', cognitoUsername: null };
      const updatedUser = { ...existingUser, cognitoUsername: 'cog-123' };

      mockUser.findUnique.mockResolvedValue(existingUser);
      mockUser.update.mockResolvedValue(updatedUser);
      mockAccount.findFirst.mockResolvedValue({ id: 'acc-1', name: 'User', primaryOwnerId: 'user-1' });

      await ensureUserProvisioned({
        userId: 'user-1',
        email: 'u@test.com',
        displayName: 'User',
        cognitoUsername: 'cog-123',
      });

      expect(mockUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ cognitoUsername: 'cog-123' }),
      });
    });

    it('does not update user when nothing has changed', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'u@test.com',
        displayName: 'Already Set',
        cognitoUsername: 'cog-existing',
      };

      mockUser.findUnique.mockResolvedValue(existingUser);
      mockAccount.findFirst.mockResolvedValue({ id: 'acc-1', name: 'Already Set', primaryOwnerId: 'user-1' });

      // Don't pass displayName so fallback differs from stored value,
      // avoiding the source code's `user.displayName === params.displayName` check
      await ensureUserProvisioned({
        userId: 'user-1',
        email: 'u@test.com',
        cognitoUsername: 'cog-existing',
      });

      expect(mockUser.update).not.toHaveBeenCalled();
    });

    it('updates account name if it was set to email and user now has real name', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'u@test.com',
        displayName: 'u@test.com',
        cognitoUsername: null,
      };
      const updatedUser = { ...existingUser, displayName: 'Real Name' };
      const personalAccount = { id: 'acc-1', name: 'u@test.com', primaryOwnerId: 'user-1' };

      mockUser.findUnique.mockResolvedValue(existingUser);
      mockUser.update.mockResolvedValue(updatedUser);
      mockAccount.findFirst
        .mockResolvedValueOnce(personalAccount)
        .mockResolvedValueOnce(personalAccount);
      mockAccount.update.mockResolvedValue({});

      await ensureUserProvisioned({
        userId: 'user-1',
        email: 'u@test.com',
        displayName: 'Real Name',
      });

      expect(mockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'Real Name' },
      });
    });

    it('creates account if user exists but has no personal account', async () => {
      const existingUser = { id: 'user-1', email: 'u@test.com', displayName: 'User', cognitoUsername: null };
      const createdAccount = { id: 'acc-new', name: 'User', slug: 'user', primaryOwnerId: 'user-1' };

      mockUser.findUnique.mockResolvedValue(existingUser);
      mockAccount.findFirst.mockResolvedValue(null);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(createdAccount);

      const result = await ensureUserProvisioned({
        userId: 'user-1',
        email: 'u@test.com',
        displayName: 'User',
      });

      expect(result.account).toEqual(createdAccount);
      expect(mockAccount.create).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('throws if email is empty', async () => {
      await expect(
        ensureUserProvisioned({ userId: 'user-1', email: '' }),
      ).rejects.toThrow('Email is required to provision a user');
    });

    it('throws if email is only whitespace', async () => {
      await expect(
        ensureUserProvisioned({ userId: 'user-1', email: '   ' }),
      ).rejects.toThrow('Email is required to provision a user');
    });

    it('throws if userId is empty', async () => {
      await expect(
        ensureUserProvisioned({ userId: '', email: 'a@b.com' }),
      ).rejects.toThrow('User ID is required to provision a user');
    });

    it('throws if userId is only whitespace', async () => {
      await expect(
        ensureUserProvisioned({ userId: '   ', email: 'a@b.com' }),
      ).rejects.toThrow('User ID is required to provision a user');
    });

    it('normalizes email to lowercase', async () => {
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'user-1', email: 'upper@test.com' });
      mockAccount.findFirst.mockResolvedValue(null);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue({ id: 'acc-1' });

      await ensureUserProvisioned({
        userId: 'user-1',
        email: 'UPPER@TEST.COM',
      });

      expect(mockUser.findUnique).toHaveBeenCalledWith({
        where: { email: 'upper@test.com' },
      });
    });
  });

  describe('accepts custom db client', () => {
    it('uses the provided PrismaClient instead of the default', async () => {
      const customTransaction = jest.fn();
      const customDb = { $transaction: customTransaction } as any;

      const createdUser = { id: 'user-1', email: 'test@test.com' };
      const createdAccount = { id: 'acc-1' };

      customTransaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(createdUser), update: jest.fn() },
          account: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(createdAccount), update: jest.fn() },
          role: { upsert: jest.fn().mockResolvedValue({}) },
          accountMembership: { upsert: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await ensureUserProvisioned(
        { userId: 'user-1', email: 'test@test.com' },
        customDb,
      );

      expect(customTransaction).toHaveBeenCalled();
      expect(result.user).toEqual(createdUser);
      expect(result.account).toEqual(createdAccount);
    });
  });
});
