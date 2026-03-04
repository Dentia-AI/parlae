jest.mock('server-only', () => ({}));

jest.mock('@kit/billing', () => ({
  BillingWebhookHandlerService: class {},
}));

jest.mock('@kit/billing/types', () => ({}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../prisma-billing-repository', () => ({
  deleteSubscriptionById: jest.fn(),
  upsertStripeSubscription: jest.fn(),
  upsertStripeOrder: jest.fn(),
  updateOrderStatus: jest.fn(),
}));

import { createBillingEventHandlerService } from './billing-event-handler.service';
import {
  deleteSubscriptionById,
  upsertStripeSubscription,
  upsertStripeOrder,
  updateOrderStatus,
} from '../prisma-billing-repository';

const mockDeleteSubscriptionById = deleteSubscriptionById as jest.Mock;
const mockUpsertSubscription = upsertStripeSubscription as jest.Mock;
const mockUpsertOrder = upsertStripeOrder as jest.Mock;
const mockUpdateOrderStatus = updateOrderStatus as jest.Mock;

describe('BillingEventHandlerService', () => {
  let capturedHandlers: any;

  const mockStrategy = {
    verifyWebhookSignature: jest.fn(),
    handleWebhookEvent: jest.fn(),
  };

  const service = createBillingEventHandlerService(mockStrategy as any);

  const mockRequest = new Request('http://localhost/webhook', {
    method: 'POST',
    body: '{}',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    capturedHandlers = null;

    mockStrategy.verifyWebhookSignature.mockResolvedValue({
      type: 'test.event',
    });
    mockStrategy.handleWebhookEvent.mockImplementation(
      async (_event, handlers) => {
        capturedHandlers = handlers;
      },
    );
  });

  it('verifies the webhook signature and delegates to the strategy', async () => {
    await service.handleWebhookEvent(mockRequest);

    expect(mockStrategy.verifyWebhookSignature).toHaveBeenCalledWith(
      mockRequest,
    );
    expect(mockStrategy.handleWebhookEvent).toHaveBeenCalled();
  });

  it('throws when signature verification returns null', async () => {
    mockStrategy.verifyWebhookSignature.mockResolvedValue(null);

    await expect(service.handleWebhookEvent(mockRequest)).rejects.toThrow(
      'Invalid signature',
    );
  });

  describe('onSubscriptionDeleted handler', () => {
    it('deletes the subscription from the database', async () => {
      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onSubscriptionDeleted('sub_123');

      expect(mockDeleteSubscriptionById).toHaveBeenCalledWith('sub_123');
    });

    it('calls the custom handler if provided', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhookEvent(mockRequest, {
        onSubscriptionDeleted: customHandler,
      });

      await capturedHandlers.onSubscriptionDeleted('sub_123');

      expect(mockDeleteSubscriptionById).toHaveBeenCalledWith('sub_123');
      expect(customHandler).toHaveBeenCalledWith('sub_123');
    });
  });

  describe('onSubscriptionUpdated handler', () => {
    const mockSubscription = {
      target_subscription_id: 'sub_123',
      target_account_id: 'acc-1',
      target_customer_id: 'cus_123',
      billing_provider: 'stripe',
      status: 'active',
      active: true,
      currency: 'usd',
      cancel_at_period_end: false,
      period_starts_at: '2024-01-01T00:00:00Z',
      period_ends_at: '2024-02-01T00:00:00Z',
      line_items: [],
    };

    it('upserts the subscription in the database', async () => {
      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onSubscriptionUpdated(mockSubscription);

      expect(mockUpsertSubscription).toHaveBeenCalledWith(mockSubscription);
    });

    it('calls the custom handler if provided', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhookEvent(mockRequest, {
        onSubscriptionUpdated: customHandler,
      });

      await capturedHandlers.onSubscriptionUpdated(mockSubscription);

      expect(mockUpsertSubscription).toHaveBeenCalledWith(mockSubscription);
      expect(customHandler).toHaveBeenCalledWith(mockSubscription);
    });
  });

  describe('onCheckoutSessionCompleted handler', () => {
    it('upserts a subscription when payload is a subscription', async () => {
      const subscriptionPayload = {
        target_subscription_id: 'sub_123',
        target_account_id: 'acc-1',
        target_customer_id: 'cus_123',
        billing_provider: 'stripe',
        status: 'active',
        active: true,
        currency: 'usd',
        cancel_at_period_end: false,
        period_starts_at: '2024-01-01T00:00:00Z',
        period_ends_at: '2024-02-01T00:00:00Z',
        line_items: [],
      };

      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onCheckoutSessionCompleted(subscriptionPayload);

      expect(mockUpsertSubscription).toHaveBeenCalledWith(subscriptionPayload);
      expect(mockUpsertOrder).not.toHaveBeenCalled();
    });

    it('upserts an order when payload has target_order_id', async () => {
      const orderPayload = {
        target_order_id: 'order_123',
        target_account_id: 'acc-1',
        target_customer_id: 'cus_123',
        billing_provider: 'stripe',
        status: 'succeeded',
        total_amount: 5000,
        currency: 'usd',
        line_items: [],
      };

      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onCheckoutSessionCompleted(orderPayload);

      expect(mockUpsertOrder).toHaveBeenCalledWith(orderPayload);
      expect(mockUpsertSubscription).not.toHaveBeenCalled();
    });

    it('calls the custom handler for subscription checkout', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      const subscriptionPayload = {
        target_subscription_id: 'sub_123',
        target_account_id: 'acc-1',
        target_customer_id: 'cus_123',
        billing_provider: 'stripe',
        status: 'active',
        active: true,
        currency: 'usd',
        cancel_at_period_end: false,
        period_starts_at: '2024-01-01T00:00:00Z',
        period_ends_at: '2024-02-01T00:00:00Z',
        line_items: [],
      };

      await service.handleWebhookEvent(mockRequest, {
        onCheckoutSessionCompleted: customHandler,
      });

      await capturedHandlers.onCheckoutSessionCompleted(subscriptionPayload);

      expect(customHandler).toHaveBeenCalledWith(
        subscriptionPayload,
        'cus_123',
      );
    });

    it('calls the custom handler for order checkout', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      const orderPayload = {
        target_order_id: 'order_123',
        target_account_id: 'acc-1',
        target_customer_id: 'cus_123',
        billing_provider: 'stripe',
        status: 'succeeded',
        total_amount: 5000,
        currency: 'usd',
        line_items: [],
      };

      await service.handleWebhookEvent(mockRequest, {
        onCheckoutSessionCompleted: customHandler,
      });

      await capturedHandlers.onCheckoutSessionCompleted(orderPayload);

      expect(customHandler).toHaveBeenCalledWith(orderPayload, 'cus_123');
    });
  });

  describe('onPaymentSucceeded handler', () => {
    it('updates order status to SUCCEEDED', async () => {
      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onPaymentSucceeded('sess_123');

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        'sess_123',
        'SUCCEEDED',
      );
    });

    it('calls the custom handler if provided', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhookEvent(mockRequest, {
        onPaymentSucceeded: customHandler,
      });

      await capturedHandlers.onPaymentSucceeded('sess_123');

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        'sess_123',
        'SUCCEEDED',
      );
      expect(customHandler).toHaveBeenCalledWith('sess_123');
    });
  });

  describe('onPaymentFailed handler', () => {
    it('updates order status to FAILED', async () => {
      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onPaymentFailed('sess_456');

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith('sess_456', 'FAILED');
    });

    it('calls the custom handler if provided', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhookEvent(mockRequest, {
        onPaymentFailed: customHandler,
      });

      await capturedHandlers.onPaymentFailed('sess_456');

      expect(customHandler).toHaveBeenCalledWith('sess_456');
    });
  });

  describe('onInvoicePaid handler', () => {
    const mockSubscription = {
      target_subscription_id: 'sub_789',
      target_account_id: 'acc-1',
      target_customer_id: 'cus_123',
      billing_provider: 'stripe',
      status: 'active',
      active: true,
      currency: 'usd',
      cancel_at_period_end: false,
      period_starts_at: '2024-01-01T00:00:00Z',
      period_ends_at: '2024-02-01T00:00:00Z',
      line_items: [],
    };

    it('upserts the subscription from invoice data', async () => {
      await service.handleWebhookEvent(mockRequest);
      await capturedHandlers.onInvoicePaid(mockSubscription);

      expect(mockUpsertSubscription).toHaveBeenCalledWith(mockSubscription);
    });

    it('calls the custom handler if provided', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhookEvent(mockRequest, {
        onInvoicePaid: customHandler,
      });

      await capturedHandlers.onInvoicePaid(mockSubscription);

      expect(customHandler).toHaveBeenCalledWith(mockSubscription);
    });
  });

  describe('onEvent handler', () => {
    it('forwards to the custom onEvent handler when provided', async () => {
      const onEvent = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhookEvent(mockRequest, { onEvent });

      expect(capturedHandlers.onEvent).toBeDefined();
    });

    it('does not set onEvent handler when not provided', async () => {
      await service.handleWebhookEvent(mockRequest);

      expect(capturedHandlers.onEvent).toBeUndefined();
    });
  });
});
