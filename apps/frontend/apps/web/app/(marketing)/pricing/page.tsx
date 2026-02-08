import { PricingTable } from '@kit/billing-gateway/marketing';

import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import billingConfig from '~/config/billing.config';
import pathsConfig from '~/config/paths.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { getAppUrl } from '~/lib/urls/app-host';

// Force dynamic rendering to ensure environment variables are read at runtime
export const dynamic = 'force-dynamic';

export const generateMetadata = async () => {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:pricing'),
  };
};

const paths = {
  signUp: getAppUrl(pathsConfig.auth.signUp),
  return: getAppUrl(pathsConfig.app.home),
};

async function PricingPage() {
  const { t } = await createI18nServerInstance();

  return (
    <div className={'flex flex-col space-y-8'}>
      <SitePageHeader
        title={t('marketing:pricing')}
        subtitle={t('marketing:pricingSubtitle')}
      />

      <div className={'container mx-auto pb-8 xl:pb-16'}>
        <PricingTable paths={paths} config={billingConfig} />
      </div>
    </div>
  );
}

export default withI18n(PricingPage);
