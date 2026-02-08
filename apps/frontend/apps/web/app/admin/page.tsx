import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';

import { impersonateUserAction, stopImpersonationAction } from './actions';
import { isAdminUser } from '~/lib/auth/admin';
import Link from 'next/link';
import { Phone, Users, Layers, FileStack, ArrowRight, UserCheck } from 'lucide-react';

type AdminUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
};

async function loadUsers(): Promise<AdminUser[]> {
  return prisma.user.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 5, // Show only recent 5 users on dashboard
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
    },
  });
}

async function getStats() {
  const [totalUsers, totalAccounts, totalTemplates, activeTemplates] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.agentTemplate.count(),
    prisma.agentTemplate.count({ where: { isActive: true } }),
  ]);

  return {
    totalUsers,
    totalAccounts,
    totalTemplates,
    activeTemplates,
  };
}

export default async function AdminPage() {
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

  const [users, stats] = await Promise.all([
    loadUsers(),
    getStats(),
  ]);
  
  const isImpersonating = Boolean(impersonatorId);

  return (
    <div className={'container space-y-8 py-10'}>
      <div className={'flex items-center justify-between'}>
        <div className={'space-y-1'}>
          <Heading level={2}>
            <Trans i18nKey={'admin:dashboardTitle'} defaults={'Admin Console'} />
          </Heading>

          <p className={'text-muted-foreground text-sm'}>
            <Trans
              i18nKey={'admin:dashboardSubtitle'}
              defaults={'Manage users, accounts, and AI agent configurations.'}
            />
          </p>
        </div>

        {isImpersonating ? (
          <form action={stopImpersonationAction}>
            <Button type="submit" variant="secondary">
              <Trans i18nKey={'admin:stopImpersonation'} defaults={'Return to admin'} />
            </Button>
          </form>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Users</CardDescription>
            <div className="text-3xl font-bold">{stats.totalUsers}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Accounts</CardDescription>
            <div className="text-3xl font-bold">{stats.totalAccounts}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Agent Templates</CardDescription>
            <div className="text-3xl font-bold">{stats.totalTemplates}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active Templates</CardDescription>
            <div className="text-3xl font-bold">{stats.activeTemplates}</div>
          </CardHeader>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/accounts">
          <Card className="cursor-pointer hover:border-primary transition-colors h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Accounts</CardTitle>
                  <CardDescription>Manage all accounts</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>View & manage accounts</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/agent-templates">
          <Card className="cursor-pointer hover:border-primary transition-colors h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Agent Templates</CardTitle>
                  <CardDescription>Version & manage AI configs</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Create & assign templates</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/setup-vapi">
          <Card className="cursor-pointer hover:border-primary transition-colors h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Setup Test Agent</CardTitle>
                  <CardDescription>Create a test AI agent</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Vapi + Twilio setup</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Users */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                <Trans i18nKey={'admin:recentUsers'} defaults={'Recent Users'} />
              </CardTitle>
              <CardDescription>Latest registered users</CardDescription>
            </div>
            <Link href="/admin/accounts">
              <Button variant="outline" size="sm">
                View All
              </Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className={'space-y-4'}>
          <div className={'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
            {users.map((user: AdminUser) => {
              const isCurrentSession = user.id === session.id;

              return (
                <div
                  key={user.id}
                  className={'flex items-center justify-between rounded-lg border p-4'}
                >
                  <div className={'space-y-1'}>
                    <p className={'text-sm font-medium'}>{user.displayName ?? user.email}</p>
                    <p className={'text-muted-foreground text-xs'}>{user.email}</p>
                  </div>

                  <form action={impersonateUserAction}>
                    <input type="hidden" name="userId" value={user.id} />

                    <Button type="submit" size="sm" disabled={isCurrentSession}>
                      <UserCheck className="h-4 w-4 mr-2" />
                      <Trans i18nKey={'admin:impersonate'} defaults={'Impersonate'} />
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
