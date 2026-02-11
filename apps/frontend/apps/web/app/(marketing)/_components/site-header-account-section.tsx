'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { signOut as nextAuthSignOut } from 'next-auth/react';

import { PersonalAccountDropdown } from '@kit/accounts/personal-account-dropdown';
import { Button } from '@kit/ui/button';
import { If } from '@kit/ui/if';
import { Trans } from '@kit/ui/trans';
import { LanguageSelector } from '@kit/ui/language-selector';

import featuresFlagConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';
import type { JWTUserData } from '~/types/auth';
import { getAppUrl } from '~/lib/urls/app-host';

const ModeToggle = dynamic(
  () =>
    import('@kit/ui/mode-toggle').then((mod) => ({
      default: mod.ModeToggle,
    })),
  { 
    ssr: false,
    loading: () => <div className="w-9 h-9" />
  },
);

const MobileModeToggle = dynamic(
  () =>
    import('@kit/ui/mobile-mode-toggle').then((mod) => ({
      default: mod.MobileModeToggle,
    })),
  { 
    ssr: false,
    loading: () => <div className="w-9 h-9" />
  },
);

const paths = {
  home: pathsConfig.app.home,
};

const features = {
  enableThemeToggle: featuresFlagConfig.enableThemeToggle,
};

export function SiteHeaderAccountSection({
  user,
}: {
  user: JWTUserData | null;
}) {
  if (user) {
    return (
      <div className="flex items-center gap-x-2">
        <LanguageSelector />
        <PersonalAccountDropdown
          showProfileName={false}
          paths={paths}
          features={features}
          user={user}
          signOutRequested={() =>
            nextAuthSignOut({
              callbackUrl: getAppUrl(pathsConfig.auth.signIn),
            })
          }
        />
      </div>
    );
  }

  return <AuthButtons />;
}

function AuthButtons() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Prevent hydration mismatch by not rendering until client-side
  if (!isClient) {
    return (
      <div className={'animate-in fade-in flex items-center gap-x-2 duration-500'}>
        {/* Placeholder to maintain layout */}
        <div className="hidden md:flex w-20 h-9" />
        <div className="w-16 h-9" />
      </div>
    );
  }

  return (
    <div
      className={'animate-in fade-in flex items-center gap-x-2 duration-500'}
    >
      <LanguageSelector />
      
      {features.enableThemeToggle && (
        <>
          <div className={'hidden md:flex'}>
            <ModeToggle />
          </div>

          <div className={'md:hidden'}>
            <MobileModeToggle />
          </div>
        </>
      )}

      <div className={'flex items-center gap-x-2'}>
        <Button
          className={'hidden md:flex md:text-sm'}
          asChild
          variant={'outline'}
          size={'sm'}
        >
          <Link href={getAppUrl(pathsConfig.auth.signIn)} prefetch={false}>
            <Trans i18nKey={'auth:signIn'} />
          </Link>
        </Button>

        <Button
          asChild
          className="text-xs md:text-sm"
          variant={'default'}
          size={'sm'}
        >
          <Link href={getAppUrl(pathsConfig.auth.signUp)} prefetch={false}>
            <Trans i18nKey={'auth:signUp'} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
