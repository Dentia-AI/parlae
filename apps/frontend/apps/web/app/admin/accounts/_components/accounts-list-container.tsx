'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Input } from '@kit/ui/input';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import { Avatar, AvatarFallback, AvatarImage } from '@kit/ui/avatar';
import { Badge } from '@kit/ui/badge';
import { Skeleton } from '@kit/ui/skeleton';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Users, Layers, CheckSquare, Square } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Checkbox } from '@kit/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

import { startImpersonationAction } from '../_lib/server/admin-actions';

interface AccountsListContainerProps {
  initialSearch?: string;
  initialPage?: number;
  initialSortBy?: 'name' | 'createdAt' | 'updatedAt';
  initialSortOrder?: 'asc' | 'desc';
}

// API function to fetch accounts
async function fetchAccounts(params: {
  search: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
}) {
  const searchParams = new URLSearchParams({
    search: params.search,
    page: params.page.toString(),
    limit: params.limit.toString(),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });

  const response = await fetch(`/api/admin/accounts/search?${searchParams.toString()}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch accounts');
  }

  return response.json();
}

// API function to fetch templates
async function fetchTemplates() {
  const response = await fetch('/api/admin/agent-templates/list');
  
  if (!response.ok) {
    throw new Error('Failed to fetch templates');
  }

  return response.json();
}

// API function to assign template
async function assignTemplate(accountId: string, templateId: string, csrfToken: string) {
  const response = await fetch('/api/admin/agent-templates/assign-single', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    credentials: 'include',
    body: JSON.stringify({ accountId, templateId }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign template');
  }

  return response.json();
}

export function AccountsListContainer({
  initialSearch = '',
  initialPage = 1,
  initialSortBy = 'createdAt',
  initialSortOrder = 'desc',
}: AccountsListContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [assigningAccount, setAssigningAccount] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState<string>('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const csrfToken = useCsrfToken();

  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [sortBy] = useState<'name' | 'createdAt' | 'updatedAt'>(initialSortBy);
  const [sortOrder] = useState<'asc' | 'desc'>(initialSortOrder);

  // Fetch accounts with React Query
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-accounts', search, page, sortBy, sortOrder],
    queryFn: () => fetchAccounts({ search, page, limit: 20, sortBy, sortOrder }),
  });

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: fetchTemplates,
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);

    // Update URL params
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('search', value);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.push(`/admin/accounts?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);

    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    router.push(`/admin/accounts?${params.toString()}`);
  };

  const handleImpersonate = async (userId: string, accountId?: string) => {
    startTransition(async () => {
      try {
        await startImpersonationAction(userId, accountId);
        
        toast.success('Impersonation started successfully');
        
        // Redirect to home page as the impersonated user
        router.push('/home');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to start impersonation');
      }
    });
  };

  const handleTemplateChange = async (accountId: string, templateId: string) => {
    if (!templateId || templateId === 'none') return;
    
    setAssigningAccount(accountId);
    try {
      await assignTemplate(accountId, templateId, csrfToken);
      toast.success('Template assigned successfully');
      refetch(); // Refresh the accounts list
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign template');
    } finally {
      setAssigningAccount(null);
    }
  };

  const handleSelectAll = () => {
    if (!data?.accounts) return;
    
    if (selectedAccounts.size === data.accounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(data.accounts.map(acc => acc.id)));
    }
  };

  const handleSelectAccount = (accountId: string) => {
    const newSelected = new Set(selectedAccounts);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedAccounts(newSelected);
  };

  const handleBulkAssign = async () => {
    if (!bulkTemplateId || selectedAccounts.size === 0) return;

    setIsBulkAssigning(true);
    const accountIds = Array.from(selectedAccounts);
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const accountId of accountIds) {
        try {
          await assignTemplate(accountId, bulkTemplateId, csrfToken);
          successCount++;
        } catch (error) {
          console.error(`Failed to assign template to ${accountId}:`, error);
          failureCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Template assigned to ${successCount} account(s)`);
      }
      if (failureCount > 0) {
        toast.error(`Failed to assign to ${failureCount} account(s)`);
      }

      setSelectedAccounts(new Set());
      setShowBulkDialog(false);
      setBulkTemplateId('');
      refetch();
    } catch (error) {
      toast.error('Bulk assignment failed');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const templates = templatesData?.templates || [];
  const allSelected = data?.accounts && selectedAccounts.size === data.accounts.length && data.accounts.length > 0;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          <Trans i18nKey={'common:error'} defaults={'Error loading accounts'} />: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Clinics</CardTitle>
              <CardDescription>
                {data
                  ? `Showing ${data.accounts.length} of ${data.total} accounts`
                  : 'Loading accounts...'}
              </CardDescription>
            </div>
            {selectedAccounts.size > 0 && (
              <Button
                variant="default"
                onClick={() => setShowBulkDialog(true)}
              >
                <Layers className="h-4 w-4 mr-2" />
                Assign Template ({selectedAccounts.size})
              </Button>
            )}
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by account name, email, or owner..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Primary Owner</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Agent Template</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-12 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : data && data.accounts.length > 0 ? (
              data.accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedAccounts.has(account.id)}
                      onCheckedChange={() => handleSelectAccount(account.id)}
                      aria-label={`Select ${account.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {account.pictureUrl ? (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={account.pictureUrl} alt={account.name} />
                          <AvatarFallback>{account.name[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <Users className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{account.name}</div>
                        {account.email && (
                          <div className="text-xs text-muted-foreground">{account.email}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={account.primaryOwner.avatarUrl ?? undefined} />
                        <AvatarFallback>
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm">
                          {account.primaryOwner.displayName || account.primaryOwner.email}
                        </div>
                        {account.primaryOwner.displayName && (
                          <div className="text-xs text-muted-foreground">
                            {account.primaryOwner.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{account.memberCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={account.agentTemplate?.id || 'none'}
                        onValueChange={(value) => handleTemplateChange(account.id, value)}
                        disabled={assigningAccount === account.id}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="No template">
                            {assigningAccount === account.id ? (
                              <span className="text-muted-foreground">Assigning...</span>
                            ) : account.agentTemplate ? (
                              <div className="flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                <span className="text-xs">{account.agentTemplate.displayName}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No template</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No template</SelectItem>
                          {templates.map((template: any) => (
                            <SelectItem key={template.id} value={template.id}>
                              <div className="flex items-center gap-2">
                                {template.isDefault && (
                                  <Badge variant="outline" className="text-xs px-1 py-0">
                                    Default
                                  </Badge>
                                )}
                                <span>{template.displayName}</span>
                                <span className="text-muted-foreground text-xs">
                                  v{template.version}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={account.isPersonalAccount ? 'secondary' : 'default'}>
                      {account.isPersonalAccount ? (
                        <Trans i18nKey={'admin:personal'} defaults={'Personal'} />
                      ) : (
                        <Trans i18nKey={'admin:team'} defaults={'Team'} />
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleImpersonate(account.primaryOwner.id, account.id)}
                    >
                      <Trans i18nKey={'admin:impersonate'} defaults={'Impersonate'} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  <Trans i18nKey={'admin:noAccountsFound'} defaults={'No accounts found'} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>

      {/* Bulk Assignment Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Assign Template</DialogTitle>
            <DialogDescription>
              Assign a template to {selectedAccounts.size} selected account(s). User-specific settings (voice, knowledge base, phone) will be preserved.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Template</label>
              <Select value={bulkTemplateId} onValueChange={setBulkTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        {template.isDefault && (
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            Default
                          </Badge>
                        )}
                        <span>{template.displayName}</span>
                        <span className="text-muted-foreground text-xs">
                          v{template.version}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAccounts.size > 0 && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="text-sm font-medium mb-1">Selected Accounts:</div>
                <div className="text-xs text-muted-foreground">
                  {Array.from(selectedAccounts).slice(0, 5).map(id => {
                    const account = data?.accounts.find(acc => acc.id === id);
                    return account?.name;
                  }).filter(Boolean).join(', ')}
                  {selectedAccounts.size > 5 && ` +${selectedAccounts.size - 5} more`}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkDialog(false);
                setBulkTemplateId('');
              }}
              disabled={isBulkAssigning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssign}
              disabled={!bulkTemplateId || isBulkAssigning}
            >
              {isBulkAssigning ? 'Assigning...' : `Assign to ${selectedAccounts.size} Account(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page === 1 || isPending}
              onClick={() => handlePageChange(data.page - 1)}
            >
              <Trans i18nKey={'common:previous'} defaults={'Previous'} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page === data.totalPages || isPending}
              onClick={() => handlePageChange(data.page + 1)}
            >
              <Trans i18nKey={'common:next'} defaults={'Next'} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

