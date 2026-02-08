import { use } from 'react';

import { prisma } from '@kit/prisma';
import { ensureUserProvisioned } from '@kit/shared/auth';

import { PageHeader } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

import { InviteEmployeeForm } from './_components/invite-employee-form';
import { EmployeesList } from './_components/employees-list';
import { PendingInvitations } from './_components/pending-invitations';

export default function EmployeesPage() {
  const data = use(loadEmployeesData());

  return (
    <div className="container mx-auto space-y-6 py-8">
      <PageHeader
        title={<Trans i18nKey="account:employees" defaults="Employees" />}
        description={
          <Trans
            i18nKey="account:employeesPageDescription"
            defaults="Manage employees and their access to your accounts"
          />
        }
      >
        <InviteEmployeeForm accountId={data.personalAccountId} />
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2">
        <EmployeesList
          employees={data.employees}
          accountId={data.personalAccountId}
        />
        <PendingInvitations invitations={data.pendingInvitations} />
      </div>
    </div>
  );
}

async function loadEmployeesData() {
  const user = await requireUserInServerComponent();

  const email = user.email && user.email.length > 0 ? user.email : `${user.id}@local`;

  // Get user's personal account
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

  // Get all employees (users with memberships on this account, excluding the owner)
  const employees = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          accountId: personalAccount.id,
        },
      },
      NOT: {
        id: user.id, // Exclude the current user
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

  // Get pending invitations
  const pendingInvitations = await prisma.invitation.findMany({
    where: {
      accountId: personalAccount.id,
      expiresAt: {
        gt: new Date(), // Only non-expired invitations
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
