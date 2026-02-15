'use client';

import { useState, useEffect, useTransition } from 'react';
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

type VersionGroup = {
  version: string;
  templateName: string;
  count: number;
  accountIds: string[];
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

type OverviewData = {
  accounts: AccountOverview[];
  versionGroups: VersionGroup[];
  templates: TemplateSummary[];
  defaultTemplate: { id: string; version: string; name: string } | null;
  stats: {
    totalAccounts: number;
    withSquad: number;
    withoutSquad: number;
    onLatestDefault: number;
    uniqueVersions: number;
  };
};

export default function VersionOverviewPage() {
  const csrfToken = useCsrfToken();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [rollbackPending, startRollbackTransition] = useTransition();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/agent-templates/version-overview');
      const result = await response.json();
      if (result.success) {
        setData(result);
      } else {
        toast.error(result.error || 'Failed to fetch version overview');
      }
    } catch {
      toast.error('Failed to fetch version overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAccounts = data?.accounts.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.accountName?.toLowerCase().includes(q) ||
      a.accountEmail?.toLowerCase().includes(q) ||
      a.templateVersion?.toLowerCase().includes(q) ||
      a.templateName?.toLowerCase().includes(q)
    );
  });

  const handleRollback = (accountId: string, templateId: string | null) => {
    if (!confirm('Are you sure you want to rollback this clinic? This will re-create their Vapi squad.')) {
      return;
    }

    startRollbackTransition(async () => {
      try {
        const body: any = { accountIds: [accountId] };
        if (templateId) {
          body.targetTemplateId = templateId;
        } else {
          body.useBuiltIn = true;
        }

        const response = await fetch('/api/admin/agent-templates/rollback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify(body),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Rollback failed');
        }

        const entry = result.results?.[0];
        if (entry?.status === 'rolled_back') {
          toast.success(
            `Rolled back ${entry.accountName || accountId} to ${entry.toVersion}`,
          );
        } else {
          toast.error(entry?.reason || 'Rollback failed');
        }

        fetchData();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Rollback failed',
        );
      }
    });
  };

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const handleBulkRollback = (templateId: string) => {
    if (selectedAccounts.size === 0) {
      toast.error('Select at least one clinic to rollback');
      return;
    }

    if (
      !confirm(
        `Rollback ${selectedAccounts.size} clinic(s)? This will re-create their Vapi squads.`,
      )
    ) {
      return;
    }

    startRollbackTransition(async () => {
      try {
        const response = await fetch('/api/admin/agent-templates/rollback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            accountIds: Array.from(selectedAccounts),
            targetTemplateId: templateId,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Bulk rollback failed');
        }

        toast.success(
          `Rolled back ${result.summary.rolledBack} clinic(s)`,
        );
        setSelectedAccounts(new Set());
        fetchData();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Bulk rollback failed',
        );
      }
    });
  };

  if (loading) {
    return (
      <div className="container max-w-7xl py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container max-w-7xl py-8">
        <Alert variant="destructive">
          <AlertDescription>Failed to load version overview.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <Link
        href="/admin/agent-templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Templates
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Version Overview
          </h1>
          <p className="text-muted-foreground mt-2">
            See which template version each clinic is running
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{data.stats.totalAccounts}</div>
            <p className="text-sm text-muted-foreground">Total Clinics</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {data.stats.withSquad}
            </div>
            <p className="text-sm text-muted-foreground">With Agent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-yellow-600">
              {data.stats.withoutSquad}
            </div>
            <p className="text-sm text-muted-foreground">No Agent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-blue-600">
              {data.stats.onLatestDefault}
            </div>
            <p className="text-sm text-muted-foreground">On Latest Default</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{data.stats.uniqueVersions}</div>
            <p className="text-sm text-muted-foreground">Unique Versions</p>
          </CardContent>
        </Card>
      </div>

      {/* Version Distribution */}
      {data.versionGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Version Distribution</CardTitle>
            <CardDescription>
              Breakdown of clinics by template version
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {data.versionGroups.map((group) => (
                <div
                  key={group.version}
                  className="flex items-center gap-2 p-3 border rounded-lg"
                >
                  <Badge variant="outline" className="font-mono">
                    {group.version}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {group.templateName}
                  </span>
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

      {/* Clinics Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Clinics</CardTitle>
              <CardDescription>
                Click on a clinic to rollback or select multiple for bulk
                actions
              </CardDescription>
            </div>
            {selectedAccounts.size > 0 && data.templates.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedAccounts.size} selected
                </span>
                <select
                  className="border rounded-md p-1 text-sm"
                  onChange={(e) => {
                    if (e.target.value) handleBulkRollback(e.target.value);
                  }}
                  defaultValue=""
                  disabled={rollbackPending}
                >
                  <option value="" disabled>
                    Rollback to...
                  </option>
                  {data.templates
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName} ({t.version})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or version..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
                      filteredAccounts &&
                      filteredAccounts.length > 0 &&
                      filteredAccounts.every((a) =>
                        selectedAccounts.has(a.accountId),
                      )
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAccounts(
                          new Set(
                            filteredAccounts?.map((a) => a.accountId) || [],
                          ),
                        );
                      } else {
                        setSelectedAccounts(new Set());
                      }
                    }}
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
              {filteredAccounts && filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => (
                  <TableRow key={account.accountId}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedAccounts.has(account.accountId)}
                        onChange={() =>
                          toggleAccountSelection(account.accountId)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {account.accountName || 'Unnamed'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account.accountEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">
                        {account.templateName || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {account.templateVersion ? (
                        <Badge variant="outline" className="font-mono">
                          {account.templateVersion}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.hasSquad ? (
                        account.isOnLatestDefault ? (
                          <Badge
                            variant="default"
                            className="bg-green-600 text-xs"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Latest
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Outdated
                          </Badge>
                        )
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          No Agent
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
                          onClick={() =>
                            handleRollback(account.accountId, null)
                          }
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
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    {searchQuery
                      ? 'No clinics match your search'
                      : 'No clinics found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
