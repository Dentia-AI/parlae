import 'server-only';

import { BillingWebhookHandlerService } from '@kit/billing';
import {
  UpsertOrderParams,
  UpsertSubscriptionParams,
} from '@kit/billing/types';
import { getLogger } from '@kit/shared/logger';

import {
  deleteSubscriptionById,
  upsertStripeOrder,
  upsertStripeSubscription,
  updateOrderStatus,
} from '../prisma-billing-repository';

/**
 * @name CustomHandlersParams
 * @description Allow consumers to provide custom handlers for the billing events
 * that are triggered by the webhook events.
 */
interface CustomHandlersParams {
  onSubscriptionDeleted: (subscriptionId: string) => Promise<unknown>;
  onSubscriptionUpdated: (
    subscription: UpsertSubscriptionParams,
  ) => Promise<unknown>;
  onCheckoutSessionCompleted: (
    payload: UpsertSubscriptionParams | UpsertOrderParams,
    customerId: string,
  ) => Promise<unknown>;
  onPaymentSucceeded: (sessionId: string) => Promise<unknown>;
  onPaymentFailed: (sessionId: string) => Promise<unknown>;
  onInvoicePaid: (subscription: UpsertSubscriptionParams) => Promise<unknown>;
  onEvent(event: unknown): Promise<unknown>;
}

export function createBillingEventHandlerService(
  strategy: BillingWebhookHandlerService,
) {
  return new BillingEventHandlerService(strategy);
}

/**
 * @name BillingEventHandlerService
 * @description This class is used to handle the webhook events from the billing provider
 */
class BillingEventHandlerService {
  private readonly namespace = 'billing';

  constructor(private readonly strategy: BillingWebhookHandlerService) {}

  /**
   * @name handleWebhookEvent
   * @description Handle the webhook event from the billing provider
   * @param request
   * @param params
   */
  async handleWebhookEvent(
    request: Request,
    params: Partial<CustomHandlersParams> = {},
  ) {
    const event = await this.strategy.verifyWebhookSignature(request);

    if (!event) {
      throw new Error('Invalid signature');
    }

    return this.strategy.handleWebhookEvent(event, {
      onSubscriptionDeleted: async (subscriptionId: string) => {
        const logger = await getLogger();

        const ctx = {
          namespace: this.namespace,
          subscriptionId,
        };

        logger.info(ctx, 'Processing subscription deleted event...');

        await deleteSubscriptionById(subscriptionId);

        if (params.onSubscriptionDeleted) {
          await params.onSubscriptionDeleted(subscriptionId);
        }

        logger.info(ctx, 'Successfully deleted subscription');
      },
      onSubscriptionUpdated: async (subscription) => {
        const logger = await getLogger();

        const ctx = {
          namespace: this.namespace,
          subscriptionId: subscription.target_subscription_id,
          provider: subscription.billing_provider,
          accountId: subscription.target_account_id,
          customerId: subscription.target_customer_id,
        };

        logger.info(ctx, 'Processing subscription updated event ...');

        await upsertStripeSubscription(subscription);

        if (params.onSubscriptionUpdated) {
          await params.onSubscriptionUpdated(subscription);
        }

        logger.info(ctx, 'Successfully updated subscription');
      },
      onCheckoutSessionCompleted: async (payload) => {
        const logger = await getLogger();

        if ('target_order_id' in payload) {
          const ctx = {
            namespace: this.namespace,
            orderId: payload.target_order_id,
            provider: payload.billing_provider,
            accountId: payload.target_account_id,
            customerId: payload.target_customer_id,
          };

          logger.info(ctx, 'Processing order completed event...');

          await upsertStripeOrder(payload);

          if (params.onCheckoutSessionCompleted) {
            await params.onCheckoutSessionCompleted(
              payload,
              payload.target_customer_id,
            );
          }

          logger.info(ctx, 'Successfully upserted order');
        } else {
          const ctx = {
            namespace: this.namespace,
            subscriptionId: payload.target_subscription_id,
            provider: payload.billing_provider,
            accountId: payload.target_account_id,
            customerId: payload.target_customer_id,
          };

          logger.info(ctx, 'Processing subscription checkout completion...');

          await upsertStripeSubscription(payload);

          if (params.onCheckoutSessionCompleted) {
            await params.onCheckoutSessionCompleted(
              payload,
              payload.target_customer_id,
            );
          }

          logger.info(ctx, 'Successfully upserted subscription');
        }
      },
      onPaymentSucceeded: async (sessionId: string) => {
        const logger = await getLogger();

        const ctx = {
          namespace: this.namespace,
          sessionId,
        };

        logger.info(ctx, 'Processing payment succeeded event...');

        await updateOrderStatus(sessionId, 'SUCCEEDED');

        if (params.onPaymentSucceeded) {
          await params.onPaymentSucceeded(sessionId);
        }

        logger.info(ctx, 'Successfully updated payment status to succeeded');
      },
      onPaymentFailed: async (sessionId: string) => {
        const logger = await getLogger();

        const ctx = {
          namespace: this.namespace,
          sessionId,
        };

        logger.info(ctx, 'Processing payment failed event...');

        await updateOrderStatus(sessionId, 'FAILED');

        if (params.onPaymentFailed) {
          await params.onPaymentFailed(sessionId);
        }

        logger.info(ctx, 'Successfully updated payment status to failed');
      },
      onInvoicePaid: async (subscription) => {
        const logger = await getLogger();

        const ctx = {
          namespace: this.namespace,
          subscriptionId: subscription.target_subscription_id,
        };

        logger.info(ctx, 'Processing invoice paid event...');

        await upsertStripeSubscription(subscription);

        if (params.onInvoicePaid) {
          await params.onInvoicePaid(subscription);
        }

        logger.info(ctx, 'Successfully processed invoice');
      },
      onEvent: params.onEvent
        ? async (eventData) => params.onEvent?.(eventData)
        : undefined,
    });
  }
}
