'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Loader2, Save } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

export default function CreateTemplatePage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();
  const [templateName, setTemplateName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [category, setCategory] = useState('receptionist');
  const [isDefault, setIsDefault] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
            // Minimal config for manual creation
            squadConfig: { name: displayName, members: [] },
            assistantConfig: {},
            modelConfig: { provider: 'openai', model: 'gpt-4o', systemPrompt: '' },
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create template');
        }

        toast.success('Template created successfully');
        router.push(`/admin/agent-templates/${result.template.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to create template: ${errorMessage}`);
      }
    });
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Template</h1>
        <p className="text-muted-foreground mt-2">
          Create a new agent template manually or use "Fetch from Squad" to import from Vapi
        </p>
      </div>

      <Alert>
        <AlertDescription>
          <strong>Tip:</strong> For most cases, use the "Fetch from Squad" option to import
          configuration from an existing Vapi squad. This page is for creating empty templates
          that you'll configure later.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Template Information</CardTitle>
            <CardDescription>
              Basic template metadata and settings
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
                  required
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
                  required
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
                  required
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

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create Template
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
