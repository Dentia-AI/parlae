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
  const sessionUser = await requireUserInServerComponent();

  const [dbUser, account] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { displayName: true, avatarUrl: true },
    }),
    prisma.account.findFirst({
      where: {
        primaryOwnerId: sessionUser.id,
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
    }),
  ]);

  return (
    <ProfileSettingsClient
      user={{
        id: sessionUser.id,
        email: sessionUser.email ?? '',
        displayName: dbUser?.displayName ?? sessionUser.email ?? '',
        avatarUrl: dbUser?.avatarUrl ?? null,
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
