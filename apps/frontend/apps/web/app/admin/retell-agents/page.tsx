import { redirect } from 'next/navigation';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { RetellAgentsList } from './_components/retell-agents-list';

export const metadata = {
  title: 'Retell Agents - Admin',
};

export default async function RetellAgentsPage() {
  const session = await getSessionUser();
  if (!session || !isAdminUser(session.id)) redirect('/');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Retell Agents</h1>
        <p className="text-muted-foreground">
          View and manage all Retell agents. Identify orphaned agents not linked to any account and delete them in bulk.
        </p>
      </div>
      <RetellAgentsList />
    </div>
  );
}
