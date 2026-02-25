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
import { Textarea } from '@kit/ui/textarea';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Save,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

type SaveMode = 'new' | 'update';

interface ExistingTemplate {
  id: string;
  name: string;
  displayName: string;
  version: string;
}

interface AccountOption {
  id: string;
  name: string;
  hasRetell: boolean;
}

export default function FetchRetellFromAccountPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [fetchedData, setFetchedData] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [templateName, setTemplateName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('v1');
  const [isDefault, setIsDefault] = useState(false);

  const [saveMode, setSaveMode] = useState<SaveMode>('new');
  const [existingTemplates, setExistingTemplates] = useState<ExistingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Load accounts on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch('/api/admin/retell-templates/version-overview');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        const opts: AccountOption[] = (data.accounts || [])
          .filter((a: any) => a.hasRetellAgents)
          .map((a: any) => ({
            id: a.accountId,
            name: a.accountName || a.accountEmail || a.accountId,
            hasRetell: a.hasRetellAgents,
          }));

        setAccounts(opts);
        if (opts.length > 0) {
          setSelectedAccountId(opts[0]!.id);
        }
      } catch {
        toast.error('Failed to load accounts');
      } finally {
        setLoadingAccounts(false);
      }
    }

    loadAccounts();
  }, []);

  // Load existing templates for update mode
  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch('/api/admin/retell-templates/list');
        if (!res.ok) return;
        const data = await res.json();
        if (data.templates?.length) {
          setExistingTemplates(data.templates);
          setSelectedTemplateId(data.templates[0].id);
        }
      } catch { /* ignore */ }
    }
    loadTemplates();
  }, []);

  const handleFetch = async () => {
    if (!selectedAccountId) {
      toast.error('Please select an account');
      return;
    }

    setFetchError(null);
    setFetchedData(null);

    startTransition(async () => {
      try {
        const res = await fetch(
          '/api/admin/retell-templates/fetch-from-account',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            body: JSON.stringify({ accountId: selectedAccountId }),
          },
        );

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to fetch');

        setFetchedData(result);
        toast.success(
          `Fetched ${result.roles?.length || 0} role(s) from "${result.accountName}"`,
        );

        if (!displayName) {
          setDisplayName(`${result.accountName} Template`);
        }
        if (!templateName) {
          setTemplateName(
            `retell-${(result.accountName || 'template').toLowerCase().replace(/\s+/g, '-')}-v1`,
          );
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        setFetchError(msg);
        toast.error(`Fetch failed: ${msg}`);
      }
    });
  };

  const handleSave = async () => {
    if (!fetchedData) {
      toast.error('Fetch configs first');
      return;
    }

    startTransition(async () => {
      try {
        if (saveMode === 'new') {
          if (!templateName || !displayName || !version) {
            toast.error('Name, Display Name, and Version are required');
            return;
          }

          const res = await fetch('/api/admin/retell-templates/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            body: JSON.stringify({
              name: templateName,
              displayName,
              description,
              version,
              isDefault,
              llmConfigs: fetchedData.llmConfigs,
              agentConfigs: fetchedData.agentConfigs,
              swapConfig: fetchedData.swapConfig || {},
            }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Create failed');

          toast.success('Template created!');
          router.push('/admin/retell-templates');
        } else {
          if (!selectedTemplateId) {
            toast.error('Select a template to update');
            return;
          }

          const res = await fetch('/api/admin/retell-templates/update', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            body: JSON.stringify({
              id: selectedTemplateId,
              llmConfigs: fetchedData.llmConfigs,
              agentConfigs: fetchedData.agentConfigs,
              swapConfig: fetchedData.swapConfig || {},
              ...(version ? { version } : {}),
            }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Update failed');

          toast.success('Template updated!');
          router.push('/admin/retell-templates');
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Save failed',
        );
      }
    });
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/retell-templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Fetch Retell Config from Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Pull live Retell agent &amp; LLM configs from a deployed account and
            save as a template
          </p>
        </div>
      </div>

      {/* Step 1: Select Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Select Account</CardTitle>
          <CardDescription>
            Choose an account with deployed Retell agents
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
                No accounts have deployed Retell agents. Deploy agents first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Account</Label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handleFetch}
                disabled={pending || !selectedAccountId}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Fetch Configs
              </Button>
            </div>
          )}

          {fetchError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Review Fetched Data */}
      {fetchedData && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <CardTitle className="text-lg">2. Review Configs</CardTitle>
                  <CardDescription>
                    Fetched from &quot;{fetchedData.accountName}&quot; &mdash;{' '}
                    {fetchedData.roles?.length || 0} role(s)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                {fetchedData.roles?.map((role: string) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
              </div>

              {/* LLM Configs Preview */}
              <div>
                <Label className="text-sm font-medium">LLM Configs</Label>
                <Textarea
                  readOnly
                  value={JSON.stringify(fetchedData.llmConfigs, null, 2)}
                  rows={8}
                  className="font-mono text-xs mt-1"
                />
              </div>

              {/* Agent Configs Preview */}
              <div>
                <Label className="text-sm font-medium">Agent Configs</Label>
                <Textarea
                  readOnly
                  value={JSON.stringify(fetchedData.agentConfigs, null, 2)}
                  rows={6}
                  className="font-mono text-xs mt-1"
                />
              </div>

              {/* Swap Config Preview */}
              {fetchedData.swapConfig &&
                Object.keys(fetchedData.swapConfig).length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">
                      Swap Config
                    </Label>
                    <Textarea
                      readOnly
                      value={JSON.stringify(
                        fetchedData.swapConfig,
                        null,
                        2,
                      )}
                      rows={4}
                      className="font-mono text-xs mt-1"
                    />
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Step 3: Save */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Save as Template</CardTitle>
              <CardDescription>
                Create a new template or update an existing one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Save mode toggle */}
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
                  disabled={existingTemplates.length === 0}
                >
                  Update Existing
                </Button>
              </div>

              {saveMode === 'new' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Internal Name</Label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="retell-dental-v1"
                    />
                  </div>
                  <div>
                    <Label>Display Name</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Dental Clinic Receptionist"
                    />
                  </div>
                  <div>
                    <Label>Version</Label>
                    <Input
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="v1"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isDefault"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="isDefault" className="mb-0">
                      Set as default template
                    </Label>
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
                      {existingTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName} ({t.version})
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
                <Link href="/admin/retell-templates">
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
