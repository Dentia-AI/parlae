'use client';

import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import {
  Users,
  RefreshCw,
  Loader2,
  Search,
  ArrowUpCircle,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import Link from 'next/link';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import {
  AdminTablePagination,
  SelectAllBanner,
} from '~/admin/_components/admin-table-pagination';

type AccountOverview = {
  accountId: string;
  accountName: string | null;
  accountEmail: string | null;
  templateId: string | null;
  templateName: string | null;
  templateDisplayName: string | null;
  templateVersion: string | null;
  templateCategory: string | null;
  hasSquad: boolean;
  hasUpgradeHistory: boolean;
  upgradeCount: number;
  lastUpgradeDate: string | null;
  isOnLatestDefault: boolean;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type VersionGroup = {
  version: string;
  templateName: string;
  count: number;
};

type TemplateSummary = {
  id: string;
  name: string;
  displayName: string;
  version: string;
  category: string;
  isActive: boolean;
  isDefault: boolean;
  _count: { accounts: number };
};

type Stats = {
  totalAccounts: number;
  withTemplate: number;
  onLatestDefault: number;
  uniqueVersions: number;
};

export default function VersionOverviewPage() {
  const csrfToken = useCsrfToken();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [versionGroups, setVersionGroups] = useState<VersionGroup[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultTemplate, setDefaultTemplate] = useState<{ id: string; version: string; name: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rollbackPending, startRollbackTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [filterTemplateId, setFilterTemplateId] = useState('');
  const [filterVersion, setFilterVersion] = useState('');
  const [page, setPage] = useState(1);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [excludedAccounts, setExcludedAccounts] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '50');
    if (search) params.set('search', search);
    if (filterTemplateId) params.set('templateId', filterTemplateId);
    if (filterVersion) params.set('version', filterVersion);
    return params.toString();
  }, [page, search, filterTemplateId, filterVersion]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-templates/version-overview?${buildQueryParams()}`);
      const result = await res.json();
      if (result.success) {
        setAccounts(result.accounts || []);
        setPagination(result.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
        setVersionGroups(result.versionGroups || []);
        setTemplates(result.templates || []);
        setDefaultTemplate(result.defaultTemplate || null);
        setStats(result.stats || null);
      } else {
        toast.error(result.error || 'Failed to fetch version overview');
      }
    } catch {
      toast.error('Failed to fetch version overview');
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      clearSelection();
    }, 400);
  };

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
    clearSelection();
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (!selectAllMatching) setSelectedAccounts(new Set());
  };

  const toggleAccount = (id: string) => {
    if (selectAllMatching) {
      setExcludedAccounts((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setSelectedAccounts((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  const handleToggleAll = () => {
    if (selectAllMatching) {
      clearSelection();
      return;
    }
    const pageIds = accounts.map((a) => a.accountId);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedAccounts.has(id));
    if (allPageSelected) {
      setSelectAllMatching(true);
      setSelectedAccounts(new Set());
      setExcludedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(pageIds));
    }
  };

  const isAccountSelected = (id: string) =>
    selectAllMatching ? !excludedAccounts.has(id) : selectedAccounts.has(id);

  const effectiveSelectedCount = selectAllMatching
    ? pagination.total - excludedAccounts.size
    : selectedAccounts.size;

  const clearSelection = () => {
    setSelectedAccounts(new Set());
    setSelectAllMatching(false);
    setExcludedAccounts(new Set());
  };

  const handleRollback = (accountId: string, templateId: string | null) => {
    if (!confirm('Are you sure you want to rollback this clinic? This will re-create their Vapi squad.')) return;

    startRollbackTransition(async () => {
      try {
        const body: any = { accountIds: [accountId] };
        if (templateId) body.targetTemplateId = templateId;
        else body.useBuiltIn = true;

        const response = await fetch('/api/admin/agent-templates/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Rollback failed');

        const entry = result.results?.[0];
        if (entry?.status === 'rolled_back') {
          toast.success(`Rolled back ${entry.accountName || accountId} to ${entry.toVersion}`);
        } else {
          toast.error(entry?.reason || 'Rollback failed');
        }
        fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Rollback failed');
      }
    });
  };

  const handleBulkRollback = (templateId: string) => {
    if (effectiveSelectedCount === 0) {
      toast.error('Select at least one clinic to rollback');
      return;
    }
    if (!confirm(`Rollback ${effectiveSelectedCount} clinic(s)? This will re-create their Vapi squads.`)) return;

    startRollbackTransition(async () => {
      try {
        const body: any = { targetTemplateId: templateId };
        if (selectAllMatching) {
          body.deployAll = true;
          body.excludeAccountIds = [...excludedAccounts];
          body.filters = {
            search: search || undefined,
            templateId: filterTemplateId || undefined,
            version: filterVersion || undefined,
          };
        } else {
          body.accountIds = Array.from(selectedAccounts);
        }

        const response = await fetch('/api/admin/agent-templates/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Bulk rollback failed');

        toast.success(`Rolled back ${result.summary.rolledBack} clinic(s)`);
        clearSelection();
        fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Bulk rollback failed');
      }
    });
  };

  const uniqueVersions = [...new Set(templates.map((t) => t.version))].filter(Boolean);

  if (loading && accounts.length === 0) {
    return (
      <div className="container max-w-7xl py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/admin/agent-templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Templates
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Version Overview</h1>
          <p className="text-muted-foreground mt-2">See which template version each clinic is running</p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{stats.totalAccounts}</div>
              <p className="text-sm text-muted-foreground">Total Clinics</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-600">{stats.withTemplate}</div>
              <p className="text-sm text-muted-foreground">With Template</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.onLatestDefault}</div>
              <p className="text-sm text-muted-foreground">On Latest Default</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{stats.uniqueVersions}</div>
              <p className="text-sm text-muted-foreground">Unique Versions</p>
            </CardContent>
          </Card>
        </div>
      )}

      {versionGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Version Distribution</CardTitle>
            <CardDescription>Breakdown of clinics by template version</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {versionGroups.map((group) => (
                <div key={group.version} className="flex items-center gap-2 p-3 border rounded-lg">
                  <Badge variant="outline" className="font-mono">{group.version}</Badge>
                  <span className="text-sm text-muted-foreground">{group.templateName}</span>
                  <Badge variant="secondary">
                    <Users className="h-3 w-3 mr-1" />
                    {group.count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectAllMatching && (
        <SelectAllBanner
          totalMatching={pagination.total}
          excludeCount={excludedAccounts.size}
          onClear={clearSelection}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Clinics</CardTitle>
              <CardDescription>
                {pagination.total} clinic{pagination.total !== 1 ? 's' : ''} total
                {effectiveSelectedCount > 0 && ` · ${effectiveSelectedCount} selected`}
              </CardDescription>
            </div>
            {effectiveSelectedCount > 0 && templates.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {effectiveSelectedCount} selected{selectAllMatching && ' (all matching)'}
                </span>
                <select
                  className="border rounded-md p-1 text-sm"
                  onChange={(e) => {
                    if (e.target.value) handleBulkRollback(e.target.value);
                  }}
                  defaultValue=""
                  disabled={rollbackPending}
                >
                  <option value="" disabled>Rollback to...</option>
                  {templates.filter((t) => t.isActive).map((t) => (
                    <option key={t.id} value={t.id}>{t.displayName} ({t.version})</option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <select
              value={filterTemplateId}
              onChange={(e) => handleFilterChange(setFilterTemplateId, e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All Templates</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.displayName} ({t.version})</option>
              ))}
            </select>
            <select
              value={filterVersion}
              onChange={(e) => handleFilterChange(setFilterVersion, e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All Versions</option>
              {uniqueVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or version..."
                className="pl-10"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={
                      selectAllMatching ||
                      (accounts.length > 0 && accounts.every((a) => selectedAccounts.has(a.accountId)))
                    }
                    onChange={handleToggleAll}
                  />
                </TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Upgrades</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <TableRow key={account.accountId}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={isAccountSelected(account.accountId)}
                        onChange={() => toggleAccount(account.accountId)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{account.accountName || 'Unnamed'}</p>
                        <p className="text-xs text-muted-foreground">{account.accountEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">{account.templateName || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {account.templateVersion ? (
                        <Badge variant="outline" className="font-mono">{account.templateVersion}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.hasSquad ? (
                        account.isOnLatestDefault ? (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Latest
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />Outdated
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          <XCircle className="h-3 w-3 mr-1" />No Agent
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{account.upgradeCount}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {account.lastUpgradeDate
                          ? new Date(account.lastUpgradeDate).toLocaleDateString()
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {account.hasSquad && account.hasUpgradeHistory && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={rollbackPending}
                          onClick={() => handleRollback(account.accountId, null)}
                          title="Rollback to previous version"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Rollback
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {search ? 'No clinics match your search' : 'No clinics found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <AdminTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={handlePageChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
