'use client';

import { useState, useTransition } from 'react';
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
  Bot,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

export default function FetchTemplateFromSquadPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();
  const [squadId, setSquadId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [category, setCategory] = useState('receptionist');
  const [isDefault, setIsDefault] = useState(false);

  const [fetchedData, setFetchedData] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!squadId.trim()) {
      toast.error('Please enter a Squad ID');
      return;
    }

    setFetchError(null);
    setFetchedData(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          '/api/admin/agent-templates/fetch-squad',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({ squadId: squadId.trim() }),
          },
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch squad');
        }

        setFetchedData(result);
        toast.success(
          `Fetched squad "${result.squadName}" with ${result.assistantCount} assistants`,
        );

        // Auto-populate fields
        if (!displayName) {
          setDisplayName(result.squadName || 'Dental Clinic Receptionist');
        }
        if (!version) {
          setVersion('v1.0');
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setFetchError(errorMessage);
        toast.error(`Failed to fetch: ${errorMessage}`);
      }
    });
  };

  const handleSave = async () => {
    if (!fetchedData) {
      toast.error('Please fetch a squad first');
      return;
    }

    if (!templateName.trim() || !displayName.trim() || !version.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/agent-templates/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            name: templateName.trim(),
            displayName: displayName.trim(),
            description: description.trim(),
            version: version.trim(),
            category: category.trim(),
            isDefault,
            squadConfig: fetchedData.squadConfig,
            assistantConfig: fetchedData.assistantConfig,
            toolsConfig: fetchedData.toolsConfig,
            modelConfig: fetchedData.modelConfig,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create template');
        }

        toast.success('Template created successfully');
        router.push('/admin/agent-templates');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to save: ${errorMessage}`);
      }
    });
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <Link
        href="/admin/agent-templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Templates
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Fetch Template from Squad
        </h1>
        <p className="text-muted-foreground mt-2">
          Import a live squad configuration from Vapi and save it as a reusable
          template. Edit the squad in Vapi&apos;s dashboard first, then pull
          the changes here.
        </p>
      </div>

      {/* Step 1: Fetch Squad */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Fetch Squad Configuration</CardTitle>
          <CardDescription>
            Enter a Vapi Squad ID to import its full configuration (all
            assistants, tools, prompts, routing)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="squadId">Squad ID</Label>
            <div className="flex gap-2">
              <Input
                id="squadId"
                placeholder="8cb850fb-33f7-45ee-9372-a804d6e2dcea"
                value={squadId}
                onChange={(e) => setSquadId(e.target.value)}
                disabled={pending}
                className="font-mono text-sm"
              />
              <Button
                onClick={handleFetch}
                disabled={pending || !squadId.trim()}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Fetch
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Find the Squad ID in Vapi&apos;s dashboard or in the
              account&apos;s phoneIntegrationSettings.vapiSquadId
            </p>
          </div>

          {fetchError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}

          {fetchedData && (
            <div className="space-y-3">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Fetched <strong>{fetchedData.squadName}</strong> with{' '}
                  {fetchedData.assistantCount} assistant(s)
                </AlertDescription>
              </Alert>

              {/* Assistant Preview Cards */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Assistants:</h4>
                <div className="grid gap-2">
                  {fetchedData.preview?.map((a: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border p-3 text-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <span className="font-medium">{a.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-xs">
                            {a.model}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {a.voiceProvider}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          Tools: {a.toolGroup}
                          {a.toolCount !== '0' ? ` ${a.toolCount}` : ''}
                        </span>
                        <span>Prompt: {a.promptLength} chars</span>
                        {a.hasAnalysisSchema && (
                          <Badge variant="outline" className="text-xs">
                            Analysis Schema
                          </Badge>
                        )}
                      </div>
                      {a.destinations.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3" />
                          Routes to: {a.destinations.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Configure Template */}
      {fetchedData && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Save as Template</CardTitle>
            <CardDescription>
              Set template metadata. This template can then be bulk-deployed to
              all clinics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">
                  Template Name (Internal) *
                </Label>
                <Input
                  id="templateName"
                  placeholder="dental-clinic-v1.1"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (e.g., dental-clinic-v1.1)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  placeholder="Dental Clinic Receptionist v1.1"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  className="w-full border rounded-md p-2 bg-background"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={pending}
                >
                  <option value="receptionist">Receptionist</option>
                  <option value="emergency">Emergency</option>
                  <option value="booking">Booking</option>
                  <option value="sales">Sales</option>
                  <option value="support">Support</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="version">Version *</Label>
                <Input
                  id="version"
                  placeholder="v1.1"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe changes from previous version..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={pending}
                className="rounded"
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Set as default template for new clinics
              </Label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {fetchedData && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              'Save Template'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
