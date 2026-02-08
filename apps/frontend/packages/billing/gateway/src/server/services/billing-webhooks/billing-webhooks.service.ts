import 'server-only';

import { createBillingGatewayService } from '../billing-gateway/billing-gateway.service';

type SubscriptionRecord = {
  id: string;
  billingProvider: string;
};

export function createBillingWebhooksService() {
  return new BillingWebhooksService();
}

/**
 * @name BillingWebhooksService
 * @description Service for handling billing webhooks.
 */
class BillingWebhooksService {
  /**
   * @name handleSubscriptionDeletedWebhook
   * @description Handles the webhook for when a subscription is deleted.
   * @param subscription
   */
  async handleSubscriptionDeletedWebhook(subscription: SubscriptionRecord) {
    const gateway = createBillingGatewayService(
      subscription.billingProvider.toLowerCase() as 'stripe',
    );

    const subscriptionData = await gateway.getSubscription(subscription.id);
    const isCanceled = subscriptionData.status === 'canceled';

    if (isCanceled) {
      return;
    }

    return gateway.cancelSubscription({
      subscriptionId: subscription.id,
      invoiceNow: true,
    });
  }
}
