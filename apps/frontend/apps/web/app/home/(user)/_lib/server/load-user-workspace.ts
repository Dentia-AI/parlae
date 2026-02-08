import 'server-only';

import { cache } from 'react';

import { prisma } from '@kit/prisma';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export type UserWorkspace = Awaited<ReturnType<typeof loadUserWorkspace>>;

export const loadUserWorkspace = cache(async () => {
  const user = await requireUserInServerComponent();

  try {
    const workspace = await loadPersonalWorkspace(user.id);
    const stats = await loadUserStats(user.id);
    const accounts = await loadUserAccounts(user.id);

    return {
      accounts,
      workspace,
      user,
      stats,
    };
  } catch (error) {
    console.error(JSON.stringify({
      message: '[loadUserWorkspace] Failed to load workspace',
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      userId: user.id,
    }));
    throw error;
  }
});

async function loadPersonalWorkspace(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      primaryOwnerId: userId,
      isPersonalAccount: true,
    },
    select: {
      id: true,
      name: true,
      pictureUrl: true,
    },
  });

  if (!account) {
    return {
      id: null,
      name: null,
      picture_url: null,
      subscription_status: null,
    };
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      accountId: account.id,
    },
    select: {
      status: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    id: account.id,
    name: account.name,
    picture_url: account.pictureUrl,
    subscription_status: subscription
      ? normalizeSubscriptionStatus(subscription.status)
      : null,
  };
}

function normalizeSubscriptionStatus(status: string) {
  return status.toLowerCase();
}

async function loadUserStats(userId: string) {
  try {
    const [
      totalAds,
      activeCampaigns,
      totalFiles,
      fileAggregate,
      adSpendAggregate,
      paymentsAggregate,
    ] = await Promise.all([
      prisma.ad.count({
        where: {
          userId,
        },
      }).catch(err => {
        console.error(JSON.stringify({ message: '[loadUserStats] Failed to count ads', error: err.message }));
        return 0;
      }),
      prisma.metaAdCampaign.count({
        where: {
          ad: {
            userId,
          },
          status: 'ACTIVE',
        },
      }).catch(err => {
        console.error(JSON.stringify({ message: '[loadUserStats] Failed to count campaigns', error: err.message }));
        return 0;
      }),
      prisma.file.count({
        where: {
          userId,
        },
      }).catch(err => {
        console.error(JSON.stringify({ message: '[loadUserStats] Failed to count files', error: err.message }));
        return 0;
      }),
      prisma.file.aggregate({
        where: {
          userId,
        },
        _sum: {
          size: true,
        },
      }).catch(err => {
        console.error(JSON.stringify({ message: '[loadUserStats] Failed to aggregate files', error: err.message }));
        return { _sum: { size: null } };
      }),
      prisma.userTransaction.aggregate({
        where: {
          userId,
          type: 'AD_SPEND',
        },
        _sum: {
          amountCents: true,
        },
      }).catch(err => {
        console.error(JSON.stringify({ message: '[loadUserStats] Failed to aggregate ad spend', error: err.message }));
        return { _sum: { amountCents: null } };
      }),
      prisma.userTransaction.aggregate({
        where: {
          userId,
          type: {
            in: ['PAYMENT', 'REVERSAL'],
          },
        },
        _sum: {
          amountCents: true,
        },
      }).catch(err => {
        console.error(JSON.stringify({ message: '[loadUserStats] Failed to aggregate payments', error: err.message }));
        return { _sum: { amountCents: null } };
      }),
    ]);

    const storageUsedBytes = fileAggregate._sum.size ?? 0;
    const totalSpendCents = adSpendAggregate._sum.amountCents ?? 0;
    const totalPaymentsCents = paymentsAggregate._sum.amountCents ?? 0;

    return {
      totalAds,
      activeCampaigns,
      totalFiles,
      storageUsedBytes,
      totalSpendCents,
      totalPaymentsCents,
      netBalanceCents: totalPaymentsCents - totalSpendCents,
    };
  } catch (error) {
    console.error(JSON.stringify({
      message: '[loadUserStats] Unexpected error',
      error: error instanceof Error ? error.message : error,
      userId,
    }));
    
    // Return default values on error so the page can still load
    return {
      totalAds: 0,
      activeCampaigns: 0,
      totalFiles: 0,
      storageUsedBytes: 0,
      totalSpendCents: 0,
      totalPaymentsCents: 0,
      netBalanceCents: 0,
    };
  }
}

async function loadUserAccounts(userId: string) {
  // Load all accounts the user has access to (either as owner or member)
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { primaryOwnerId: userId },
        {
          memberships: {
            some: {
              userId,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      pictureUrl: true,
      isPersonalAccount: true,
      memberships: {
        where: {
          userId,
        },
        select: {
          roleName: true,
        },
      },
    },
    orderBy: [
      { isPersonalAccount: 'desc' }, // Personal account first
      { name: 'asc' }, // Then alphabetically
    ],
  });

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    slug: account.slug,
    pictureUrl: account.pictureUrl,
    isPersonalAccount: account.isPersonalAccount,
    role: account.memberships[0]?.roleName ?? 'owner',
  }));
}
