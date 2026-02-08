'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
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
        const response = await fetch('/api/admin/agent-templates/fetch-squad', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include', // Important: Include credentials for session
          body: JSON.stringify({ squadId: squadId.trim() }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch squad');
        }

        setFetchedData(result);
        toast.success('Squad fetched successfully');

        // Auto-populate fields
        if (!templateName) {
          const autoName = `${category}-${version || 'v1'}`;
          setTemplateName(autoName);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
            squadConfig: fetchedData.squad,
            assistantConfig: fetchedData.assistant,
            toolsConfig: fetchedData.tools,
            modelConfig: fetchedData.model,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create template');
        }

        toast.success('Template created successfully');
        router.push('/admin/agent-templates');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to save: ${errorMessage}`);
      }
    });
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fetch Template from Squad</h1>
        <p className="text-muted-foreground mt-2">
          Import configuration from an existing Vapi squad
        </p>
      </div>

      {/* Step 1: Fetch Squad */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Fetch Squad Configuration</CardTitle>
          <CardDescription>
            Enter a Vapi Squad ID to import its configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="squadId">Squad ID</Label>
            <div className="flex gap-2">
              <Input
                id="squadId"
                placeholder="squad-abc123..."
                value={squadId}
                onChange={(e) => setSquadId(e.target.value)}
                disabled={pending}
              />
              <Button onClick={handleFetch} disabled={pending || !squadId.trim()}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Fetch
              </Button>
            </div>
          </div>

          {fetchError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}

          {fetchedData && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Successfully fetched squad configuration with {fetchedData.assistantCount || 0} assistant(s)
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Configure Template */}
      {fetchedData && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Configure Template</CardTitle>
            <CardDescription>
              Set template metadata and naming
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
                  placeholder="receptionist-v1"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  Alphanumeric identifier (e.g., receptionist-v1, emergency-v2)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  placeholder="Receptionist v1"
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
                  className="w-full border rounded-md p-2"
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
                  placeholder="v1"
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
                placeholder="Describe what this template does and when to use it..."
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
