'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import {
  Mail,
  Calendar,
  Shield,
  User,
  Building2,
  Pencil,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';

import {
  updateDisplayNameAction,
  updateAccountNameAction,
  changePasswordAction,
} from '../_lib/profile-actions';

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

export function ProfileSettingsClient({
  user,
  account,
}: ProfileSettingsClientProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(user.displayName);

  // Account name editing state
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editAccountName, setEditAccountName] = useState(account?.name ?? '');

  // Password change state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const memberSince = account?.createdAt
    ? new Date(account.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  const handleSaveName = () => {
    const trimmed = editName.trim();

    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }

    startTransition(async () => {
      const result = await updateDisplayNameAction({ displayName: trimmed });

      if (result.success) {
        toast.success('Name updated successfully');
        setIsEditingName(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update name');
      }
    });
  };

  const handleCancelName = () => {
    setEditName(user.displayName);
    setIsEditingName(false);
  };

  const handleSaveAccountName = () => {
    const trimmed = editAccountName.trim();

    if (!trimmed || !account) {
      toast.error('Name cannot be empty');
      return;
    }

    startTransition(async () => {
      const result = await updateAccountNameAction({
        accountId: account.id,
        name: trimmed,
      });

      if (result.success) {
        toast.success('Account name updated');
        setIsEditingAccountName(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update account name');
      }
    });
  };

  const handleCancelAccountName = () => {
    setEditAccountName(account?.name ?? '');
    setIsEditingAccountName(false);
  };

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }

    if (!newPassword) {
      toast.error('Please enter a new password');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword,
        newPassword,
      });

      if (result.success) {
        toast.success('Password changed successfully');
        setIsChangingPassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(result.error || 'Failed to change password');
      }
    });
  };

  const handleCancelPassword = () => {
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* User Profile */}
      <section className="rounded-xl bg-card shadow-sm ring-1 ring-border/40 overflow-hidden">
        <div className="px-6 py-5 border-b border-border/30">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">
              {t('common:settings.profile.title')}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('common:settings.profile.description')}
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                user.displayName.charAt(0).toUpperCase()
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Email (read-only, shown prominently) */}
              <div>
                <h3 className="text-base font-semibold truncate">
                  {user.email}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('common:settings.profile.accountOwner')}
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {/* Editable Display Name */}
                <div className="flex items-center gap-2 text-xs">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    {t('common:settings.profile.displayName')}:
                  </span>
                  {isEditingName ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 text-xs font-medium px-1.5 max-w-[160px]"
                        autoFocus
                        disabled={pending}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') handleCancelName();
                        }}
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={pending}
                        className="text-green-600 hover:text-green-700"
                      >
                        {pending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={handleCancelName}
                        disabled={pending}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium truncate">{user.displayName}</span>
                      <button
                        onClick={() => setIsEditingName(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit display name"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    {t('common:settings.profile.memberSince')}:
                  </span>
                  <span className="font-medium">{memberSince}</span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    {t('common:settings.profile.auth')}:
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 border-border/50"
                  >
                    Cognito
                  </Badge>
                </div>

                {account?.slug && (
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      {t('common:settings.profile.slug')}:
                    </span>
                    <span className="font-medium font-mono text-[11px]">
                      {account.slug}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Account Details */}
      {account && (
        <section className="rounded-xl bg-card shadow-sm ring-1 ring-border/40 overflow-hidden">
          <div className="px-6 py-5 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                {t('common:settings.profile.accountDetails')}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('common:settings.profile.accountDetailsDescription')}
            </p>
          </div>
          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Editable Account Name */}
              <div className="rounded-lg bg-muted/30 px-4 py-3 space-y-0.5 relative">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {t('common:settings.profile.accountName')}
                </p>
                {isEditingAccountName ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      value={editAccountName}
                      onChange={(e) => setEditAccountName(e.target.value)}
                      className="h-7 text-sm font-medium px-2"
                      autoFocus
                      disabled={pending}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveAccountName();
                        if (e.key === 'Escape') handleCancelAccountName();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                      onClick={handleSaveAccountName}
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={handleCancelAccountName}
                      disabled={pending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{account.name}</p>
                    <button
                      onClick={() => setIsEditingAccountName(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              <InfoField
                label={t('common:settings.profile.accountEmail')}
                value={account.email || t('common:settings.profile.notSet')}
              />
              <InfoField
                label={t('common:settings.profile.created')}
                value={memberSince}
              />
              {account.slug && (
                <InfoField
                  label={t('common:settings.profile.slug')}
                  value={account.slug}
                  mono
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Security / Password */}
      <section className="rounded-xl bg-card shadow-sm ring-1 ring-border/40 overflow-hidden">
        <div className="px-6 py-5 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">
              {t('common:settings.profile.security')}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('common:settings.profile.securityDescription')}
          </p>
        </div>
        <div className="p-6">
          {isChangingPassword ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-sm">
                  Current Password
                </Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    disabled={pending}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    disabled={pending}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Minimum 8 characters with uppercase, lowercase, and a number
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={pending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleChangePassword();
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleChangePassword}
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelPassword}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t('common:settings.profile.passwordAndAuth')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('common:settings.profile.passwordAndAuthDescription')}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChangingPassword(true)}
              >
                Change Password
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-4 py-3 space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  );
}
