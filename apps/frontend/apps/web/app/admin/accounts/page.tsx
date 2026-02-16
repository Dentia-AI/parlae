import { redirect } from 'next/navigation';

import { getSessionUser } from '@kit/shared/auth';
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
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <Trans i18nKey={'admin:accountsTitle'} defaults={'All Accounts'} />
          </h1>
          <p className="text-muted-foreground mt-2">
            <Trans
              i18nKey={'admin:accountsDescription'}
              defaults={'Search and manage all user accounts. Click impersonate to view the app as any user.'}
            />
          </p>
        </div>
      </div>

      <AccountsListContainer
        initialSearch={params.search}
        initialPage={params.page ? parseInt(params.page, 10) : 1}
        initialSortBy={params.sortBy}
        initialSortOrder={params.sortOrder}
      />
    </div>
  );
}

