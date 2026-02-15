import { use } from 'react';

import { prisma } from '@kit/prisma';
import { ensureUserProvisioned } from '@kit/shared/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import { Users, UserPlus, Clock, Mail } from 'lucide-react';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';
import { InviteEmployeeForm } from '../../employees/_components/invite-employee-form';

export default function SettingsTeamPage() {
  const data = use(loadTeamData());

  return (
    <div className="space-y-6">
      {/* Team Header Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              Manage your team members and their access levels
            </CardDescription>
          </div>
          <InviteEmployeeForm accountId={data.personalAccountId} />
        </CardHeader>
        <CardContent>
          {/* Owner */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Owner
            </p>
            <div className="flex items-center justify-between rounded-lg border p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {data.owner.displayName?.charAt(0).toUpperCase() || 'O'}
                </div>
                <div>
                  <div className="text-sm font-medium">{data.owner.displayName || data.owner.email}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {data.owner.email}
                  </div>
                </div>
              </div>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-0">Owner</Badge>
            </div>
          </div>

          {/* Employees */}
          {data.employees.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Team ({data.employees.length})
              </p>
              <div className="space-y-2">
                {data.employees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <ProfileAvatar
                        displayName={employee.displayName ?? employee.email ?? 'User'}
                        pictureUrl={employee.avatarUrl}
                        className="h-10 w-10"
                      />
                      <div>
                        <div className="text-sm font-medium">
                          {employee.displayName ?? employee.email}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {employee.email}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {employee.role}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.employees.length === 0 && (
            <div className="mt-6 text-center py-8 rounded-lg border border-dashed">
              <UserPlus className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No team members yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Invite employees to collaborate on managing your AI receptionist
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {data.pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Invitations that haven't been accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{invitation.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Expires{' '}
                        {new Date(invitation.expiresAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {invitation.roleName}
                    </Badge>
                    <Badge variant="secondary" className="text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 border-0">
                      Pending
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadTeamData() {
  const user = await requireUserInServerComponent();

  const email = user.email && user.email.length > 0 ? user.email : `${user.id}@local`;

  let personalAccount = await prisma.account.findFirst({
    where: {
      primaryOwnerId: user.id,
      isPersonalAccount: true,
    },
    select: {
      id: true,
    },
  });

  if (!personalAccount) {
    const ensured = await ensureUserProvisioned({
      userId: user.id,
      email,
      displayName: user.email ?? user.id,
    });

    personalAccount = {
      id: ensured.account.id,
    };
  }

  const employees = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          accountId: personalAccount.id,
        },
      },
      NOT: {
        id: user.id,
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      createdAt: true,
      memberships: {
        where: {
          accountId: personalAccount.id,
        },
        select: {
          roleName: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const pendingInvitations = await prisma.invitation.findMany({
    where: {
      accountId: personalAccount.id,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      email: true,
      roleName: true,
      expiresAt: true,
      invitedBy: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    personalAccountId: personalAccount.id,
    owner: {
      id: user.id,
      email: user.email ?? '',
      displayName: user.name ?? user.email ?? 'Account Owner',
      avatarUrl: user.image ?? null,
    },
    employees: employees.map((emp) => ({
      id: emp.id,
      email: emp.email,
      displayName: emp.displayName,
      avatarUrl: emp.avatarUrl,
      role: emp.memberships[0]?.roleName ?? 'viewer',
      createdAt: emp.createdAt,
    })),
    pendingInvitations: pendingInvitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      roleName: inv.roleName,
      expiresAt: inv.expiresAt,
      invitedBy: inv.invitedBy,
    })),
  };
}
