import { cache } from 'react';

import { prisma } from '@kit/prisma';

export interface AccountListItem {
  id: string;
  name: string;
  email: string | null;
  pictureUrl: string | null;
  isPersonalAccount: boolean;
  primaryOwner: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
  agentTemplate?: {
    id: string;
    name: string;
    displayName: string;
    version: string;
  } | null;
}

export interface SearchAccountsParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchAccountsResult {
  accounts: AccountListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Search and paginate accounts
 * Cached for the duration of the request
 */
export const searchAccounts = cache(
  async (params: SearchAccountsParams = {}): Promise<SearchAccountsResult> => {
    const {
      search = '',
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            {
              primaryOwner: {
                email: { contains: search, mode: 'insensitive' as const },
              },
            },
            {
              primaryOwner: {
                displayName: { contains: search, mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {};

    // Execute queries in parallel
    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          primaryOwner: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          agentTemplate: {
            select: {
              id: true,
              name: true,
              displayName: true,
              version: true,
            },
          },
          _count: {
            select: { memberships: true },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    // Transform to response format
    const accountList: AccountListItem[] = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      email: account.email,
      pictureUrl: account.pictureUrl,
      isPersonalAccount: account.isPersonalAccount,
      primaryOwner: {
        id: account.primaryOwner.id,
        email: account.primaryOwner.email,
        displayName: account.primaryOwner.displayName,
        avatarUrl: account.primaryOwner.avatarUrl,
      },
      memberCount: account._count.memberships,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      agentTemplate: account.agentTemplate,
    }));

    return {
      accounts: accountList,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
);

/**
 * Get a single account by ID
 */
export const getAccountById = cache(async (accountId: string) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      primaryOwner: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  return account;
});

