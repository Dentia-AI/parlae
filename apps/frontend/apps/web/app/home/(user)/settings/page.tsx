import { prisma } from '@kit/prisma';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';
import { ProfileSettingsClient } from './_components/profile-settings-client';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();

  return {
    title: i18n.t('account:settingsTab'),
  };
};

async function PersonalAccountSettingsPage() {
  const user = await requireUserInServerComponent();

  // Fetch account info
  const account = await prisma.account.findFirst({
    where: {
      primaryOwnerId: user.id,
      isPersonalAccount: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      slug: true,
      pictureUrl: true,
      createdAt: true,
    },
  });

  return (
    <ProfileSettingsClient
      user={{
        id: user.id,
        email: user.email ?? '',
        displayName: user.name ?? user.email ?? '',
        avatarUrl: user.image ?? null,
      }}
      account={account ? {
        id: account.id,
        name: account.name,
        email: account.email,
        slug: account.slug,
        pictureUrl: account.pictureUrl,
        createdAt: account.createdAt.toISOString(),
      } : null}
    />
  );
}

export default withI18n(PersonalAccountSettingsPage);
