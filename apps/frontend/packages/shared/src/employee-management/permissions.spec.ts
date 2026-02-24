jest.mock('@kit/prisma', () => ({
  prisma: {
    account: { findUnique: jest.fn(), findMany: jest.fn() },
    accountMembership: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from '@kit/prisma';
import {
  hasPermission,
  getUserAccounts,
  getAccountEmployees,
  getAccountPermissions,
  canManageUser,
} from './permissions';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('permissions', () => {
  describe('hasPermission', () => {
    it('returns true if user is the primary owner', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'user-1',
      });

      const result = await hasPermission('user-1', 'account-1', 'BILLING_MANAGE' as any);
      expect(result).toBe(true);
      expect(mockPrisma.accountMembership.findUnique).not.toHaveBeenCalled();
    });

    it('returns true if user role includes the permission', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'other-user',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock).mockResolvedValue({
        role: {
          permissions: [
            { permission: 'BILLING_MANAGE' },
            { permission: 'SETTINGS_MANAGE' },
          ],
        },
      });

      const result = await hasPermission('user-2', 'account-1', 'BILLING_MANAGE' as any);
      expect(result).toBe(true);
    });

    it('returns false if user role does not include the permission', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'other-user',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock).mockResolvedValue({
        role: {
          permissions: [{ permission: 'SETTINGS_MANAGE' }],
        },
      });

      const result = await hasPermission('user-2', 'account-1', 'BILLING_MANAGE' as any);
      expect(result).toBe(false);
    });

    it('returns false if user has no membership', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'other-user',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await hasPermission('user-3', 'account-1', 'BILLING_MANAGE' as any);
      expect(result).toBe(false);
    });

    it('looks up membership with composite key', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'x',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock).mockResolvedValue(null);

      await hasPermission('u1', 'a1', 'BILLING_MANAGE' as any);

      expect(mockPrisma.accountMembership.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId_userId: { accountId: 'a1', userId: 'u1' } },
        }),
      );
    });
  });

  describe('getUserAccounts', () => {
    it('returns accounts with permissions and role name', async () => {
      (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'acc-1',
          name: 'My Account',
          memberships: [
            {
              role: {
                permissions: [{ permission: 'BILLING_MANAGE' }],
              },
              roleName: 'admin',
            },
          ],
        },
      ]);

      const accounts = await getUserAccounts('user-1');

      expect(accounts).toHaveLength(1);
      expect(accounts[0]!.permissions).toEqual(['BILLING_MANAGE']);
      expect(accounts[0]!.roleName).toBe('admin');
    });

    it('defaults to "owner" role and empty permissions when membership is missing', async () => {
      (mockPrisma.account.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'acc-2',
          memberships: [],
        },
      ]);

      const accounts = await getUserAccounts('user-1');

      expect(accounts[0]!.permissions).toEqual([]);
      expect(accounts[0]!.roleName).toBe('owner');
    });
  });

  describe('getAccountEmployees', () => {
    it('returns memberships with user and role data', async () => {
      const mockMemberships = [
        {
          user: { id: 'u1', email: 'a@b.com', displayName: 'A', role: 'member', createdAt: new Date() },
          role: { name: 'admin', hierarchyLevel: 2 },
          createdAt: new Date(),
        },
      ];
      (mockPrisma.accountMembership.findMany as jest.Mock).mockResolvedValue(mockMemberships);

      const result = await getAccountEmployees('account-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.user.email).toBe('a@b.com');
      expect(result[0]!.role.name).toBe('admin');
    });
  });

  describe('getAccountPermissions', () => {
    it('returns all permissions for account owner', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'owner-1',
      });

      const perms = await getAccountPermissions('owner-1', 'acc-1');

      expect(perms).toContain('ROLES_MANAGE');
      expect(perms).toContain('BILLING_MANAGE');
      expect(perms).toContain('SETTINGS_MANAGE');
      expect(perms).toContain('MEMBERS_MANAGE');
      expect(perms).toContain('INVITES_MANAGE');
      expect(perms).toContain('ANALYTICS_VIEW');
      expect(perms.length).toBeGreaterThanOrEqual(10);
    });

    it('returns role-based permissions for non-owner member', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'other',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock).mockResolvedValue({
        role: {
          permissions: [
            { permission: 'SETTINGS_MANAGE' },
            { permission: 'ANALYTICS_VIEW' },
          ],
        },
      });

      const perms = await getAccountPermissions('user-2', 'acc-1');

      expect(perms).toEqual(['SETTINGS_MANAGE', 'ANALYTICS_VIEW']);
    });

    it('returns empty array when user has no membership', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'other',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock).mockResolvedValue(null);

      const perms = await getAccountPermissions('nobody', 'acc-1');
      expect(perms).toEqual([]);
    });
  });

  describe('canManageUser', () => {
    it('returns true if manager is the account owner', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'manager-1',
      });

      const result = await canManageUser('manager-1', 'target-1', 'acc-1');
      expect(result).toBe(true);
    });

    it('returns true if manager has lower hierarchy level (more power)', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'someone-else',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock)
        .mockResolvedValueOnce({ role: { hierarchyLevel: 1 } }) // manager
        .mockResolvedValueOnce({ role: { hierarchyLevel: 3 } }); // target

      const result = await canManageUser('manager', 'target', 'acc-1');
      expect(result).toBe(true);
    });

    it('returns false if manager has equal hierarchy level', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'someone-else',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock)
        .mockResolvedValueOnce({ role: { hierarchyLevel: 2 } })
        .mockResolvedValueOnce({ role: { hierarchyLevel: 2 } });

      const result = await canManageUser('manager', 'target', 'acc-1');
      expect(result).toBe(false);
    });

    it('returns false if manager has higher hierarchy level (less power)', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'someone-else',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock)
        .mockResolvedValueOnce({ role: { hierarchyLevel: 5 } })
        .mockResolvedValueOnce({ role: { hierarchyLevel: 2 } });

      const result = await canManageUser('manager', 'target', 'acc-1');
      expect(result).toBe(false);
    });

    it('returns false if either membership is missing', async () => {
      (mockPrisma.account.findUnique as jest.Mock).mockResolvedValue({
        primaryOwnerId: 'someone-else',
      });
      (mockPrisma.accountMembership.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // manager not found
        .mockResolvedValueOnce({ role: { hierarchyLevel: 3 } });

      const result = await canManageUser('manager', 'target', 'acc-1');
      expect(result).toBe(false);
    });
  });
});
