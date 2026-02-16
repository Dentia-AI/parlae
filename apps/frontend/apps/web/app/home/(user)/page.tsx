import { redirect } from 'next/navigation';

import { PageBody } from '@kit/ui/page';
import { prisma } from '@kit/prisma';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

// local imports
import { CallAnalyticsDashboard } from './analytics/_components/call-analytics-dashboard';
import { loadUserWorkspace } from './_lib/server/load-user-workspace';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('account:homePage');

  return {
    title: title || 'Dashboard',
  };
};

async function UserHomePage() {
  // Redirect new users who haven't completed setup to the wizard
  try {
    const workspace = await loadUserWorkspace();

    if (workspace?.workspace?.id) {
      const account = await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
        },
      });

      const settings = account?.phoneIntegrationSettings as any;
      const hasCompletedSetup =
        account?.phoneIntegrationMethod &&
        account.phoneIntegrationMethod !== 'none' &&
        settings?.vapiSquadId;

      if (!hasCompletedSetup) {
        redirect('/home/agent/setup');
      }
    }
  } catch (error: any) {
    // redirect() throws a NEXT_REDIRECT error — re-throw it
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    // For other errors (DB not ready, etc.), just show the dashboard
  }

  return (
    <PageBody className="pt-4">
      <CallAnalyticsDashboard />
    </PageBody>
  );
}

export default withI18n(UserHomePage);
