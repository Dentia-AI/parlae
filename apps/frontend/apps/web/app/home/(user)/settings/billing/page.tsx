import { resolveProductPlan } from '@kit/billing-gateway';
import {
  BillingPortalCard,
  CurrentLifetimeOrderCard,
  CurrentSubscriptionCard,
} from '@kit/billing-gateway/components';
import { If } from '@kit/ui/if';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Trans } from '@kit/ui/trans';
import { Badge } from '@kit/ui/badge';
import { CreditCard, Receipt, BarChart3 } from 'lucide-react';

import billingConfig from '~/config/billing.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { createPersonalAccountBillingPortalSession } from '../../billing/_lib/server/server-actions';
import { PersonalAccountCheckoutForm } from '../../billing/_components/personal-account-checkout-form';
import { PersonalAccountOrdersCard } from '../../billing/_components/personal-account-orders-card';
import { PersonalAccountUsageCard } from '../../billing/_components/personal-account-usage-card';
import { loadPersonalAccountBillingPageData } from '../../billing/_lib/server/personal-account-billing-page.loader';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  return {
    title: `${i18n.t('account:billingTab')} - Settings`,
  };
};

async function SettingsBillingPage() {
  const user = await requireUserInServerComponent();

  const { subscription, orders, usageRecords, customerId } =
    await loadPersonalAccountBillingPageData(user.id);

  const subscriptionVariantId = subscription?.items[0]?.variantId;
  const latestOrder = orders[0] ?? null;
  const orderVariantId = latestOrder?.items[0]?.variantId;

  const subscriptionProductPlan =
    subscription && subscriptionVariantId
      ? await resolveProductPlan(
          billingConfig,
          subscriptionVariantId,
          subscription.currency,
        )
      : undefined;

  const orderProductPlan =
    latestOrder && orderVariantId
      ? await resolveProductPlan(
          billingConfig,
          orderVariantId,
          latestOrder.currency,
        )
      : undefined;

  const hasBillingData = subscription || latestOrder;

  const i18n = await createI18nServerInstance();
  const locale = i18n.language;

  return (
    <div className="space-y-6">
      {/* Current Plan / Checkout */}
      <div className="max-w-3xl">
        <If
          condition={hasBillingData}
          fallback={
            <PersonalAccountCheckoutForm customerId={customerId} />
          }
        >
          <div className="space-y-6">
            <If condition={subscription}>
              {(currentSubscription) => {
                if (!subscriptionProductPlan) {
                  return null;
                }

                return (
                  <CurrentSubscriptionCard
                    subscription={currentSubscription}
                    product={subscriptionProductPlan.product}
                    plan={subscriptionProductPlan.plan}
                  />
                );
              }}
            </If>

            <If condition={latestOrder}>
              {(currentOrder) => {
                if (!orderProductPlan) {
                  return null;
                }

                return (
                  <CurrentLifetimeOrderCard
                    order={currentOrder}
                    product={orderProductPlan.product}
                    plan={orderProductPlan.plan}
                  />
                );
              }}
            </If>
          </div>
        </If>

        <If condition={customerId}>
          {() => <CustomerBillingPortalForm />}
        </If>
      </div>

      {/* History Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PersonalAccountOrdersCard orders={orders} locale={locale} />
        <PersonalAccountUsageCard usageRecords={usageRecords} />
      </div>
    </div>
  );
}

export default withI18n(SettingsBillingPage);

function CustomerBillingPortalForm() {
  return (
    <form action={createPersonalAccountBillingPortalSession}>
      <BillingPortalCard />
    </form>
  );
}
