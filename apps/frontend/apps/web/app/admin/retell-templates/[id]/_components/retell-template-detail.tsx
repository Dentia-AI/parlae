'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Checkbox } from '@kit/ui/checkbox';
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle2,
  Users,
  Rocket,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks';

interface Account {
  id: string;
  name: string;
  brandingBusinessName: string | null;
  voiceProviderOverride: string | null;
  retellAgentTemplateId?: string | null;
}

interface Template {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  isDefault: boolean;
  isActive: boolean;
  llmConfigs: any;
  agentConfigs: any;
  swapConfig: any;
  toolsConfig: any;
  createdAt: string;
  updatedAt: string;
  _count: { accounts: number };
  accounts: Account[];
}

interface Props {
  template: Template;
  allAccounts: Account[];
}

export function RetellTemplateDetail({ template, allAccounts }: Props) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [updatingAnalysis, setUpdatingAnalysis] = useState(false);

  const [form, setForm] = useState({
    displayName: template.displayName,
    description: template.description || '',
    version: template.version,
    isDefault: template.isDefault,
    llmConfigs: JSON.stringify(template.llmConfigs, null, 2),
    agentConfigs: JSON.stringify(template.agentConfigs, null, 2),
    swapConfig: JSON.stringify(template.swapConfig, null, 2),
    toolsConfig: template.toolsConfig
      ? JSON.stringify(template.toolsConfig, null, 2)
      : '',
  });

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const handleSave = async () => {
    let llmConfigs, agentConfigs, swapConfig, toolsConfig;
    try {
      llmConfigs = JSON.parse(form.llmConfigs);
      agentConfigs = JSON.parse(form.agentConfigs);
      swapConfig = JSON.parse(form.swapConfig);
      toolsConfig = form.toolsConfig ? JSON.parse(form.toolsConfig) : null;
    } catch {
      toast.error('Invalid JSON in one of the config fields');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/retell-templates/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          id: template.id,
          displayName: form.displayName,
          description: form.description || null,
          version: form.version,
          isDefault: form.isDefault,
          llmConfigs,
          agentConfigs,
          swapConfig,
          toolsConfig,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Template saved');
        router.refresh();
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDeploy = async () => {
    if (selectedAccountIds.length === 0) {
      toast.error('Select at least one account');
      return;
    }

    setDeploying(true);
    try {
      const res = await fetch('/api/admin/retell-templates/bulk-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          templateId: template.id,
          accountIds: selectedAccountIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const successes = data.deployResults?.filter((r: any) => r.success).length || 0;
        const failures = data.deployResults?.filter((r: any) => !r.success).length || 0;
        toast.success(
          `Deployed to ${successes} account${successes !== 1 ? 's' : ''}${failures > 0 ? `, ${failures} failed` : ''}`,
        );
        router.refresh();
      } else {
        toast.error(data.error || 'Bulk deploy failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleUpdateAnalysis = async () => {
    if (selectedAccountIds.length === 0) {
      toast.error('Select at least one account');
      return;
    }

    setUpdatingAnalysis(true);
    let successes = 0;
    let failures = 0;

    for (const accountId of selectedAccountIds) {
      try {
        const res = await fetch('/api/admin/update-retell-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ accountId }),
        });
        const data = await res.json();
        if (data.success) successes += data.updated;
        else failures++;
      } catch {
        failures++;
      }
    }

    if (successes > 0) {
      toast.success(`Updated analysis schema on ${successes} agent${successes !== 1 ? 's' : ''}${failures > 0 ? `, ${failures} failed` : ''}`);
    } else {
      toast.error('Failed to update analysis schema');
    }
    setUpdatingAnalysis(false);
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId],
    );
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/retell-templates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {template.displayName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{template.version}</Badge>
              <span className="text-sm text-muted-foreground">{template.name}</span>
              {template.isDefault && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Default
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {template._count.accounts} assigned
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isDefault"
              checked={form.isDefault}
              onCheckedChange={(checked) =>
                setForm({ ...form, isDefault: checked === true })
              }
            />
            <Label htmlFor="isDefault">Default template</Label>
          </div>
        </CardContent>
      </Card>

      {/* LLM Configs */}
      <Card>
        <CardHeader>
          <CardTitle>LLM Configs</CardTitle>
          <CardDescription>Per-role LLM settings (model, prompt, temperature)</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.llmConfigs}
            onChange={(e) => setForm({ ...form, llmConfigs: e.target.value })}
            rows={12}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* Agent Configs */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Configs</CardTitle>
          <CardDescription>Per-role agent settings (voice, response type)</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.agentConfigs}
            onChange={(e) => setForm({ ...form, agentConfigs: e.target.value })}
            rows={10}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* Swap Config */}
      <Card>
        <CardHeader>
          <CardTitle>Swap Config</CardTitle>
          <CardDescription>Agent routing / transfer rules</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.swapConfig}
            onChange={(e) => setForm({ ...form, swapConfig: e.target.value })}
            rows={8}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* Tools Config */}
      <Card>
        <CardHeader>
          <CardTitle>Tools Config (Optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.toolsConfig}
            onChange={(e) => setForm({ ...form, toolsConfig: e.target.value })}
            rows={6}
            className="font-mono text-xs"
            placeholder="Leave empty for defaults"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Bulk Deploy */}
      <Card>
        <CardHeader>
          <CardTitle>Deploy to Accounts</CardTitle>
          <CardDescription>
            Select accounts to assign this template and redeploy their Retell agents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {allAccounts.map((account) => {
              const isAssigned = account.retellAgentTemplateId === template.id;
              return (
                <label
                  key={account.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedAccountIds.includes(account.id)}
                    onCheckedChange={() => toggleAccount(account.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      {account.brandingBusinessName || account.name}
                    </span>
                    {isAssigned && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Assigned
                      </Badge>
                    )}
                    {account.voiceProviderOverride === 'RETELL' && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Retell Active
                      </Badge>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedAccountIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleUpdateAnalysis}
                disabled={updatingAnalysis || selectedAccountIds.length === 0}
              >
                {updatingAnalysis ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Update Analysis Schema
              </Button>
              <Button
                onClick={handleBulkDeploy}
                disabled={deploying || selectedAccountIds.length === 0}
              >
                {deploying ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Deploy to Selected
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Currently Assigned */}
      {template.accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Currently Assigned Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {template.accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between py-2">
                  <span className="text-sm">
                    {account.brandingBusinessName || account.name}
                  </span>
                  {account.voiceProviderOverride === 'RETELL' && (
                    <Badge variant="secondary" className="text-xs">
                      Retell Active
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
