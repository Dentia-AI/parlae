import { PageBody } from '@kit/ui/page';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

// local imports
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
    <PageBody className="pt-4">
      <CallAnalyticsDashboard />
    </PageBody>
  );
}

export default withI18n(UserHomePage);
