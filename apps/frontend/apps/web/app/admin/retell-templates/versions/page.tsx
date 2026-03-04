'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Layers,
  Users,
  Rocket,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';
import {
  AdminTablePagination,
  SelectAllBanner,
} from '~/app/admin/_components/admin-table-pagination';

interface AccountOverview {
  accountId: string;
  accountName: string | null;
  accountEmail: string | null;
  templateId: string | null;
  templateName: string | null;
  templateDisplayName: string | null;
  templateVersion: string | null;
  hasRetellAgents: boolean;
  retellAgentCount: number;
  isOnLatestDefault: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VersionGroup {
  version: string;
  templateName: string;
  count: number;
}

interface TemplateSummary {
  id: string;
  name: string;
  displayName: string;
  version: string;
  isActive: boolean;
  isDefault: boolean;
  _count: { accounts: number };
}

interface Stats {
  totalAccounts: number;
  withTemplate: number;
  onLatestDefault: number;
  uniqueVersions: number;
}

export default function RetellVersionOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [versionGroups, setVersionGroups] = useState<VersionGroup[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultTemplate, setDefaultTemplate] = useState<{ id: string; version: string; name: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterTemplateId, setFilterTemplateId] = useState('');
  const [filterVersion, setFilterVersion] = useState('');
  const [page, setPage] = useState(1);

  // Bulk deploy
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [excludedAccounts, setExcludedAccounts] = useState<Set<string>>(new Set());
  const [deployTemplateId, setDeployTemplateId] = useState('');
  const [deploying, setDeploying] = useState(false);

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
      const res = await fetch(`/api/admin/retell-templates/version-overview?${buildQueryParams()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      setAccounts(data.accounts || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      setVersionGroups(data.versionGroups || []);
      setTemplates(data.templates || []);
      setDefaultTemplate(data.defaultTemplate || null);
      setStats(data.stats || null);
    } catch {
      toast.error('Failed to load version overview');
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
      setSelectedAccounts(new Set());
      setSelectAllMatching(false);
      setExcludedAccounts(new Set());
    }, 400);
  };

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setSelectedAccounts(new Set());
    setSelectAllMatching(false);
    setExcludedAccounts(new Set());
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (!selectAllMatching) {
      setSelectedAccounts(new Set());
    }
  };

  const toggleAccount = (id: string) => {
    if (selectAllMatching) {
      setExcludedAccounts((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedAccounts((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const handleToggleAll = () => {
    if (selectAllMatching) {
      setSelectAllMatching(false);
      setExcludedAccounts(new Set());
      setSelectedAccounts(new Set());
      return;
    }

    const pageIds = accounts.map((a) => a.accountId);
    const allPageSelected = pageIds.every((id) => selectedAccounts.has(id));

    if (allPageSelected) {
      setSelectAllMatching(true);
      setSelectedAccounts(new Set());
      setExcludedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(pageIds));
    }
  };

  const isAccountSelected = (id: string) => {
    if (selectAllMatching) return !excludedAccounts.has(id);
    return selectedAccounts.has(id);
  };

  const effectiveSelectedCount = selectAllMatching
    ? pagination.total - excludedAccounts.size
    : selectedAccounts.size;

  const handleBulkDeploy = async () => {
    if (!deployTemplateId || effectiveSelectedCount === 0) return;

    setDeploying(true);
    try {
      const body: any = { templateId: deployTemplateId };

      if (selectAllMatching) {
        body.deployAll = true;
        body.excludeAccountIds = [...excludedAccounts];
        body.filters = {
          search: search || undefined,
          templateId: filterTemplateId || undefined,
          version: filterVersion || undefined,
        };
      } else {
        body.accountIds = [...selectedAccounts];
      }

      const res = await fetch('/api/admin/retell-templates/bulk-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Deploy failed' }));
        throw new Error(err.error);
      }

      const data = await res.json();
      const successes = data.deployResults?.filter((r: any) => r.success).length;
      const failures = data.deployResults?.filter((r: any) => !r.success).length;

      toast.success(
        `Deployed to ${successes} account(s)${failures > 0 ? `, ${failures} failed` : ''}`,
      );
      setSelectedAccounts(new Set());
      setSelectAllMatching(false);
      setExcludedAccounts(new Set());
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk deploy failed');
    } finally {
      setDeploying(false);
    }
  };

  const clearSelection = () => {
    setSelectedAccounts(new Set());
    setSelectAllMatching(false);
    setExcludedAccounts(new Set());
  };

  const uniqueVersions = [...new Set(templates.map((t) => t.version))].filter(Boolean);

  if (loading && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Layers className="h-8 w-8" />
            Retell Version Overview
          </h1>
          <p className="text-muted-foreground mt-2">
            Track which Retell template version each account is running
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.totalAccounts}</div>
              <div className="text-xs text-muted-foreground">Total Accounts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.withTemplate}</div>
              <div className="text-xs text-muted-foreground">Assigned Template</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.onLatestDefault}</div>
              <div className="text-xs text-muted-foreground">On Latest Default</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.uniqueVersions}</div>
              <div className="text-xs text-muted-foreground">Unique Versions</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Version Groups */}
      {versionGroups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {versionGroups.map((g) => (
            <Card key={g.version}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="secondary" className="text-sm">{g.version}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{g.templateName}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {g.count}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Select All Banner */}
      {selectAllMatching && (
        <SelectAllBanner
          totalMatching={pagination.total}
          excludeCount={excludedAccounts.size}
          onClear={clearSelection}
        />
      )}

      {/* Bulk deploy bar */}
      {effectiveSelectedCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-4">
            <span className="text-sm font-medium">
              {effectiveSelectedCount} account{effectiveSelectedCount !== 1 ? 's' : ''} selected
              {selectAllMatching && ' (all matching)'}
            </span>
            <select
              value={deployTemplateId}
              onChange={(e) => setDeployTemplateId(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Deploy template...</option>
              {templates
                .filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName} ({t.version})
                  </option>
                ))}
            </select>
            <Button
              size="sm"
              onClick={handleBulkDeploy}
              disabled={!deployTemplateId || deploying}
            >
              {deploying ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-1" />
              )}
              Deploy
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Account Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Accounts</CardTitle>
              <CardDescription>
                {pagination.total} account{pagination.total !== 1 ? 's' : ''} total
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterTemplateId}
                onChange={(e) => handleFilterChange(setFilterTemplateId, e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">All Templates</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName} ({t.version})
                  </option>
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
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2 font-medium w-8">
                    <input
                      type="checkbox"
                      checked={
                        selectAllMatching ||
                        (accounts.length > 0 && accounts.every((a) => selectedAccounts.has(a.accountId)))
                      }
                      onChange={handleToggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Account</th>
                  <th className="text-left px-4 py-2 font-medium">Template</th>
                  <th className="text-left px-4 py-2 font-medium">Version</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Agents</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No accounts found
                    </td>
                  </tr>
                ) : (
                  accounts.map((a) => (
                    <tr key={a.accountId} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={isAccountSelected(a.accountId)}
                          onChange={() => toggleAccount(a.accountId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{a.accountName || 'Unnamed'}</div>
                        <div className="text-xs text-muted-foreground">{a.accountEmail}</div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {a.templateDisplayName || <span className="italic">None</span>}
                      </td>
                      <td className="px-4 py-2">
                        {a.templateVersion ? (
                          <Badge variant="secondary">{a.templateVersion}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {a.isOnLatestDefault ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Latest
                          </Badge>
                        ) : a.hasRetellAgents ? (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Outdated
                          </Badge>
                        ) : (
                          <Badge variant="outline">No Agents</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {a.retellAgentCount || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
