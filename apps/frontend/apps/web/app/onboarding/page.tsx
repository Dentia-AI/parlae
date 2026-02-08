import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';
import { PageBody } from '@kit/ui/page';
import { withI18n } from '~/lib/i18n/with-i18n';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { OnboardingFlow } from './_components/onboarding-flow';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('common:onboardingTitle');

  return {
    title,
  };
};

async function OnboardingPage() {
  const { data: user } = await requireUserInServerComponent();

  return (
    <>
      <div className="flex flex-col space-y-4 py-8">
        <div className="container mx-auto max-w-2xl">
          <header className="space-y-4 text-center">
            <Heading level={2}>
              <Trans
                i18nKey={'common:onboardingHeading'}
                defaults={'Welcome to Dentia!'}
              />
            </Heading>
            <p className="text-muted-foreground">
              <Trans
                i18nKey={'common:onboardingSubheading'}
                defaults={
                  "Let's set up your payment information to get started"
                }
              />
            </p>
          </header>

          <PageBody>
            <OnboardingFlow user={user} />
          </PageBody>
        </div>
      </div>
    </>
  );
}

export default withI18n(OnboardingPage);

