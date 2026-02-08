import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@kit/shared/auth';

import { isAdminUser } from '~/lib/auth/admin';
import { AdminSidebar } from './_components/admin-sidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();

  if (!session) {
    redirect('/auth/sign-in');
  }

  const cookieStore = await cookies();
  const impersonatorId = cookieStore.get('impersonator-id')?.value ?? null;
  const effectiveAdminId = impersonatorId ?? session.id;

  if (!isAdminUser(effectiveAdminId)) {
    redirect('/404');
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
