import { use } from 'react';

import { PageBody, PageHeader } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { TestApiClient } from './_components/test-api-client';
import { TestApiServer } from './_components/test-api-server';

function TestApiPage() {
  const user = use(requireUserInServerComponent());

  return (
    <>
      <PageHeader
        title={<Trans i18nKey="common:testApi" defaults="API Connection Test" />}
        description={
          <Trans
            i18nKey="common:testApiDescription"
            defaults="Test frontend-backend-database connectivity"
          />
        }
      />

      <PageBody>
        <div className="space-y-8">
          {/* Server-side test */}
          <TestApiServer userId={user.id} userEmail={user.email ?? ''} />

          {/* Client-side test */}
          <TestApiClient />
        </div>
      </PageBody>
    </>
  );
}

export default withI18n(TestApiPage);

