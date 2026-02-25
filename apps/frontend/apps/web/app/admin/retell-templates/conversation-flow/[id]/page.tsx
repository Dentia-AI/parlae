'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Textarea } from '@kit/ui/textarea';
import {
  Loader2,
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertCircle,
  Workflow,
  Settings,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';

interface FlowTemplateDetail {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  isDefault: boolean;
  isActive: boolean;
  globalPrompt: string;
  nodePrompts: Record<string, string>;
  nodeTools: Record<string, string[]>;
  edgeConfig: Record<string, Array<{ condition: string; destination: string }>>;
  modelConfig: { model: string; type: string };
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  _count: { accounts: number };
}

const NODE_LABELS: Record<string, string> = {
  receptionist: 'Receptionist',
  booking: 'Booking',
  appt_mgmt: 'Appointment Management',
  patient_records: 'Patient Records',
  insurance_billing: 'Insurance & Billing',
  emergency: 'Emergency',
  faq: 'FAQ',
};

export default function FlowTemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<FlowTemplateDetail | null>(null);
  const [editedGlobalPrompt, setEditedGlobalPrompt] = useState('');
  const [editedNodePrompts, setEditedNodePrompts] = useState<Record<string, string>>({});
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplate();
  }, [templateId]);

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/list');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const found = (data.templates || []).find((t: any) => t.id === templateId);
      if (!found) {
        toast.error('Template not found');
        router.push('/admin/retell-templates/conversation-flow');
        return;
      }
      setTemplate(found);
      setEditedGlobalPrompt(found.globalPrompt);
      setEditedNodePrompts(found.nodePrompts || {});
    } catch {
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          globalPrompt: editedGlobalPrompt,
          nodePrompts: editedNodePrompts,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error);
      }
      toast.success('Template updated');
      fetchTemplate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDefault = async () => {
    if (!template) return;
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          isDefault: !template.isDefault,
        }),
      });
      if (!res.ok) throw new Error('Failed to toggle default');
      toast.success(template.isDefault ? 'Removed as default' : 'Set as default');
      fetchTemplate();
    } catch {
      toast.error('Failed to update default status');
    }
  };

  const handleToggleActive = async () => {
    if (!template) return;
    try {
      const res = await fetch('/api/admin/retell-templates/conversation-flow/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          isActive: !template.isActive,
        }),
      });
      if (!res.ok) throw new Error('Failed to toggle active');
      toast.success(template.isActive ? 'Deactivated' : 'Activated');
      fetchTemplate();
    } catch {
      toast.error('Failed to update active status');
    }
  };

  if (loading || !template) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const nodeIds = Object.keys(editedNodePrompts);
  const hasChanges =
    editedGlobalPrompt !== template.globalPrompt ||
    JSON.stringify(editedNodePrompts) !== JSON.stringify(template.nodePrompts);

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/retell-templates/conversation-flow">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Workflow className="h-6 w-6" />
              {template.displayName}
              <Badge variant="secondary">{template.version}</Badge>
              {template.isDefault && (
                <Badge className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Default
                </Badge>
              )}
              {!template.isActive && (
                <Badge variant="destructive">Inactive</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {template._count.accounts} account{template._count.accounts !== 1 ? 's' : ''} using this template
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToggleActive}>
            {template.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleDefault}>
            {template.isDefault ? 'Remove Default' : 'Set as Default'}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Model Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Model Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Model</div>
              <div className="font-mono">{template.modelConfig?.model || 'gpt-4.1'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Type</div>
              <div className="font-mono">{template.modelConfig?.type || 'cascading'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Created</div>
              <div>{new Date(template.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Prompt</CardTitle>
          <CardDescription>
            Rules that apply across all conversation nodes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editedGlobalPrompt}
            onChange={(e) => setEditedGlobalPrompt(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Node Prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Node Prompts</CardTitle>
          <CardDescription>
            Per-node instructions for each conversation node ({nodeIds.length} nodes)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {nodeIds.map((nodeId) => {
            const isExpanded = expandedNode === nodeId;
            const tools = template.nodeTools?.[nodeId] || [];
            const edges = template.edgeConfig?.[nodeId] || [];

            return (
              <div key={nodeId} className="border rounded-lg">
                <button
                  onClick={() => setExpandedNode(isExpanded ? null : nodeId)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{nodeId}</Badge>
                    <span className="font-medium">
                      {NODE_LABELS[nodeId] || nodeId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{tools.length} tools</span>
                    <span>{edges.length} edges</span>
                    <span>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t p-4 space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Prompt
                      </label>
                      <Textarea
                        value={editedNodePrompts[nodeId] || ''}
                        onChange={(e) =>
                          setEditedNodePrompts((prev) => ({
                            ...prev,
                            [nodeId]: e.target.value,
                          }))
                        }
                        rows={10}
                        className="font-mono text-sm"
                      />
                    </div>

                    {tools.length > 0 && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Tools
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {tools.map((tool) => (
                            <Badge key={tool} variant="secondary" className="font-mono text-xs">
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {edges.length > 0 && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Edges ({edges.length})
                        </label>
                        <div className="space-y-1.5">
                          {edges.map((edge, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs bg-muted/50 rounded p-2"
                            >
                              <Badge variant="outline" className="shrink-0">
                                → {edge.destination}
                              </Badge>
                              <span className="text-muted-foreground">
                                {edge.condition}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Save button (bottom) */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
