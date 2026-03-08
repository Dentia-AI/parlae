'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { PageBody } from '@kit/ui/page';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Checkbox } from '@kit/ui/checkbox';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  Play, Loader2, CheckCircle2, XCircle, Square, Phone, PhoneOff,
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

interface TestContact {
  id: string;
  phoneNumber: string;
  status: string;
  outcome?: string;
  callDurationSec?: number;
  retellCallId?: string;
}

interface TestRunState {
  campaignId: string;
  accountId: string;
  campaignStatus: string;
  contacts: TestContact[];
}

const SCAN_TYPES = [
  { id: 'all', label: 'All Scans' },
  { id: 'recall', label: 'Recall / Recare' },
  { id: 'reminder', label: 'Appointment Reminders' },
  { id: 'noshow', label: 'No-Show Follow-up' },
  { id: 'reactivation', label: 'Patient Reactivation' },
] as const;

const CALL_TYPES = [
  { id: 'recall', label: 'Recall / Recare' },
  { id: 'reminder', label: 'Appointment Reminder' },
  { id: 'noshow', label: 'No-Show Follow-up' },
  { id: 'reactivation', label: 'Patient Reactivation' },
] as const;

const TERMINAL_STATUSES = new Set([
  'COMPLETED', 'FAILED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'CANCELLED',
]);

const CAMPAIGN_TERMINAL = new Set(['COMPLETED', 'CANCELLED']);

const STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-gray-100 text-gray-700',
  DIALING: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  NO_ANSWER: 'bg-orange-100 text-orange-700',
  VOICEMAIL: 'bg-purple-100 text-purple-700',
  BUSY: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-gray-200 text-gray-600',
};

const DEFAULT_TEST_NUMBERS = '+14387931089\n+15858578357';

function AdminOutboundCampaignsPage() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set(['all']));
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Test Run state
  const [testAccountId, setTestAccountId] = useState('');
  const [testCallType, setTestCallType] = useState('recall');
  const [testPhoneNumbers, setTestPhoneNumbers] = useState(DEFAULT_TEST_NUMBERS);
  const [testRunning, setTestRunning] = useState(false);
  const [testRun, setTestRun] = useState<TestRunState | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [aborting, setAborting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          const unique: AccountInfo[] = Array.from(
            new Map(mapped.map((a: AccountInfo) => [a.id, a])).values(),
          );
          setAccounts(unique);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  // Polling for test run status
  const pollStatus = useCallback(async (campaignId: string, accountId: string) => {
    try {
      const res = await fetch(
        `/api/admin/outbound/test-run?campaignId=${campaignId}&accountId=${accountId}`,
      );
      if (!res.ok) return;
      const data = await res.json();

      const contacts: TestContact[] = (data.contacts || []).map((c: any) => ({
        id: c.id,
        phoneNumber: c.phoneNumber,
        status: c.status,
        outcome: c.outcome,
        callDurationSec: c.callDurationSec,
        retellCallId: c.retellCallId,
      }));

      const campaignStatus = data.campaign?.status || 'UNKNOWN';

      setTestRun({
        campaignId,
        accountId,
        campaignStatus,
        contacts,
      });

      const allDone = contacts.length > 0 &&
        contacts.every((c) => TERMINAL_STATUSES.has(c.status));

      if (allDone || CAMPAIGN_TERMINAL.has(campaignStatus)) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setTestRunning(false);
      }
    } catch {
      // keep polling on transient errors
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
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

  async function handleStartTestRun() {
    setTestError(null);
    setTestRun(null);
    setTestRunning(true);

    const phoneNumbers = testPhoneNumbers
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);

    if (!testAccountId || !testCallType || phoneNumbers.length === 0) {
      setTestError('Account, call type, and at least one phone number are required');
      setTestRunning(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/outbound/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: testAccountId,
          callType: testCallType,
          phoneNumbers,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start test run');

      setTestRun({
        campaignId: data.campaignId,
        accountId: testAccountId,
        campaignStatus: 'ACTIVE',
        contacts: phoneNumbers.map((p, i) => ({
          id: `pending-${i}`,
          phoneNumber: p,
          status: 'QUEUED',
        })),
      });

      pollRef.current = setInterval(
        () => pollStatus(data.campaignId, testAccountId),
        5000,
      );
      // Initial poll after a short delay
      setTimeout(() => pollStatus(data.campaignId, testAccountId), 2000);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Unknown error');
      setTestRunning(false);
    }
  }

  async function handleAbort() {
    if (!testRun) return;
    setAborting(true);

    try {
      const res = await fetch('/api/admin/outbound/test-run/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: testRun.campaignId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to abort');
      }

      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      // One final poll to get updated statuses
      await pollStatus(testRun.campaignId, testRun.accountId);
      setTestRunning(false);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to abort');
    } finally {
      setAborting(false);
    }
  }

  const allSelected = accounts.length > 0 && selectedAccountIds.size === accounts.length;
  const canTrigger = selectedScans.size > 0;

  return (
    <>
      <div className="px-6 py-4 border-b">
        <AppBreadcrumbs />
      </div>
      <PageBody>
        <div className="space-y-8 max-w-4xl">
          {/* ── Test Run Section ─────────────────────────────── */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Test Run</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Immediately place test calls for an account. Bypasses calling window and scheduling.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Test Configuration</CardTitle>
                <CardDescription>Select account and call type</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Account</Label>
                  {loadingAccounts ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                    </div>
                  ) : (
                    <Select value={testAccountId} onValueChange={setTestAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Call Type</Label>
                  <Select value={testCallType} onValueChange={setTestCallType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALL_TYPES.map((ct) => (
                        <SelectItem key={ct.id} value={ct.id}>
                          {ct.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Phone Numbers</CardTitle>
                <CardDescription>One number per line (E.164 format)</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={testPhoneNumbers}
                  onChange={(e) => setTestPhoneNumbers(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                  placeholder="+14387931089&#10;+15858578357"
                  disabled={testRunning}
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3">
            {!testRunning ? (
              <Button
                onClick={handleStartTestRun}
                disabled={!testAccountId || loadingAccounts}
              >
                <Phone className="h-4 w-4 mr-2" />
                Start Test Run
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleAbort}
                disabled={aborting}
              >
                {aborting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop Test Run
              </Button>
            )}
          </div>

          {testError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {testError}
            </div>
          )}

          {testRun && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Test Run Status</CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">
                      Campaign: {testRun.campaignId}
                    </CardDescription>
                  </div>
                  <Badge className={STATUS_COLORS[testRun.campaignStatus] || 'bg-gray-100'}>
                    {testRun.campaignStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {testRun.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between py-2 px-3 rounded border"
                    >
                      <div className="flex items-center gap-3">
                        {TERMINAL_STATUSES.has(contact.status) ? (
                          contact.status === 'COMPLETED' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : contact.status === 'CANCELLED' ? (
                            <PhoneOff className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-mono">{contact.phoneNumber}</p>
                          {contact.outcome && (
                            <p className="text-xs text-muted-foreground">{contact.outcome}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {contact.callDurationSec != null && (
                          <span className="text-xs text-muted-foreground">
                            {contact.callDurationSec}s
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs ${STATUS_COLORS[contact.status] || ''}`}
                        >
                          {contact.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Scanner Section ──────────────────────────────── */}
          <div className="border-t pt-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Outbound Campaign Scanner</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Manually trigger campaign creation scans for testing. Scans fetch contacts from PMS and create campaigns.
              </p>
            </div>
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
