import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { CognitoSocialSignInButtons } from '~/components/auth/cognito-social-buttons';
import { SignInForm } from './_components/sign-in-form.client';

interface SignInPageProps {
  searchParams: Promise<{
    next?: string;
  }>;
}

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();

  return {
    title: i18n.t('auth:signIn'),
  };
};

async function SignInPage({ searchParams }: SignInPageProps) {
  const { next } = await searchParams;

  const paths = {
    callback: pathsConfig.app.home,
    returnPath: next || pathsConfig.app.home,
  };

  const allowPasswordSignIn =
    process.env.ENABLE_CREDENTIALS_SIGNIN !== 'false' || process.env.NODE_ENV === 'development';

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
          <Trans i18nKey={'auth:signInHeading'} defaults={'Welcome back'} />
        </Heading>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey={'auth:signInSubheading'}
            defaults={"Sign in to check what's new and manage your AI agents."}
          />
        </p>
      </header>

      <CognitoSocialSignInButtons providers={socialProviders} callbackUrl={paths.returnPath} mode="signin" />

      {allowPasswordSignIn ? <SignInForm callbackUrl={paths.returnPath} /> : null}

      <p className="text-center text-sm text-muted-foreground">
        <span className="mr-1">
          <Trans i18nKey={'auth:signInNoAccount'} defaults={'Need an account?'} />
        </span>
        <Link href={pathsConfig.auth.signUp} className="inline-flex items-center gap-1 font-medium text-primary">
          <Trans i18nKey={'auth:signInCreateAccount'} defaults={'Create one'} />
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}

export default withI18n(SignInPage);
