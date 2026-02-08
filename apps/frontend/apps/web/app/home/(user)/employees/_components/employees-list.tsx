'use client';

import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import { Trans } from '@kit/ui/trans';
import { If } from '@kit/ui/if';
import {
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@kit/ui/empty-state';

type Employee = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
};

interface EmployeesListProps {
  employees: Employee[];
  accountId: string;
}

export function EmployeesList({ employees, accountId }: EmployeesListProps) {
  return (
    <div className="space-y-4">
      <If condition={employees.length === 0}>
        <Card>
          <CardContent className="pt-6">
            <EmptyState>
              <EmptyStateHeading>
                <Trans i18nKey="account:noEmployees" defaults="No employees yet" />
              </EmptyStateHeading>
              <EmptyStateText>
                <Trans
                  i18nKey="account:noEmployeesDescription"
                  defaults="Invite employees to collaborate on this account"
                />
              </EmptyStateText>
            </EmptyState>
          </CardContent>
        </Card>
      </If>

      <If condition={employees.length > 0}>
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans i18nKey="account:employees" defaults="Employees" />
            </CardTitle>
            <CardDescription>
              <Trans
                i18nKey="account:employeesDescription"
                defaults="Manage employees and their permissions"
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-4">
                    <ProfileAvatar
                      displayName={
                        employee.displayName ?? employee.email ?? 'User'
                      }
                      pictureUrl={employee.avatarUrl}
                      className="h-10 w-10"
                    />
                    <div>
                      <div className="font-medium">
                        {employee.displayName ?? employee.email}
                      </div>
                      <div className="text-muted-foreground text-sm">
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
          </CardContent>
        </Card>
      </If>
    </div>
  );
}
