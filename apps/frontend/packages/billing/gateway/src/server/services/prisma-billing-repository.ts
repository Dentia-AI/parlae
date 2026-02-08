import { prisma } from '@kit/prisma';
import type { Prisma } from '@kit/prisma';
import type { UpsertOrderParams, UpsertSubscriptionParams } from '@kit/billing/types';

type BillingProvider = 'STRIPE';

type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

type SubscriptionStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'PAUSED';

type SubscriptionItemType = 'FLAT' | 'PER_SEAT' | 'METERED';

function mapSubscriptionStatus(status: string): SubscriptionStatus {
  return status.toUpperCase() as SubscriptionStatus;
}

function mapPaymentStatus(status: string): PaymentStatus {
  return status.toUpperCase() as PaymentStatus;
}

function mapSubscriptionItemType(type: string | undefined): SubscriptionItemType {
  switch (type?.toLowerCase()) {
    case 'per_seat':
      return 'PER_SEAT';
    case 'metered':
      return 'METERED';
    default:
      return 'FLAT';
  }
}

function mapBillingProvider(provider: string): BillingProvider {
  return provider.toUpperCase() as BillingProvider;
}

export async function upsertStripeSubscription(
  payload: UpsertSubscriptionParams,
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const billingProvider = mapBillingProvider(payload.billing_provider);

    const existingCustomer = await tx.billingCustomer.findFirst({
      where: {
        accountId: payload.target_account_id,
        provider: billingProvider,
        customerId: payload.target_customer_id,
      },
    });

    const billingCustomer = existingCustomer
      ? await tx.billingCustomer.update({
          where: { id: existingCustomer.id },
          data: {
            provider: billingProvider,
          },
        })
      : await tx.billingCustomer.create({
          data: {
            accountId: payload.target_account_id,
            provider: billingProvider,
            customerId: payload.target_customer_id,
          },
        });

    await tx.subscription.upsert({
      where: {
        id: payload.target_subscription_id,
      },
      create: {
        id: payload.target_subscription_id,
        accountId: payload.target_account_id,
        billingCustomerId: billingCustomer.id,
        billingProvider,
        active: payload.active,
        status: mapSubscriptionStatus(payload.status),
        cancelAtPeriodEnd: payload.cancel_at_period_end,
        currency: payload.currency.toUpperCase(),
        periodStartsAt: new Date(payload.period_starts_at),
        periodEndsAt: new Date(payload.period_ends_at),
        trialStartsAt: payload.trial_starts_at
          ? new Date(payload.trial_starts_at)
          : null,
        trialEndsAt: payload.trial_ends_at
          ? new Date(payload.trial_ends_at)
          : null,
      },
      update: {
        accountId: payload.target_account_id,
        billingCustomerId: billingCustomer.id,
        billingProvider,
        active: payload.active,
        status: mapSubscriptionStatus(payload.status),
        cancelAtPeriodEnd: payload.cancel_at_period_end,
        currency: payload.currency.toUpperCase(),
        periodStartsAt: new Date(payload.period_starts_at),
        periodEndsAt: new Date(payload.period_ends_at),
        trialStartsAt: payload.trial_starts_at
          ? new Date(payload.trial_starts_at)
          : null,
        trialEndsAt: payload.trial_ends_at
          ? new Date(payload.trial_ends_at)
          : null,
      },
    });

    const itemIds = payload.line_items.map(
      (item) => item.subscription_item_id ?? item.id,
    );

    await tx.subscriptionItem.deleteMany({
      where: {
        subscriptionId: payload.target_subscription_id,
        id: {
          notIn: itemIds,
        },
      },
    });

    for (const item of payload.line_items) {
      const subscriptionItemId = item.subscription_item_id ?? item.id;

      await tx.subscriptionItem.upsert({
        where: {
          id: subscriptionItemId,
        },
        create: {
          id: subscriptionItemId,
          subscriptionId: payload.target_subscription_id,
          productId: item.product_id,
          variantId: item.variant_id,
          type: mapSubscriptionItemType(item.type),
          priceAmount: item.price_amount ?? null,
          quantity: item.quantity ?? 1,
          interval: item.interval,
          intervalCount: item.interval_count,
        },
        update: {
          productId: item.product_id,
          variantId: item.variant_id,
          type: mapSubscriptionItemType(item.type),
          priceAmount: item.price_amount ?? null,
          quantity: item.quantity ?? 1,
          interval: item.interval,
          intervalCount: item.interval_count,
        },
      });
    }
  });
}

export async function upsertStripeOrder(payload: UpsertOrderParams) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const billingProvider = mapBillingProvider(payload.billing_provider);

    const existingCustomer = await tx.billingCustomer.findFirst({
      where: {
        accountId: payload.target_account_id,
        provider: billingProvider,
        customerId: payload.target_customer_id,
      },
    });

    const billingCustomer = existingCustomer
      ? await tx.billingCustomer.update({
          where: { id: existingCustomer.id },
          data: {
            provider: billingProvider,
          },
        })
      : await tx.billingCustomer.create({
          data: {
            accountId: payload.target_account_id,
            provider: billingProvider,
            customerId: payload.target_customer_id,
          },
        });

    await tx.order.upsert({
      where: { id: payload.target_order_id },
      create: {
        id: payload.target_order_id,
        accountId: payload.target_account_id,
        billingCustomerId: billingCustomer.id,
        billingProvider,
        status: mapPaymentStatus(payload.status),
        totalAmount: payload.total_amount,
        currency: payload.currency.toUpperCase(),
      },
      update: {
        accountId: payload.target_account_id,
        billingCustomerId: billingCustomer.id,
        billingProvider,
        status: mapPaymentStatus(payload.status),
        totalAmount: payload.total_amount,
        currency: payload.currency.toUpperCase(),
      },
    });

    const itemIds = payload.line_items.map((item) => item.id);

    await tx.orderItem.deleteMany({
      where: {
        orderId: payload.target_order_id,
        id: {
          notIn: itemIds,
        },
      },
    });

    for (const item of payload.line_items) {
      await tx.orderItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          orderId: payload.target_order_id,
          productId: item.product_id,
          variantId: item.variant_id,
          priceAmount: item.price_amount ?? null,
          quantity: item.quantity ?? 1,
        },
        update: {
          productId: item.product_id,
          variantId: item.variant_id,
          priceAmount: item.price_amount ?? null,
          quantity: item.quantity ?? 1,
        },
      });
    }
  });
}

export async function deleteSubscriptionById(subscriptionId: string) {
  await prisma.subscription.delete({
    where: { id: subscriptionId },
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: PaymentStatus,
) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
    },
  });
}
