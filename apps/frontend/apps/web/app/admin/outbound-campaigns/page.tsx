'use client';

import { useState, useTransition, useEffect } from 'react';
import { PageBody } from '@kit/ui/page';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Checkbox } from '@kit/ui/checkbox';
import { Label } from '@kit/ui/label';
import {
  Play, Loader2, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';

interface AccountInfo {
  id: string;
  name: string;
  patientCareEnabled: boolean;
  financialEnabled: boolean;
  outboundTemplateVersion: string | null;
}

interface ScanResult {
  accountId: string;
  scansRun: string[];
  error?: string;
}

const SCAN_TYPES = [
  { id: 'all', label: 'All Scans' },
  { id: 'recall', label: 'Recall / Recare' },
  { id: 'reminder', label: 'Appointment Reminders' },
  { id: 'noshow', label: 'No-Show Follow-up' },
  { id: 'reactivation', label: 'Patient Reactivation' },
] as const;

function AdminOutboundCampaignsPage() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set(['all']));
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    fetch('/api/admin/outbound-templates/version-overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.accounts) {
          const mapped = data.accounts
            .filter((a: any) => a.accountId && (a.patientCareEnabled || a.financialEnabled))
            .map((a: any) => ({
              id: a.accountId as string,
              name: a.accountName || a.accountEmail || a.accountId,
              patientCareEnabled: a.patientCareEnabled,
              financialEnabled: a.financialEnabled,
              outboundTemplateVersion: a.outboundTemplateVersion,
            }));
          const unique = Array.from(
            new Map(mapped.map((a: AccountInfo) => [a.id, a])).values(),
          );
          setAccounts(unique);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAccounts() {
    if (selectedAccountIds.size === accounts.length) {
      setSelectedAccountIds(new Set());
    } else {
      setSelectedAccountIds(new Set(accounts.map((a) => a.id)));
    }
  }

  function toggleScan(id: string) {
    setSelectedScans((prev) => {
      const next = new Set(prev);
      if (id === 'all') {
        return next.has('all') ? new Set() : new Set(['all']);
      }
      next.delete('all');
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleTrigger() {
    startTransition(async () => {
      try {
        const scanTypes = Array.from(selectedScans);
        const body: Record<string, unknown> = { scanTypes };
        if (selectedAccountIds.size > 0) {
          body.accountIds = Array.from(selectedAccountIds);
        }

        const res = await fetch('/api/admin/outbound/trigger-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setResults(data.results || []);
      } catch (err) {
        setResults([{
          accountId: 'error',
          scansRun: [],
          error: err instanceof Error ? err.message : 'Unknown error',
        }]);
      }
    });
  }

  const allSelected = accounts.length > 0 && selectedAccountIds.size === accounts.length;
  const canTrigger = selectedScans.size > 0;

  return (
    <>
      <div className="px-6 py-4 border-b">
        <AppBreadcrumbs />
      </div>
      <PageBody>
        <div className="space-y-6 max-w-4xl">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Outbound Campaign Scanner</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Manually trigger campaign creation scans for testing. Scans fetch contacts from PMS and create campaigns.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Scan Types</CardTitle>
                <CardDescription>Select which scans to run</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SCAN_TYPES.map((scan) => (
                    <div key={scan.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`scan-${scan.id}`}
                        checked={selectedScans.has(scan.id)}
                        onCheckedChange={() => toggleScan(scan.id)}
                      />
                      <Label htmlFor={`scan-${scan.id}`} className="text-sm cursor-pointer">
                        {scan.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">
                      Accounts ({accounts.length} enabled)
                    </CardTitle>
                    <CardDescription>
                      Select specific accounts or leave empty for all enabled
                    </CardDescription>
                  </div>
                  {accounts.length > 0 && (
                    <Button size="sm" variant="outline" onClick={selectAllAccounts}>
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingAccounts ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No accounts have outbound enabled
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {accounts.map((acct, idx) => (
                      <div key={acct.id ?? `acct-${idx}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedAccountIds.has(acct.id)}
                            onCheckedChange={() => toggleAccount(acct.id)}
                          />
                          <div>
                            <p className="text-sm font-medium">{acct.name}</p>
                            <div className="flex gap-1.5 mt-0.5">
                              {acct.patientCareEnabled && (
                                <Badge variant="outline" className="text-xs">PC</Badge>
                              )}
                              {acct.financialEnabled && (
                                <Badge variant="outline" className="text-xs">Fin</Badge>
                              )}
                              {acct.outboundTemplateVersion && (
                                <Badge variant="secondary" className="text-xs">
                                  v{acct.outboundTemplateVersion}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleTrigger}
              disabled={isPending || !canTrigger}
              className="bg-primary"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Campaign Scan
              {selectedAccountIds.size > 0
                ? ` (${selectedAccountIds.size} account${selectedAccountIds.size > 1 ? 's' : ''})`
                : ' (all enabled)'}
            </Button>
          </div>

          {results && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Scan Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between py-2 px-3 rounded border"
                    >
                      <div className="flex items-start gap-2">
                        {r.error ? (
                          <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium font-mono">
                            {accounts.find((a) => a.id === r.accountId)?.name || r.accountId}
                          </p>
                          {r.error ? (
                            <p className="text-xs text-red-600">{r.error}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Scans run: {r.scansRun.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
    </>
  );
}

export default AdminOutboundCampaignsPage;
