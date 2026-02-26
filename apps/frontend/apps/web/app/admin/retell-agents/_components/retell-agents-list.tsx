'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Checkbox } from '@kit/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Skeleton } from '@kit/ui/skeleton';
import { toast } from '@kit/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, Database } from 'lucide-react';

interface RetellAgent {
  agentId: string;
  agentName: string | null;
  voiceId: string;
  responseEngineType: string;
  conversationFlowId: string | null;
  lastModified: number;
  isOrphaned: boolean;
  linkedAccount: { name: string; id: string; source: string } | null;
}

interface AgentsSummary {
  total: number;
  orphaned: number;
  linked: number;
}

type FilterMode = 'all' | 'orphaned' | 'linked';

export function RetellAgentsList() {
  const [agents, setAgents] = useState<RetellAgent[]>([]);
  const [summary, setSummary] = useState<AgentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [updatingAnalysis, setUpdatingAnalysis] = useState(false);
  const [updatingFlow, setUpdatingFlow] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/retell-agents');
      const data = await res.json();
      if (data.success) {
        setAgents(data.agents);
        setSummary(data.summary);
      } else {
        toast.error(data.error || 'Failed to fetch agents');
      }
    } catch {
      toast.error('Failed to fetch Retell agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filteredAgents = useMemo(() => {
    let result = agents;

    if (filterMode === 'orphaned') {
      result = result.filter((a) => a.isOrphaned);
    } else if (filterMode === 'linked') {
      result = result.filter((a) => !a.isOrphaned);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.agentId.toLowerCase().includes(q) ||
          a.agentName?.toLowerCase().includes(q) ||
          a.linkedAccount?.name.toLowerCase().includes(q) ||
          a.voiceId.toLowerCase().includes(q),
      );
    }

    return result;
  }, [agents, filterMode, search]);

  const allFilteredSelected =
    filteredAgents.length > 0 && filteredAgents.every((a) => selectedIds.has(a.agentId));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAgents.map((a) => a.agentId)));
    }
  }

  function toggleSelect(agentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }

  function selectAllOrphaned() {
    setSelectedIds(new Set(agents.filter((a) => a.isOrphaned).map((a) => a.agentId)));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    setShowDeleteDialog(false);

    try {
      const res = await fetch('/api/admin/retell-agents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Deleted ${data.deleted} agent(s)${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
        setSelectedIds(new Set());
        await fetchAgents();
      } else {
        toast.error(data.error || 'Delete failed');
      }
    } catch {
      toast.error('Failed to delete agents');
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdateAnalysis() {
    if (selectedIds.size === 0) return;
    setUpdatingAnalysis(true);
    try {
      const res = await fetch('/api/admin/update-retell-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `Updated analysis schema on ${data.updated} agent${data.updated !== 1 ? 's' : ''}${data.total - data.updated > 0 ? `, ${data.total - data.updated} failed` : ''}`,
        );
      } else {
        toast.error(data.error || 'Failed to update analysis schema');
      }
    } catch {
      toast.error('Failed to update analysis schema');
    } finally {
      setUpdatingAnalysis(false);
    }
  }

  async function handleUpdateFlow() {
    const selectedAgents = agents.filter((a) => selectedIds.has(a.agentId));
    const accountIds = [...new Set(
      selectedAgents
        .filter((a) => a.conversationFlowId && a.linkedAccount)
        .map((a) => a.linkedAccount!.id),
    )];

    if (accountIds.length === 0) {
      toast.error('No conversation flow agents with linked accounts selected');
      return;
    }

    setUpdatingFlow(true);
    let successCount = 0;
    let failCount = 0;

    for (const accountId of accountIds) {
      try {
        const res = await fetch('/api/admin/update-retell-flow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
          toast.error(`Account ${accountId}: ${data.error}`);
        }
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(
        `Updated conversation flow for ${successCount} account${successCount !== 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`,
      );
    }
    setUpdatingFlow(false);
  }

  function formatDate(timestamp: number) {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString();
  }

  const selectedLinkedCount = Array.from(selectedIds).filter(
    (id) => !agents.find((a) => a.agentId === id)?.isOrphaned,
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Agents</CardDescription>
              <CardTitle className="text-2xl">{summary.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-destructive/50">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                Orphaned
              </CardDescription>
              <CardTitle className="text-2xl text-destructive">{summary.orphaned}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-500/50">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                Linked to Account
              </CardDescription>
              <CardTitle className="text-2xl text-green-600">{summary.linked}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Retell Agents</CardTitle>
              <CardDescription>
                Manage Retell agents across your platform. Orphaned agents are not linked to any account.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAgents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Input
              placeholder="Search by name, ID, account, or voice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                <SelectItem value="orphaned">Orphaned Only</SelectItem>
                <SelectItem value="linked">Linked Only</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {summary && summary.orphaned > 0 && (
              <Button variant="outline" size="sm" onClick={selectAllOrphaned}>
                Select All Orphaned ({summary.orphaned})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0 || updatingFlow}
              onClick={handleUpdateFlow}
            >
              {updatingFlow ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Update Flow
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0 || updatingAnalysis}
              onClick={handleUpdateAnalysis}
            >
              {updatingAnalysis ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Update Analysis Schema
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0 || deleting}
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={allFilteredSelected && filteredAgents.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Agent Name / ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Voice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked Account</TableHead>
                    <TableHead>Last Modified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {agents.length === 0 ? 'No agents found in Retell' : 'No agents match your filters'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgents.map((agent) => (
                      <TableRow
                        key={agent.agentId}
                        className={agent.isOrphaned ? 'bg-destructive/5' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(agent.agentId)}
                            onCheckedChange={() => toggleSelect(agent.agentId)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">
                              {agent.agentName || <span className="text-muted-foreground italic">Unnamed</span>}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">{agent.agentId}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {agent.responseEngineType}
                          </Badge>
                          {agent.conversationFlowId && (
                            <div className="text-xs text-muted-foreground font-mono mt-1 truncate max-w-[140px]">
                              flow: {agent.conversationFlowId}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{agent.voiceId}</TableCell>
                        <TableCell>
                          {agent.isOrphaned ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Orphaned
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Linked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {agent.linkedAccount ? (
                            <div>
                              <div className="text-sm">{agent.linkedAccount.name}</div>
                              <div className="text-xs text-muted-foreground">{agent.linkedAccount.source}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(agent.lastModified)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Retell Agent(s)?</DialogTitle>
            <DialogDescription>
              This will permanently delete the selected agents from Retell. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedLinkedCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold text-amber-800 dark:text-amber-200">
                  Warning: {selectedLinkedCount} of the selected agents are linked to accounts.
                </span>{' '}
                <span className="text-amber-700 dark:text-amber-300">
                  Deleting linked agents will break those accounts&apos; phone integrations.
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Agent(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
