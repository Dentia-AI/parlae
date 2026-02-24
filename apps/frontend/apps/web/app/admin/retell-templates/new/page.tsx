'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Checkbox } from '@kit/ui/checkbox';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks';

export default function NewRetellTemplatePage() {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    displayName: '',
    description: '',
    version: 'v1',
    isDefault: false,
    llmConfigs: '{}',
    agentConfigs: '{}',
    swapConfig: '{}',
    toolsConfig: '',
  });

  const handleSubmit = async () => {
    if (!form.name || !form.displayName || !form.version) {
      toast.error('Name, Display Name, and Version are required');
      return;
    }

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
      const res = await fetch('/api/admin/retell-templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          ...form,
          llmConfigs,
          agentConfigs,
          swapConfig,
          toolsConfig,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Template created');
        router.push(`/admin/retell-templates/${data.template.id}`);
      } else {
        toast.error(data.error || 'Failed to create template');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/retell-templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Retell Template</h1>
          <p className="text-sm text-muted-foreground">
            Define LLM prompts, agent configs, and routing rules
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Name (slug)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="retell-dental-v1"
              />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Dental Clinic v1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="v1"
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="isDefault"
                checked={form.isDefault}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isDefault: checked === true })
                }
              />
              <Label htmlFor="isDefault">Set as default template</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="6-agent dental clinic configuration with..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LLM Configs</CardTitle>
          <CardDescription>
            Per-role LLM configuration (model, prompt, temperature). Keys: receptionist, booking, appointmentMgmt, patientRecords, insuranceBilling, emergency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.llmConfigs}
            onChange={(e) => setForm({ ...form, llmConfigs: e.target.value })}
            rows={10}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Configs</CardTitle>
          <CardDescription>
            Per-role agent settings (voice ID, response type, post-call analysis)
          </CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Swap Config</CardTitle>
          <CardDescription>
            Agent swap (routing) configuration — how agents transfer between each other
          </CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Tools Config (Optional)</CardTitle>
          <CardDescription>
            Custom webhook tool definitions. Leave empty to use defaults from code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.toolsConfig}
            onChange={(e) => setForm({ ...form, toolsConfig: e.target.value })}
            rows={6}
            className="font-mono text-xs"
            placeholder="Leave empty to use default tool definitions"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/admin/retell-templates">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Create Template
        </Button>
      </div>
    </div>
  );
}
