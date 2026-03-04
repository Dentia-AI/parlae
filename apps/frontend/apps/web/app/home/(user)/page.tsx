import { PageBody } from '@kit/ui/page';
import { prisma } from '@kit/prisma';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

// local imports
import { CallAnalyticsDashboard } from './analytics/_components/call-analytics-dashboard';
import { SetupRedirect } from './_components/setup-redirect';
import { loadUserWorkspace } from './_lib/server/load-user-workspace';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('account:homePage');

  return {
    title: title || 'Dashboard',
  };
};

async function UserHomePage() {
  // Redirect new users who haven't completed setup to the wizard.
  // Uses a client-side redirect (SetupRedirect) instead of server-side
  // redirect() to avoid React error #310 — see setup-redirect.tsx.
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
        (settings?.vapiSquadId || settings?.retellReceptionistAgentId || settings?.deployType === 'conversation_flow');

      if (!hasCompletedSetup) {
        return <SetupRedirect />;
      }
    }
  } catch {
    // For errors (DB not ready, etc.), just show the dashboard
  }

  return (
    <PageBody className="pt-4">
      <CallAnalyticsDashboard />
    </PageBody>
  );
}

export default withI18n(UserHomePage);
