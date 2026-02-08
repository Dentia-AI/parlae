import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { CognitoSocialSignInButtons } from '~/components/auth/cognito-social-buttons';
import { SignUpForm } from './_components/sign-up-form.client';

interface SignUpPageProps {
  searchParams: Promise<{
    next?: string;
  }>;
}

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();

  return {
    title: i18n.t('auth:signUp'),
  };
};

async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { next } = await searchParams;

  const callbackUrl = next || pathsConfig.app.home;

  const socialProvidersEnv =
    process.env.NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS ?? process.env.COGNITO_SOCIAL_PROVIDERS ?? '';
  const socialProviders = socialProvidersEnv
    .split(',')
    .map((provider) => provider.trim())
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <Heading level={3} className="tracking-tight">
          <Trans i18nKey={'auth:signUpHeading'} defaults={'Join Dentia'} />
        </Heading>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey={'auth:signUpSubheading'}
            defaults={'Create your workspace to start uploading assets and managing billing.'}
          />
        </p>
      </header>

      <CognitoSocialSignInButtons providers={socialProviders} callbackUrl={callbackUrl} mode="signup" />

      <SignUpForm callbackUrl={callbackUrl} />

      <p className="text-center text-sm text-muted-foreground">
        <span className="mr-1">
          <Trans i18nKey={'auth:signUpExistingAccount'} defaults={'Already have an account?'} />
        </span>
        <Link href={pathsConfig.auth.signIn} className="inline-flex items-center gap-1 font-medium text-primary">
          <Trans i18nKey={'auth:signUpSignInInstead'} defaults={'Sign in instead'} />
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}

export default withI18n(SignUpPage);
