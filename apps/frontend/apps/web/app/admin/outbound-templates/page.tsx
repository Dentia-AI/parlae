'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { Input } from '@kit/ui/input';
import {
  Loader2,
  RefreshCw,
  Save,
  PhoneOutgoing,
  Users,
  ArrowUpCircle,
  Undo2,
  ChevronDown,
  ChevronUp,
  Download,
  Sparkles,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

interface OutboundTemplate {
  id: string;
  agentGroup: string;
  name: string;
  retellAgentId: string | null;
  flowConfig: Record<string, unknown>;
  promptTemplates: Record<string, string>;
  voicemailMessages: Record<string, string>;
  smsTemplates: Record<string, string> | null;
  emailTemplates: Record<string, unknown> | null;
  isActive: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateData {
  templates: OutboundTemplate[];
  versionDistribution: Record<string, number>;
  activeAccounts: { patientCare: number; financial: number };
}

export default function OutboundTemplatesPage() {
  const { t } = useTranslation('common');
  const csrfToken = useCsrfToken();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TemplateData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<OutboundTemplate>>({});
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState('');
  const [rollbackTemplateId, setRollbackTemplateId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [seeding, setSeeding] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/outbound-templates');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch {
      toast.error(t('admin.outbound.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSeedFromBuiltIn = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/outbound-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ fromBuiltIn: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Seed failed' }));
        throw new Error(err.error);
      }
      toast.success('Outbound templates seeded from built-in prompts');
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const startEdit = (template: OutboundTemplate) => {
    setEditingId(template.id);
    setEditForm({
      name: template.name,
      promptTemplates: { ...template.promptTemplates },
      voicemailMessages: { ...template.voicemailMessages },
      flowConfig: template.flowConfig,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (bumpVersion: boolean) => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/outbound-templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          id: editingId,
          ...editForm,
          bumpVersion,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      toast.success(
        bumpVersion
          ? t('admin.outbound.savedWithVersion')
          : t('admin.outbound.saved'),
      );
      setEditingId(null);
      setEditForm({});
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkUpgrade = async (templateId: string) => {
    if (!confirm(t('admin.outbound.bulkUpgradeConfirm'))) return;
    setUpgrading(templateId);
    try {
      const res = await fetch('/api/admin/outbound-templates/bulk-upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bulk upgrade failed');
      toast.success(json.message);
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk upgrade failed');
    } finally {
      setUpgrading(null);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTemplateId || !rollbackVersion) return;
    if (!confirm(t('admin.outbound.rollbackConfirm', { version: rollbackVersion }))) return;
    setRollingBack(true);
    try {
      const res = await fetch('/api/admin/outbound-templates/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ templateId: rollbackTemplateId, targetVersion: rollbackVersion }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rollback failed');
      toast.success(json.message);
      setRollbackTemplateId(null);
      setRollbackVersion('');
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setRollingBack(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading && !data) {
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
            <PhoneOutgoing className="h-8 w-8" />
            {t('admin.outbound.title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('admin.outbound.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            {t('admin.outbound.refresh')}
          </Button>
          <Button onClick={handleSeedFromBuiltIn} disabled={seeding}>
            {seeding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Seed from Built-in
          </Button>
          <Link href="/admin/outbound-templates/fetch">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Fetch from Account
            </Button>
          </Link>
        </div>
      </div>

      {/* Version Distribution */}
      {data?.versionDistribution && Object.keys(data.versionDistribution).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('admin.outbound.versionDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.versionDistribution).map(([version, count]) => (
                <div key={version} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="font-mono">{version}</Badge>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {count} {count === 1 ? 'account' : 'accounts'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates */}
      {(!data?.templates || data.templates.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PhoneOutgoing className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              No outbound agent templates yet. Seed from the built-in prompts to get started.
            </p>
            <Button onClick={handleSeedFromBuiltIn} disabled={seeding}>
              {seeding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Seed from Built-in
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {data.templates.map((template) => {
            const isEditing = editingId === template.id;
            const activeCount =
              template.agentGroup === 'PATIENT_CARE'
                ? data.activeAccounts.patientCare
                : data.activeAccounts.financial;

            return (
              <Card key={template.id} className={cn(isEditing && 'ring-2 ring-primary')}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="secondary" className="font-mono">{template.version}</Badge>
                      <Badge variant={template.agentGroup === 'PATIENT_CARE' ? 'default' : 'outline'}>
                        {template.agentGroup === 'PATIENT_CARE' ? t('admin.outbound.patientCare') : t('admin.outbound.financial')}
                      </Badge>
                      {!template.isActive && (
                        <Badge variant="destructive">{t('admin.outbound.inactive')}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {activeCount} {t('admin.outbound.activeAccounts')}
                      </span>
                      {!isEditing ? (
                        <Button variant="outline" size="sm" onClick={() => startEdit(template)}>
                          {t('admin.outbound.edit')}
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          {t('admin.outbound.cancel')}
                        </Button>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                    {t('admin.outbound.lastUpdated')}: {new Date(template.updatedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isEditing ? (
                    <>
                      {/* Name */}
                      <div>
                        <label className="text-sm font-medium">{t('admin.outbound.templateName')}</label>
                        <Input
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                          className="mt-1"
                        />
                      </div>

                      {/* Prompt Templates */}
                      <div>
                        <button
                          className="flex items-center gap-2 text-sm font-medium"
                          onClick={() => toggleSection(`${template.id}-prompts`)}
                        >
                          {expandedSections[`${template.id}-prompts`] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {t('admin.outbound.promptTemplates')} ({Object.keys(editForm.promptTemplates || {}).length})
                        </button>
                        {expandedSections[`${template.id}-prompts`] && (
                          <div className="mt-2 space-y-3">
                            {Object.entries(editForm.promptTemplates || {}).map(([callType, prompt]) => (
                              <div key={callType}>
                                <label className="text-xs font-medium text-muted-foreground uppercase">{callType}</label>
                                <Textarea
                                  value={prompt}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      promptTemplates: {
                                        ...(prev.promptTemplates || {}),
                                        [callType]: e.target.value,
                                      },
                                    }))
                                  }
                                  rows={4}
                                  className="mt-1 font-mono text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Voicemail Messages */}
                      <div>
                        <button
                          className="flex items-center gap-2 text-sm font-medium"
                          onClick={() => toggleSection(`${template.id}-voicemail`)}
                        >
                          {expandedSections[`${template.id}-voicemail`] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {t('admin.outbound.voicemailMessages')} ({Object.keys(editForm.voicemailMessages || {}).length})
                        </button>
                        {expandedSections[`${template.id}-voicemail`] && (
                          <div className="mt-2 space-y-3">
                            {Object.entries(editForm.voicemailMessages || {}).map(([callType, msg]) => (
                              <div key={callType}>
                                <label className="text-xs font-medium text-muted-foreground uppercase">{callType}</label>
                                <Textarea
                                  value={msg}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      voicemailMessages: {
                                        ...(prev.voicemailMessages || {}),
                                        [callType]: e.target.value,
                                      },
                                    }))
                                  }
                                  rows={2}
                                  className="mt-1 font-mono text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Flow Config JSON */}
                      <div>
                        <button
                          className="flex items-center gap-2 text-sm font-medium"
                          onClick={() => toggleSection(`${template.id}-flow`)}
                        >
                          {expandedSections[`${template.id}-flow`] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {t('admin.outbound.flowConfig')}
                        </button>
                        {expandedSections[`${template.id}-flow`] && (
                          <Textarea
                            value={JSON.stringify(editForm.flowConfig, null, 2)}
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                setEditForm((prev) => ({ ...prev, flowConfig: parsed }));
                              } catch {
                                // Allow intermediate invalid JSON while typing
                              }
                            }}
                            rows={12}
                            className="mt-2 font-mono text-xs"
                          />
                        )}
                      </div>

                      {/* Save Buttons */}
                      <div className="flex items-center gap-3 pt-2">
                        <Button onClick={() => handleSave(false)} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Save className="h-4 w-4 mr-2" />
                          {t('admin.outbound.save')}
                        </Button>
                        <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {t('admin.outbound.saveAndBump')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Read-only summary */}
                      <div className="grid md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">{t('admin.outbound.promptTemplates')}</p>
                          <p className="font-medium">
                            {Object.keys(template.promptTemplates || {}).length} call types
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Object.keys(template.promptTemplates || {}).join(', ')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('admin.outbound.voicemailMessages')}</p>
                          <p className="font-medium">
                            {Object.keys(template.voicemailMessages || {}).length} messages
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('admin.outbound.flowConfig')}</p>
                          <p className="font-medium">
                            {template.flowConfig ? 'Configured' : 'Not configured'}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBulkUpgrade(template.id)}
                          disabled={!!upgrading}
                        >
                          {upgrading === template.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="h-4 w-4 mr-2" />
                          )}
                          {t('admin.outbound.bulkUpgrade')} ({activeCount})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRollbackTemplateId(template.id);
                            setRollbackVersion('');
                          }}
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          {t('admin.outbound.rollback')}
                        </Button>
                      </div>

                      {/* Rollback Form */}
                      {rollbackTemplateId === template.id && (
                        <div className="flex items-center gap-2 pt-2">
                          <Input
                            placeholder={t('admin.outbound.rollbackVersionPlaceholder')}
                            value={rollbackVersion}
                            onChange={(e) => setRollbackVersion(e.target.value)}
                            className="max-w-[200px]"
                          />
                          <Button
                            size="sm"
                            onClick={handleRollback}
                            disabled={rollingBack || !rollbackVersion}
                          >
                            {rollingBack && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {t('admin.outbound.confirmRollback')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRollbackTemplateId(null)}
                          >
                            {t('admin.outbound.cancel')}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
