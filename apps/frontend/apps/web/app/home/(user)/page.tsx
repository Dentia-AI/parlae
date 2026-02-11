import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

// local imports
import { HomeLayoutPageHeader } from './_components/home-page-header';
import { CallAnalyticsDashboard } from './analytics/_components/call-analytics-dashboard';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('account:homePage');

  return {
    title: title || 'Dashboard',
  };
};

function UserHomePage() {
  return (
    <>
      <HomeLayoutPageHeader
        title={<Trans i18nKey={'common:routes.home'} defaults="Dashboard" />}
        description={<Trans i18nKey={'common:homeTabDescription'} defaults="Monitor your AI agent's performance and call metrics" />}
      />

      <PageBody>
        <CallAnalyticsDashboard />
      </PageBody>
    </>
  );
}

export default withI18n(UserHomePage);
