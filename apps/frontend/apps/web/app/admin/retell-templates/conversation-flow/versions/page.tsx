'use client';

import { useState, useEffect } from 'react';
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
  Workflow,
  Users,
  Rocket,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

interface AccountOverview {
  accountId: string;
  accountName: string | null;
  accountEmail: string | null;
  templateId: string | null;
  templateName: string | null;
  templateDisplayName: string | null;
  templateVersion: string | null;
  hasFlowAgent: boolean;
  conversationFlowId: string | null;
  agentId: string | null;
  isOnLatestDefault: boolean;
}

interface VersionGroup {
  version: string;
  templateName: string;
  count: number;
  accountIds: string[];
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
  withFlowAgent: number;
  withoutFlowAgent: number;
  withTemplate: number;
  onLatestDefault: number;
  uniqueVersions: number;
}

export default function FlowVersionOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [versionGroups, setVersionGroups] = useState<VersionGroup[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState('');

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [deployTemplateId, setDeployTemplateId] = useState('');
  const [deploying, setDeploying] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/version-overview');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      setAccounts(data.accounts || []);
      setVersionGroups(data.versionGroups || []);
      setTemplates(data.templates || []);
      setStats(data.stats || null);
    } catch {
      toast.error('Failed to load version overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAccounts = accounts.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.accountName?.toLowerCase().includes(q) ||
      a.accountEmail?.toLowerCase().includes(q) ||
      a.templateVersion?.toLowerCase().includes(q) ||
      a.templateDisplayName?.toLowerCase().includes(q)
    );
  });

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedAccounts.size === filteredAccounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(filteredAccounts.map((a) => a.accountId)));
    }
  };

  const handleBulkDeploy = async () => {
    if (!deployTemplateId || selectedAccounts.size === 0) return;

    setDeploying(true);
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/bulk-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: deployTemplateId,
          accountIds: [...selectedAccounts],
        }),
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
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk deploy failed');
    } finally {
      setDeploying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Workflow className="h-8 w-8" />
            Flow Version Overview
          </h1>
          <p className="text-muted-foreground mt-2">
            Track which conversation flow version each account is running
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.totalAccounts}</div>
              <div className="text-xs text-muted-foreground">Total Accounts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.withFlowAgent}</div>
              <div className="text-xs text-muted-foreground">With Flow Agent</div>
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

      {/* Bulk deploy bar */}
      {selectedAccounts.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedAccounts.size} account{selectedAccounts.size !== 1 ? 's' : ''} selected
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
                {filteredAccounts.length} account{filteredAccounts.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deploy Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No accounts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((a) => (
                  <TableRow key={a.accountId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedAccounts.has(a.accountId)}
                        onCheckedChange={() => toggleAccount(a.accountId)}
                        aria-label={`Select ${a.accountName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{a.accountName || 'Unnamed'}</div>
                      <div className="text-xs text-muted-foreground">{a.accountEmail}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.templateDisplayName || <span className="italic">None</span>}
                    </TableCell>
                    <TableCell>
                      {a.templateVersion ? (
                        <Badge variant="secondary">{a.templateVersion}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.isOnLatestDefault ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Latest
                        </Badge>
                      ) : a.hasFlowAgent ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Outdated
                        </Badge>
                      ) : (
                        <Badge variant="outline">No Agent</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.hasFlowAgent ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          Flow
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
