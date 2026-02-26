'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  Plus,
  RefreshCw,
  CheckCircle2,
  Users,
  Workflow,
  Sparkles,
  Download,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

interface FlowTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  isDefault: boolean;
  isActive: boolean;
  globalPrompt: string;
  nodePrompts: Record<string, string>;
  modelConfig: { model: string; type: string };
  createdAt: string;
  _count: { accounts: number };
}

export default function ConversationFlowTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/list');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      toast.error('Failed to load flow templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSeedFromBuiltIn = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromBuiltIn: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Seed failed' }));
        throw new Error(err.error);
      }
      toast.success('Default flow template seeded from built-in prompts');
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Workflow className="h-8 w-8" />
            Flow Templates
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage Retell conversation flow configurations (single agent, multi-node architecture)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Link href="/admin/retell-templates/conversation-flow/fetch">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Fetch from Account
            </Button>
          </Link>
          <Button onClick={handleSeedFromBuiltIn} disabled={seeding}>
            {seeding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Seed from Built-in
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Workflow className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              No conversation flow templates yet. Seed from the built-in prompts to get started.
            </p>
            <Button onClick={handleSeedFromBuiltIn} disabled={seeding}>
              {seeding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Seed Default Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/admin/retell-templates/conversation-flow/${template.id}`}
            >
              <Card className="cursor-pointer hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">
                        {template.displayName}
                      </CardTitle>
                      <Badge variant="secondary">{template.version}</Badge>
                      {template.isDefault && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                      {!template.isActive && (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {template._count.accounts} account
                      {template._count.accounts !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <CardDescription>
                    {template.description || template.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Nodes:{' '}
                      {Object.keys(template.nodePrompts || {}).join(', ')}
                    </span>
                    <span>
                      Model: {template.modelConfig?.model || 'gpt-4.1'}
                    </span>
                    <span>
                      Created:{' '}
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
