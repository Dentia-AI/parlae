'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';
import { Plus, Trash2, User, Search, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import type { AdminAccessItem } from '../_lib/server/admin-access-loader';
import { searchAdminUsersAction } from '../_lib/server/server-actions';
import {
  grantAdminAccessAction,
  revokeAdminAccessAction,
} from '~/admin/accounts/_lib/server/admin-actions';

interface AdminAccessManagerProps {
  accountId: string;
  initialAccesses: AdminAccessItem[];
}

export function AdminAccessManager({
  accountId,
  initialAccesses,
}: AdminAccessManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAdmin, setSelectedAdmin] = useState<{
    id: string;
    email: string;
    displayName: string | null;
  } | null>(null);
  const [notes, setNotes] = useState('');

  // Search for admin users
  const { data: adminUsers, isLoading: isSearching } = useQuery({
    queryKey: ['search-admins', searchQuery],
    queryFn: () => searchAdminUsersAction(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const handleGrantAccess = () => {
    if (!selectedAdmin) {
      toast.error('Please select an admin user');
      return;
    }

    startTransition(async () => {
      try {
        await grantAdminAccessAction({
          adminId: selectedAdmin.id,
          accountId,
          notes: notes || undefined,
        });

        toast.success('Admin access granted successfully');
        setIsDialogOpen(false);
        setSelectedAdmin(null);
        setSearchQuery('');
        setNotes('');
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to grant admin access',
        );
      }
    });
  };

  const handleRevokeAccess = (adminId: string) => {
    startTransition(async () => {
      try {
        await revokeAdminAccessAction({ adminId, accountId });

        toast.success('Admin access revoked successfully');
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to revoke admin access',
        );
      }
    });
  };

  const activeAccesses = initialAccesses.filter((access) => !access.isRevoked);
  const revokedAccesses = initialAccesses.filter((access) => access.isRevoked);

  return (
    <div className="space-y-6">
      {/* Warning Card */}
      <Card className="border-yellow-500/50 bg-yellow-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-500">
            <AlertCircle className="h-5 w-5" />
            <Trans i18nKey={'settings:adminAccessWarningTitle'} defaults={'Important'} />
          </CardTitle>
          <CardDescription>
            <Trans
              i18nKey={'settings:adminAccessWarning'}
              defaults={
                'Granting admin access allows the admin to impersonate your account and access all your data. Only grant access to trusted administrators. Access will be automatically revoked after the admin ends their impersonation session.'
              }
            />
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Active Accesses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                <Trans i18nKey={'settings:activeAdminAccess'} defaults={'Active Admin Access'} />
              </CardTitle>
              <CardDescription>
                <Trans
                  i18nKey={'settings:activeAdminAccessDescription'}
                  defaults={'Admins who currently have access to impersonate your account'}
                />
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  <Trans i18nKey={'settings:grantAccess'} defaults={'Grant Access'} />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    <Trans i18nKey={'settings:grantAdminAccess'} defaults={'Grant Admin Access'} />
                  </DialogTitle>
                  <DialogDescription>
                    <Trans
                      i18nKey={'settings:grantAdminAccessDescription'}
                      defaults={'Search for an admin user to grant access to your account'}
                    />
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Search Input */}
                  <div className="space-y-2">
                    <Label htmlFor="admin-search">
                      <Trans i18nKey={'settings:searchAdmin'} defaults={'Search Admin'} />
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="admin-search"
                        type="text"
                        placeholder="Search by email or name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Search Results */}
                  {searchQuery.length >= 2 && (
                    <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border p-2">
                      {isSearching ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Trans i18nKey={'common:searching'} defaults={'Searching...'} />
                        </div>
                      ) : adminUsers && adminUsers.length > 0 ? (
                        adminUsers.map((admin) => (
                          <button
                            key={admin.id}
                            type="button"
                            onClick={() => setSelectedAdmin(admin)}
                            className={`flex w-full items-center gap-3 rounded-md p-2 hover:bg-muted ${
                              selectedAdmin?.id === admin.id ? 'bg-muted' : ''
                            }`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={admin.avatarUrl ?? undefined} />
                              <AvatarFallback>
                                <User className="h-4 w-4" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-medium">
                                {admin.displayName || admin.email}
                              </div>
                              {admin.displayName && (
                                <div className="text-xs text-muted-foreground">{admin.email}</div>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Trans i18nKey={'settings:noAdminsFound'} defaults={'No admins found'} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Admin */}
                  {selectedAdmin && (
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <div className="mb-2 text-sm font-medium">
                        <Trans i18nKey={'settings:selectedAdmin'} defaults={'Selected Admin'} />
                      </div>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {selectedAdmin.displayName || selectedAdmin.email}
                          </div>
                          {selectedAdmin.displayName && (
                            <div className="text-xs text-muted-foreground">
                              {selectedAdmin.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">
                      <Trans i18nKey={'settings:notes'} defaults={'Notes (Optional)'} />
                    </Label>
                    <Input
                      id="notes"
                      type="text"
                      placeholder="Reason for granting access..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setSelectedAdmin(null);
                      setSearchQuery('');
                      setNotes('');
                    }}
                  >
                    <Trans i18nKey={'common:cancel'} defaults={'Cancel'} />
                  </Button>
                  <Button
                    onClick={handleGrantAccess}
                    disabled={!selectedAdmin || isPending}
                  >
                    <Trans i18nKey={'settings:grantAccess'} defaults={'Grant Access'} />
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {activeAccesses.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Trans i18nKey={'settings:admin'} defaults={'Admin'} />
                  </TableHead>
                  <TableHead>
                    <Trans i18nKey={'settings:grantedAt'} defaults={'Granted'} />
                  </TableHead>
                  <TableHead>
                    <Trans i18nKey={'settings:notes'} defaults={'Notes'} />
                  </TableHead>
                  <TableHead>
                    <Trans i18nKey={'common:actions'} defaults={'Actions'} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAccesses.map((access) => (
                  <TableRow key={access.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={access.admin.avatarUrl ?? undefined} />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {access.admin.displayName || access.admin.email}
                          </div>
                          {access.admin.displayName && (
                            <div className="text-xs text-muted-foreground">
                              {access.admin.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {new Date(access.grantedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {access.notes || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => handleRevokeAccess(access.admin.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <Trans i18nKey={'settings:revoke'} defaults={'Revoke'} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Trans
                i18nKey={'settings:noActiveAdminAccess'}
                defaults={'No active admin access granted'}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoked Accesses */}
      {revokedAccesses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans i18nKey={'settings:revokedAdminAccess'} defaults={'Revoked Admin Access'} />
            </CardTitle>
            <CardDescription>
              <Trans
                i18nKey={'settings:revokedAdminAccessDescription'}
                defaults={'Previously granted admin access that has been revoked'}
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Trans i18nKey={'settings:admin'} defaults={'Admin'} />
                  </TableHead>
                  <TableHead>
                    <Trans i18nKey={'settings:grantedAt'} defaults={'Granted'} />
                  </TableHead>
                  <TableHead>
                    <Trans i18nKey={'settings:revokedAt'} defaults={'Revoked'} />
                  </TableHead>
                  <TableHead>
                    <Trans i18nKey={'settings:status'} defaults={'Status'} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revokedAccesses.map((access) => (
                  <TableRow key={access.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={access.admin.avatarUrl ?? undefined} />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {access.admin.displayName || access.admin.email}
                          </div>
                          {access.admin.displayName && (
                            <div className="text-xs text-muted-foreground">
                              {access.admin.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {new Date(access.grantedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {access.revokedAt
                          ? new Date(access.revokedAt).toLocaleDateString()
                          : '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Trans i18nKey={'settings:revoked'} defaults={'Revoked'} />
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

