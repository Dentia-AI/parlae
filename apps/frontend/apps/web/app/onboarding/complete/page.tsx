import { redirect } from 'next/navigation';
import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';
import { Button } from '@kit/ui/button';
import { withI18n } from '~/lib/i18n/with-i18n';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import Link from 'next/link';
import pathsConfig from '~/config/paths.config';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('common:onboardingComplete');

  return {
    title,
  };
};

async function OnboardingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id;

  if (!sessionId) {
    redirect(pathsConfig.app.home);
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="container mx-auto max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
            <svg
              className="h-12 w-12 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <header className="space-y-2">
          <Heading level={2}>
            <Trans
              i18nKey={'common:onboardingCompleteHeading'}
              defaults={'Payment Successful!'}
            />
          </Heading>
          <p className="text-muted-foreground">
            <Trans
              i18nKey={'common:onboardingCompleteSubheading'}
              defaults={
                'Your account has been set up and your payment has been processed successfully.'
              }
            />
          </p>
        </header>

        <div className="space-y-4">
          <Link href={pathsConfig.app.home}>
            <Button size="lg" className="w-full">
              <Trans
                i18nKey={'common:goToDashboard'}
                defaults={'Go to Dashboard'}
              />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default withI18n(OnboardingCompletePage);

