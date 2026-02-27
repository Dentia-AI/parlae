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
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Save,
  PhoneOutgoing,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

type SaveMode = 'new' | 'update';

interface AccountOption {
  accountId: string;
  accountName: string;
  patientCareAgentId: string | null;
  financialAgentId: string | null;
}

interface ExistingTemplate {
  id: string;
  name: string;
  agentGroup: string;
  version: string;
}

interface FetchedSummary {
  accountName: string;
  group: string;
  agentId: string;
  conversationFlowId: string | null;
  nodeCount: number;
  nodes: string[];
  model: string;
  voiceId: string;
  templateVersion: string;
  flowConfig: Record<string, unknown> | null;
}

export default function FetchOutboundFromAccountPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'PATIENT_CARE' | 'FINANCIAL'>('PATIENT_CARE');
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [fetchedSummary, setFetchedSummary] = useState<FetchedSummary | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [templateName, setTemplateName] = useState('');
  const [version, setVersion] = useState('v1.0');

  const [saveMode, setSaveMode] = useState<SaveMode>('new');
  const [existingTemplates, setExistingTemplates] = useState<ExistingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/admin/outbound-templates/version-overview');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        const accts: AccountOption[] = (data.accounts || [])
          .filter((a: any) => a.patientCareAgentId || a.financialAgentId)
          .map((a: any) => ({
            accountId: a.accountId,
            accountName: a.accountName || a.accountEmail || a.accountId,
            patientCareAgentId: a.patientCareAgentId,
            financialAgentId: a.financialAgentId,
          }));

        setAccounts(accts);
        if (accts.length > 0) {
          setSelectedAccountId(accts[0]!.accountId);
        }

        setExistingTemplates(
          (data.templates || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            agentGroup: t.agentGroup,
            version: t.version,
          })),
        );
      } catch {
        toast.error('Failed to load accounts');
      } finally {
        setLoadingAccounts(false);
      }
    }
    loadData();
  }, []);

  const selectedAccount = accounts.find((a) => a.accountId === selectedAccountId);
  const canFetchGroup =
    selectedGroup === 'PATIENT_CARE'
      ? !!selectedAccount?.patientCareAgentId
      : !!selectedAccount?.financialAgentId;

  const groupTemplates = existingTemplates.filter((t) => t.agentGroup === selectedGroup);

  const handleFetch = async () => {
    if (!selectedAccountId) {
      toast.error('Please select an account');
      return;
    }

    setFetchError(null);
    setFetchedSummary(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/outbound-templates/fetch-from-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ accountId: selectedAccountId, group: selectedGroup }),
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to fetch');

        setFetchedSummary(result);
        toast.success(`Found ${result.nodeCount} node(s) for "${result.accountName}" (${selectedGroup})`);

        if (!templateName) {
          const groupName = selectedGroup === 'PATIENT_CARE' ? 'Patient Care' : 'Financial';
          setTemplateName(`Outbound ${groupName} Agent`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        setFetchError(msg);
        toast.error(`Fetch failed: ${msg}`);
      }
    });
  };

  const handleSave = async () => {
    if (!fetchedSummary) {
      toast.error('Fetch from account first');
      return;
    }

    startTransition(async () => {
      try {
        if (saveMode === 'new') {
          if (!templateName || !version) {
            toast.error('Name and Version are required');
            return;
          }

          const res = await fetch('/api/admin/outbound-templates', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({
              agentGroup: selectedGroup,
              name: templateName,
              flowConfig: fetchedSummary.flowConfig,
              version,
            }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Create failed');

          toast.success(`Template ${result.action}!`);
          router.push('/admin/outbound-templates');
        } else {
          if (!selectedTemplateId) {
            toast.error('Select a template to update');
            return;
          }

          const res = await fetch('/api/admin/outbound-templates', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({
              id: selectedTemplateId,
              flowConfig: fetchedSummary.flowConfig,
              ...(version ? { version } : {}),
              bumpVersion: !version,
            }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Update failed');

          toast.success('Template updated!');
          router.push('/admin/outbound-templates');
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Save failed');
      }
    });
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/outbound-templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <PhoneOutgoing className="h-6 w-6" />
            Fetch Outbound Config from Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Pull a live outbound agent conversation flow config from a deployed account and save as a template
          </p>
        </div>
      </div>

      {/* Step 1: Select Account & Group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Select Account &amp; Agent Group</CardTitle>
          <CardDescription>
            Choose an account with a deployed outbound agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAccounts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No accounts have deployed outbound agents yet.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label>Account</Label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      setFetchedSummary(null);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {accounts.map((a) => (
                      <option key={a.accountId} value={a.accountId}>
                        {a.accountName}
                        {a.patientCareAgentId && a.financialAgentId
                          ? ' (PC + Fin)'
                          : a.patientCareAgentId
                            ? ' (Patient Care)'
                            : ' (Financial)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-48">
                  <Label>Agent Group</Label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => {
                      setSelectedGroup(e.target.value as any);
                      setFetchedSummary(null);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="PATIENT_CARE">Patient Care</option>
                    <option value="FINANCIAL">Financial</option>
                  </select>
                </div>
                <Button
                  onClick={handleFetch}
                  disabled={pending || !selectedAccountId || !canFetchGroup}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Fetch Config
                </Button>
              </div>
              {!canFetchGroup && selectedAccountId && (
                <p className="text-sm text-amber-600">
                  This account does not have a {selectedGroup === 'PATIENT_CARE' ? 'Patient Care' : 'Financial'} agent deployed.
                </p>
              )}
            </>
          )}

          {fetchError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Summary */}
      {fetchedSummary && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <CardTitle className="text-lg">
                    2. Fetched: {fetchedSummary.accountName}
                  </CardTitle>
                  <CardDescription>
                    {fetchedSummary.group === 'PATIENT_CARE' ? 'Patient Care' : 'Financial'} agent
                    {fetchedSummary.conversationFlowId ? ` with ${fetchedSummary.nodeCount} node(s)` : ' (no flow)'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {fetchedSummary.nodes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fetchedSummary.nodes.map((node) => (
                    <Badge key={node} variant="secondary">{node}</Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 text-sm pt-2">
                <div>
                  <span className="text-muted-foreground">Model:</span>{' '}
                  <span className="font-mono">{fetchedSummary.model}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Voice:</span>{' '}
                  <span className="font-mono">{fetchedSummary.voiceId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Version:</span>{' '}
                  <span className="font-mono">{fetchedSummary.templateVersion}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Save */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Save as Template</CardTitle>
              <CardDescription>
                Create a new outbound template or update an existing one with this config
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={saveMode === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSaveMode('new')}
                >
                  Create New
                </Button>
                <Button
                  variant={saveMode === 'update' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSaveMode('update')}
                  disabled={groupTemplates.length === 0}
                >
                  Update Existing
                </Button>
              </div>

              {saveMode === 'new' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Template Name</Label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Outbound Patient Care Agent"
                    />
                  </div>
                  <div>
                    <Label>Version</Label>
                    <Input
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="v1.0"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Agent Group</Label>
                    <Input value={selectedGroup} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Matched to the group you fetched from. Only one template per group is allowed.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Template to Update</Label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select template...</option>
                      {groupTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-48">
                    <Label>New Version (optional)</Label>
                    <Input
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="e.g. v1.1"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Link href="/admin/outbound-templates">
                  <Button variant="outline">Cancel</Button>
                </Link>
                <Button onClick={handleSave} disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {saveMode === 'new' ? 'Create Template' : 'Update Template'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
