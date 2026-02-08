'use client';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Trans } from '@kit/ui/trans';
import { If } from '@kit/ui/if';
import { EmptyState } from '@kit/ui/empty-state';

type Invitation = {
  id: string;
  email: string;
  roleName: string;
  expiresAt: Date;
  invitedBy: string;
};

interface PendingInvitationsProps {
  invitations: Invitation[];
  onRevoke?: (invitationId: string) => void;
}

export function PendingInvitations({
  invitations,
  onRevoke,
}: PendingInvitationsProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  return (
    <div className="space-y-4">
      <If condition={invitations.length === 0}>
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              heading={
                <Trans
                  i18nKey="account:noPendingInvitations"
                  defaults="No pending invitations"
                />
              }
              subHeading={
                <Trans
                  i18nKey="account:noPendingInvitationsDescription"
                  defaults="All invitations have been accepted or expired"
                />
              }
            />
          </CardContent>
        </Card>
      </If>

      <If condition={invitations.length > 0}>
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans
                i18nKey="account:pendingInvitations"
                defaults="Pending Invitations"
              />
            </CardTitle>
            <CardDescription>
              <Trans
                i18nKey="account:pendingInvitationsDescription"
                defaults="Invitations that have been sent but not yet accepted"
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex flex-col gap-1">
                    <div className="font-medium">{invitation.email}</div>
                    <div className="text-muted-foreground text-sm">
                      Expires on {formatDate(invitation.expiresAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {invitation.roleName}
                    </Badge>
                    {onRevoke && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRevoke(invitation.id)}
                      >
                        <Trans i18nKey="common:revoke" defaults="Revoke" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </If>
    </div>
  );
}

