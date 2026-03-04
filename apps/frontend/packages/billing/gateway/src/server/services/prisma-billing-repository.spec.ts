jest.mock('@kit/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    subscription: { delete: jest.fn() },
    order: { update: jest.fn() },
  },
}));

jest.mock('@kit/billing/types', () => ({}));

import { prisma } from '@kit/prisma';
import {
  upsertStripeSubscription,
  upsertStripeOrder,
  deleteSubscriptionById,
  updateOrderStatus,
} from './prisma-billing-repository';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createMockTx() {
  return {
    billingCustomer: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      upsert: jest.fn(),
    },
    subscriptionItem: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    order: {
      upsert: jest.fn(),
    },
    orderItem: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

describe('upsertStripeSubscription', () => {
  const basePayload = {
    target_subscription_id: 'sub_123',
    target_account_id: 'acc-1',
    target_customer_id: 'cus_123',
    billing_provider: 'stripe' as const,
    status: 'active',
    active: true,
    currency: 'usd',
    cancel_at_period_end: false,
    period_starts_at: '2024-01-01T00:00:00Z',
    period_ends_at: '2024-02-01T00:00:00Z',
    line_items: [
      {
        id: 'li-1',
        quantity: 1,
        subscription_id: 'sub_123',
        subscription_item_id: 'si_1',
        product_id: 'prod_1',
        variant_id: 'price_1',
        price_amount: 1000,
        interval: 'month',
        interval_count: 1,
        type: 'flat' as const,
      },
    ],
  };

  it('creates a new billing customer and subscription when none exist', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({
      id: 'bc-1',
      accountId: 'acc-1',
      provider: 'STRIPE',
      customerId: 'cus_123',
    });

    await upsertStripeSubscription(basePayload);

    expect(mockTx.billingCustomer.findFirst).toHaveBeenCalledWith({
      where: {
        accountId: 'acc-1',
        provider: 'STRIPE',
        customerId: 'cus_123',
      },
    });
    expect(mockTx.billingCustomer.create).toHaveBeenCalled();
    expect(mockTx.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub_123' },
      }),
    );
  });

  it('updates an existing billing customer', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue({
      id: 'bc-existing',
      accountId: 'acc-1',
      provider: 'STRIPE',
      customerId: 'cus_123',
    });
    mockTx.billingCustomer.update.mockResolvedValue({
      id: 'bc-existing',
      accountId: 'acc-1',
      provider: 'STRIPE',
      customerId: 'cus_123',
    });

    await upsertStripeSubscription(basePayload);

    expect(mockTx.billingCustomer.update).toHaveBeenCalledWith({
      where: { id: 'bc-existing' },
      data: { provider: 'STRIPE' },
    });
    expect(mockTx.billingCustomer.create).not.toHaveBeenCalled();
  });

  it('cleans up removed subscription items', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    await upsertStripeSubscription(basePayload);

    expect(mockTx.subscriptionItem.deleteMany).toHaveBeenCalledWith({
      where: {
        subscriptionId: 'sub_123',
        id: { notIn: ['si_1'] },
      },
    });
  });

  it('upserts each subscription line item', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    await upsertStripeSubscription(basePayload);

    expect(mockTx.subscriptionItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'si_1' },
        create: expect.objectContaining({
          id: 'si_1',
          subscriptionId: 'sub_123',
          productId: 'prod_1',
          variantId: 'price_1',
          type: 'FLAT',
          priceAmount: 1000,
          quantity: 1,
        }),
      }),
    );
  });

  it('uses line item id as fallback when subscription_item_id is missing', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    const payload = {
      ...basePayload,
      line_items: [
        {
          ...basePayload.line_items[0]!,
          subscription_item_id: undefined as any,
          id: 'fallback-id',
        },
      ],
    };

    await upsertStripeSubscription(payload);

    expect(mockTx.subscriptionItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fallback-id' },
      }),
    );
  });

  it('handles trial dates when present', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    const payload = {
      ...basePayload,
      trial_starts_at: '2024-01-01T00:00:00Z',
      trial_ends_at: '2024-01-14T00:00:00Z',
    };

    await upsertStripeSubscription(payload);

    const upsertCall = mockTx.subscription.upsert.mock.calls[0]![0];
    expect(upsertCall.create.trialStartsAt).toEqual(
      new Date('2024-01-01T00:00:00Z'),
    );
    expect(upsertCall.create.trialEndsAt).toEqual(
      new Date('2024-01-14T00:00:00Z'),
    );
  });

  it('sets trial dates to null when not present', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    await upsertStripeSubscription(basePayload);

    const upsertCall = mockTx.subscription.upsert.mock.calls[0]![0];
    expect(upsertCall.create.trialStartsAt).toBeNull();
    expect(upsertCall.create.trialEndsAt).toBeNull();
  });

  it('maps subscription item types correctly', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    const payload = {
      ...basePayload,
      line_items: [
        { ...basePayload.line_items[0]!, type: 'flat' as const },
        {
          ...basePayload.line_items[0]!,
          id: 'li-2',
          subscription_item_id: 'si_2',
          type: 'per_seat' as const,
        },
        {
          ...basePayload.line_items[0]!,
          id: 'li-3',
          subscription_item_id: 'si_3',
          type: 'metered' as const,
        },
      ],
    };

    await upsertStripeSubscription(payload);

    const calls = mockTx.subscriptionItem.upsert.mock.calls;
    expect(calls[0]![0].create.type).toBe('FLAT');
    expect(calls[1]![0].create.type).toBe('PER_SEAT');
    expect(calls[2]![0].create.type).toBe('METERED');
  });
});

