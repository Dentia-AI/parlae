import { redirect } from 'next/navigation';

import { getSessionUser } from '@kit/shared/auth';
import { PageBody } from '@kit/ui/page';
import { PageHeader } from '@kit/ui/page-header';
import { Trans } from '@kit/ui/trans';

import { getAdminAccessesForAccount } from './_lib/server/admin-access-loader';
import { AdminAccessManager } from './_components/admin-access-manager';

export const metadata = {
  title: 'Admin Access Settings',
};

interface PageParams {
  account: string;
}

export default async function AdminAccessSettingsPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const session = await getSessionUser();

  if (!session) {
    redirect('/auth/sign-in');
  }

  const { account: accountSlug } = await params;

  // Get account ID from slug
  // Note: You may need to adjust this based on your actual account lookup logic
  const accountId = accountSlug;

  const adminAccesses = await getAdminAccessesForAccount(accountId);

  return (
    <>
      <PageHeader
        title={
          <Trans
            i18nKey={'settings:adminAccessTitle'}
            defaults={'Admin Access Management'}
          />
        }
        description={
          <Trans
            i18nKey={'settings:adminAccessDescription'}
            defaults={
              'Grant or revoke admin access to your account. Admins can impersonate your account to help troubleshoot issues.'
            }
          />
        }
      />

      <PageBody>
        <AdminAccessManager
          accountId={accountId}
          initialAccesses={adminAccesses}
        />
      </PageBody>
    </>
  );
}

