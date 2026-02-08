'use client';

import { signOut } from 'next-auth/react';

import { PersonalAccountDropdown } from '@kit/accounts/personal-account-dropdown';

import featuresFlagConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';
import type { JWTUserData } from '~/types/auth';

const paths = {
  home: pathsConfig.app.home,
};

const features = {
  enableThemeToggle: featuresFlagConfig.enableThemeToggle,
};

export function ProfileAccountDropdownContainer(props: {
  user?: JWTUserData | null;
  showProfileName?: boolean;
  account?: {
    id: string | null;
    name: string | null;
    picture_url: string | null;
  };
}) {
  if (!props.user) {
    return null;
  }

  const handleSignOut = () => signOut({ callbackUrl: paths.home });

  return (
    <PersonalAccountDropdown
      className={'w-full'}
      paths={paths}
      features={features}
      user={props.user}
      account={props.account}
      signOutRequested={handleSignOut}
      showProfileName={props.showProfileName}
    />
  );
}
