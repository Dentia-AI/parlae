import { resolveProductPlan } from '@kit/billing-gateway';
import {
  BillingPortalCard,
  CurrentLifetimeOrderCard,
  CurrentSubscriptionCard,
} from '@kit/billing-gateway/components';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { If } from '@kit/ui/if';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import billingConfig from '~/config/billing.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// local imports
import { HomeLayoutPageHeader } from '../_components/home-page-header';
import { createPersonalAccountBillingPortalSession } from '../billing/_lib/server/server-actions';
import { PersonalAccountCheckoutForm } from './_components/personal-account-checkout-form';
import { PersonalAccountOrdersCard } from './_components/personal-account-orders-card';
import { PersonalAccountUsageCard } from './_components/personal-account-usage-card';
import { loadPersonalAccountBillingPageData } from './_lib/server/personal-account-billing-page.loader';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('account:billingTab');

  return {
    title,
  };
};

async function PersonalAccountBillingPage() {
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
    <>
      <HomeLayoutPageHeader
        title={<Trans i18nKey={'common:routes.billing'} />}
        description={<AppBreadcrumbs />}
      />

      <PageBody>
        <div className="flex flex-col space-y-6">
          <div className={'flex max-w-2xl flex-col space-y-4'}>
            <If
              condition={hasBillingData}
              fallback={
                <PersonalAccountCheckoutForm customerId={customerId} />
              }
            >
              <div className={'flex w-full flex-col space-y-6'}>
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

          <div className="grid gap-4 lg:grid-cols-2">
            <PersonalAccountOrdersCard orders={orders} locale={locale} />
            <PersonalAccountUsageCard usageRecords={usageRecords} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default withI18n(PersonalAccountBillingPage);

function CustomerBillingPortalForm() {
  return (
    <form action={createPersonalAccountBillingPortalSession}>
      <BillingPortalCard />
    </form>
  );
}
