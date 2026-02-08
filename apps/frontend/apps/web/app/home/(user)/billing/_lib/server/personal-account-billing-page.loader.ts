import 'server-only';

import { cache } from 'react';

import { prisma } from '@kit/prisma';

export const loadPersonalAccountBillingPageData = cache(
  personalAccountBillingPageDataLoader,
);

async function personalAccountBillingPageDataLoader(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      primaryOwnerId: userId,
      isPersonalAccount: true,
    },
    select: {
      id: true,
    },
  });

  if (!account) {
    return {
      subscription: null,
      orders: [],
      usageRecords: [],
      customerId: null,
    };
  }

  const [subscription, orders, usageRecords, customer] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        accountId: account.id,
      },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.order.findMany({
      where: {
        accountId: account.id,
      },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    }),
    prisma.usageRecord.findMany({
      where: {
        subscriptionItem: {
          subscription: {
            accountId: account.id,
          },
        },
      },
      include: {
        subscriptionItem: true,
      },
      orderBy: {
        recordedAt: 'desc',
      },
      take: 25,
    }),
    prisma.billingCustomer.findFirst({
      where: {
        accountId: account.id,
        provider: 'STRIPE',
      },
      select: {
        customerId: true,
      },
    }),
  ]);

  return {
    subscription,
    orders,
    usageRecords,
    customerId: customer?.customerId ?? null,
  };
}

export type PersonalAccountBillingPageData = Awaited<
  ReturnType<typeof personalAccountBillingPageDataLoader>
>;
