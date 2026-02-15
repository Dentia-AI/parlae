'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Mail, Calendar, Shield, User, Building2 } from 'lucide-react';

interface ProfileSettingsClientProps {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  account: {
    id: string;
    name: string;
    email: string | null;
    slug: string | null;
    pictureUrl: string | null;
    createdAt: string;
  } | null;
}

export function ProfileSettingsClient({ user, account }: ProfileSettingsClientProps) {
  const { t } = useTranslation();

  const memberSince = account?.createdAt
    ? new Date(account.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* User Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('common:settings.profile.title')}
          </CardTitle>
          <CardDescription>
            {t('common:settings.profile.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold flex-shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                user.displayName.charAt(0).toUpperCase()
              )}
            </div>

            {/* Info */}
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{user.displayName}</h3>
                <p className="text-sm text-muted-foreground">{t('common:settings.profile.accountOwner')}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('common:settings.profile.email')}:</span>
                  <span className="font-medium">{user.email}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('common:settings.profile.memberSince')}:</span>
                  <span className="font-medium">{memberSince}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('common:settings.profile.auth')}:</span>
                  <Badge variant="outline" className="text-xs">Cognito</Badge>
                </div>

                {account?.slug && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('common:settings.profile.slug')}:</span>
                    <span className="font-medium font-mono text-xs">{account.slug}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Details Card */}
      {account && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('common:settings.profile.accountDetails')}
            </CardTitle>
            <CardDescription>
              {t('common:settings.profile.accountDetailsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('common:settings.profile.accountName')}</p>
                <p className="text-sm font-medium">{account.name}</p>
              </div>
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('common:settings.profile.accountEmail')}</p>
                <p className="text-sm font-medium">{account.email || t('common:settings.profile.notSet')}</p>
              </div>
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('common:settings.profile.accountId')}</p>
                <p className="text-sm font-medium font-mono text-xs">{account.id}</p>
              </div>
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('common:settings.profile.created')}</p>
                <p className="text-sm font-medium">{memberSince}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('common:settings.profile.security')}
          </CardTitle>
          <CardDescription>
            {t('common:settings.profile.securityDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('common:settings.profile.passwordAndAuth')}</p>
              <p className="text-xs text-muted-foreground">
                {t('common:settings.profile.passwordAndAuthDescription')}
              </p>
            </div>
            <Badge variant="secondary">{t('common:settings.profile.managedByCognito')}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
