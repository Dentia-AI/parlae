import { redirect } from 'next/navigation';

import { getSessionUser } from '@kit/shared/auth';
import { PageBody } from '@kit/ui/page';
import { PageHeader } from '@kit/ui/page-header';
import { Trans } from '@kit/ui/trans';

import { isAdmin } from '~/lib/auth/is-admin';

import { AccountsListContainer } from './_components/accounts-list-container';

export const metadata = {
  title: 'Admin - Accounts',
};

interface SearchParams {
  search?: string;
  page?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSessionUser();

  if (!session) {
    redirect('/auth/sign-in');
  }

  const hasAdminAccess = await isAdmin();

  if (!hasAdminAccess) {
    redirect('/404');
  }

  const params = await searchParams;

  return (
    <>
      <PageHeader
        title={<Trans i18nKey={'admin:accountsTitle'} defaults={'All Accounts'} />}
        description={
          <Trans
            i18nKey={'admin:accountsDescription'}
            defaults={'Search and manage all user accounts. Click impersonate to view the app as any user.'}
          />
        }
      />

      <PageBody>
        <AccountsListContainer
          initialSearch={params.search}
          initialPage={params.page ? parseInt(params.page, 10) : 1}
          initialSortBy={params.sortBy}
          initialSortOrder={params.sortOrder}
        />
      </PageBody>
    </>
  );
}

