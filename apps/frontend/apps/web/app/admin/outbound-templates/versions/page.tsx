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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import { Checkbox } from '@kit/ui/checkbox';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  PhoneOutgoing,
  Users,
  Rocket,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import {
  AdminTablePagination,
  SelectAllBanner,
} from '~/app/admin/_components/admin-table-pagination';

interface AccountOverview {
  accountId: string;
  accountName: string | null;
  accountEmail: string | null;
  patientCareEnabled: boolean;
  financialEnabled: boolean;
  patientCareAgentId: string | null;
  financialAgentId: string | null;
  outboundTemplateVersion: string | null;
  hasOutboundAgent: boolean;
  isOnLatest: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VersionGroup {
  version: string;
  count: number;
}

interface TemplateSummary {
  id: string;
  name: string;
  agentGroup: string;
  version: string;
  isActive: boolean;
}

interface Stats {
  totalAccounts: number;
  withOutboundAgent: number;
  patientCareEnabled: number;
  financialEnabled: number;
  onLatest: number;
  uniqueVersions: number;
}

export default function OutboundVersionOverviewPage() {
  const csrfToken = useCsrfToken();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [versionGroups, setVersionGroups] = useState<VersionGroup[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [search, setSearch] = useState('');
  const [filterVersion, setFilterVersion] = useState('');
  const [page, setPage] = useState(1);

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
    if (filterVersion) params.set('version', filterVersion);
    return params.toString();
  }, [page, search, filterVersion]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/outbound-templates/version-overview?${buildQueryParams()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      setAccounts(data.accounts || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      setVersionGroups(data.versionGroups || []);
      setTemplates(data.templates || []);
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
      clearSelection();
    }, 400);
  };

  const handleFilterChange = (value: string) => {
    setFilterVersion(value);
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
          version: filterVersion || undefined,
        };
      } else {
        body.accountIds = [...selectedAccounts];
      }

      const res = await fetch('/api/admin/outbound-templates/bulk-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deploy failed');

      const successes = data.results?.filter((r: any) => r.success).length || 0;
      const failures = data.results?.filter((r: any) => !r.success).length || 0;
      toast.success(`Deployed to ${successes} account(s)${failures > 0 ? `, ${failures} failed` : ''}`);
      clearSelection();
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk deploy failed');
    } finally {
      setDeploying(false);
    }
  };

  const uniqueVersions = [...new Set(versionGroups.map((g) => g.version))].filter((v) => v !== 'unversioned');

  if (loading && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <PhoneOutgoing className="h-8 w-8" />
            Outbound Version Overview
          </h1>
          <p className="text-muted-foreground mt-2">
            Track which outbound template version each account is running &amp; deploy in bulk
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.totalAccounts}</div>
              <div className="text-xs text-muted-foreground">Total Accounts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.withOutboundAgent}</div>
              <div className="text-xs text-muted-foreground">With Agent</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.patientCareEnabled}</div>
              <div className="text-xs text-muted-foreground">Patient Care</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.financialEnabled}</div>
              <div className="text-xs text-muted-foreground">Financial</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.onLatest}</div>
              <div className="text-xs text-muted-foreground">On Latest</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.uniqueVersions}</div>
              <div className="text-xs text-muted-foreground">Versions</div>
            </CardContent>
          </Card>
        </div>
      )}

      {versionGroups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {versionGroups.map((g) => (
            <Card key={g.version}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-sm">{g.version}</Badge>
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

      {selectAllMatching && (
        <SelectAllBanner
          totalMatching={pagination.total}
          excludeCount={excludedAccounts.size}
          onClear={clearSelection}
        />
      )}

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
              {templates.filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.agentGroup === 'PATIENT_CARE' ? 'PC' : 'Fin'}) - {t.version}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleBulkDeploy} disabled={!deployTemplateId || deploying}>
              {deploying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Rocket className="h-4 w-4 mr-1" />}
              Deploy
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Accounts</CardTitle>
              <CardDescription>{pagination.total} account{pagination.total !== 1 ? 's' : ''} total</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterVersion}
                onChange={(e) => handleFilterChange(e.target.value)}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectAllMatching || (accounts.length > 0 && accounts.every((a) => selectedAccounts.has(a.accountId)))}
                    onCheckedChange={handleToggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Patient Care</TableHead>
                <TableHead>Financial</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No accounts found</TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a.accountId}>
                    <TableCell>
                      <Checkbox
                        checked={isAccountSelected(a.accountId)}
                        onCheckedChange={() => toggleAccount(a.accountId)}
                        aria-label={`Select ${a.accountName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{a.accountName || 'Unnamed'}</div>
                      <div className="text-xs text-muted-foreground">{a.accountEmail}</div>
                    </TableCell>
                    <TableCell>
                      {a.patientCareAgentId ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />Active
                        </Badge>
                      ) : a.patientCareEnabled ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />No Agent
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.financialAgentId ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />Active
                        </Badge>
                      ) : a.financialEnabled ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />No Agent
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.outboundTemplateVersion ? (
                        <Badge variant="secondary">{a.outboundTemplateVersion}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.isOnLatest ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />Latest
                        </Badge>
                      ) : a.hasOutboundAgent ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          <AlertCircle className="h-3 w-3 mr-1" />Outdated
                        </Badge>
                      ) : (
                        <Badge variant="outline">No Agent</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