describe('upsertStripeOrder', () => {
  const basePayload = {
    target_order_id: 'order_123',
    target_account_id: 'acc-1',
    target_customer_id: 'cus_123',
    billing_provider: 'stripe' as const,
    status: 'succeeded',
    total_amount: 5000,
    currency: 'usd',
    line_items: [
      {
        id: 'oli-1',
        product_id: 'prod_1',
        variant_id: 'price_1',
        price_amount: 5000,
        quantity: 1,
      },
    ],
  };

  it('creates a billing customer and order when none exist', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({
      id: 'bc-1',
      accountId: 'acc-1',
      provider: 'STRIPE',
      customerId: 'cus_123',
    });

    await upsertStripeOrder(basePayload);

    expect(mockTx.billingCustomer.create).toHaveBeenCalled();
    expect(mockTx.order.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_123' },
        create: expect.objectContaining({
          id: 'order_123',
          totalAmount: 5000,
          currency: 'USD',
          status: 'SUCCEEDED',
        }),
      }),
    );
  });

  it('cleans up removed order items', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    await upsertStripeOrder(basePayload);

    expect(mockTx.orderItem.deleteMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order_123',
        id: { notIn: ['oli-1'] },
      },
    });
  });

  it('upserts each order line item', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue(null);
    mockTx.billingCustomer.create.mockResolvedValue({ id: 'bc-1' });

    await upsertStripeOrder(basePayload);

    expect(mockTx.orderItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'oli-1' },
        create: expect.objectContaining({
          id: 'oli-1',
          orderId: 'order_123',
          productId: 'prod_1',
          variantId: 'price_1',
          priceAmount: 5000,
          quantity: 1,
        }),
      }),
    );
  });

  it('uses existing billing customer if found', async () => {
    const mockTx = createMockTx();
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) =>
      fn(mockTx),
    );
    mockTx.billingCustomer.findFirst.mockResolvedValue({
      id: 'bc-existing',
      accountId: 'acc-1',
      provider: 'STRIPE',
      customerId: 'cus_123',
    });
    mockTx.billingCustomer.update.mockResolvedValue({
      id: 'bc-existing',
    });

    await upsertStripeOrder(basePayload);

    expect(mockTx.billingCustomer.update).toHaveBeenCalledWith({
      where: { id: 'bc-existing' },
      data: { provider: 'STRIPE' },
    });
    expect(mockTx.billingCustomer.create).not.toHaveBeenCalled();
  });
});

describe('deleteSubscriptionById', () => {
  it('deletes the subscription by id', async () => {
    await deleteSubscriptionById('sub_123');

    expect(mockPrisma.subscription.delete).toHaveBeenCalledWith({
      where: { id: 'sub_123' },
    });
  });
});

describe('updateOrderStatus', () => {
  it('updates the order status', async () => {
    await updateOrderStatus('order_123', 'SUCCEEDED');

    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_123' },
      data: { status: 'SUCCEEDED' },
    });
  });

  it('can set status to FAILED', async () => {
    await updateOrderStatus('order_456', 'FAILED');

    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_456' },
      data: { status: 'FAILED' },
    });
  });
});
