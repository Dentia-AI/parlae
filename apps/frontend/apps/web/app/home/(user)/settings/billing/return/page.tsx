import { redirect } from 'next/navigation';

import { BillingSessionStatus } from '@kit/billing-gateway/components';
import { PageBody } from '@kit/ui/page';

import pathsConfig from '~/config/paths.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('billing:checkoutSuccessTitle', 'Billing');

  return {
    title,
  };
};

async function SettingsBillingReturnPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams?.session_id;

  if (!sessionId) {
    redirect(pathsConfig.app.personalAccountBilling);
  }

  const user = await requireUserInServerComponent();
  const customerEmail = user.email ?? '';

  const emailForReceipt = customerEmail || 'your inbox';

  return (
    <PageBody>
      <div className="flex flex-1 items-center justify-center py-16">
        <BillingSessionStatus
          customerEmail={emailForReceipt}
          redirectPath={pathsConfig.app.personalAccountBilling}
        />
      </div>
    </PageBody>
  );
}

export default withI18n(SettingsBillingReturnPage);
