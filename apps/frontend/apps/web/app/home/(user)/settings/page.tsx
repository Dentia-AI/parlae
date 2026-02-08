import { Heading } from '@kit/ui/heading';
import { PageBody } from '@kit/ui/page';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();

  return {
    title: i18n.t('account:settingsTab'),
  };
};

async function PersonalAccountSettingsPage() {
  const user = await requireUserInServerComponent();

  return (
    <PageBody>
      <div className={'flex w-full flex-1 flex-col gap-6 lg:max-w-2xl'}>
        <header className={'space-y-1'}>
          <Heading level={3}>Account</Heading>
          <p className={'text-muted-foreground'}>
            Manage your personal details. Updates to authentication settings are
            handled through Cognito.
          </p>
        </header>

        <section className={'space-y-2 rounded-xl border bg-card p-6'}>
          <div className={'flex flex-col gap-1'}>
            <span className={'text-sm text-muted-foreground'}>Email</span>
            <span className={'text-base font-medium'}>{user.email}</span>
          </div>
        </section>
      </div>
    </PageBody>
  );
}

export default withI18n(PersonalAccountSettingsPage);
