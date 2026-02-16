'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  Loader2,
  Upload,
  File,
  AlertCircle,
  Eye,
  Trash2,
  ChevronDown,
  ChevronUp,
  Building2,
  Stethoscope,
  ShieldCheck,
  Users,
  ScrollText,
  HelpCircle,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'uploaded' | 'error';
  progress?: number;
  vapiFileId?: string;
}

interface CategoryState {
  files: UploadedFile[];
  expanded: boolean;
  dragActive: boolean;
}

// ---------------------------------------------------------------------------
// KB Categories — icons and i18n keys
// ---------------------------------------------------------------------------

const KB_CATEGORIES = [
  { id: 'clinic-info', labelKey: 'clinicInfo', descKey: 'clinicInfoDesc', examplesKey: 'clinicInfoExamples', icon: Building2 },
  { id: 'services', labelKey: 'services', descKey: 'servicesDesc', examplesKey: 'servicesExamples', icon: Stethoscope },
  { id: 'insurance', labelKey: 'insurance', descKey: 'insuranceDesc', examplesKey: 'insuranceExamples', icon: ShieldCheck },
  { id: 'providers', labelKey: 'providers', descKey: 'providersDesc', examplesKey: 'providersExamples', icon: Users },
  { id: 'policies', labelKey: 'policies', descKey: 'policiesDesc', examplesKey: 'policiesExamples', icon: ScrollText },
  { id: 'faqs', labelKey: 'faqs', descKey: 'faqsDesc', examplesKey: 'faqsExamples', icon: HelpCircle },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KnowledgeBaseManagementPage() {
  const csrfToken = useCsrfToken();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [queryToolId, setQueryToolId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Record<string, CategoryState>>(() => {
    const initial: Record<string, CategoryState> = {};
    for (const cat of KB_CATEGORIES) {
      initial[cat.id] = { files: [], expanded: false, dragActive: false };
    }
    return initial;
  });

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/knowledge');
      if (!res.ok) {
        if (res.status === 404) {
          setLoading(false);
          return;
        }
        throw new Error('Failed to load knowledge base');
      }

      const data = await res.json();
      setQueryToolId(data.queryToolId || null);

      const kbConfig: Record<string, string[]> = data.knowledgeBaseConfig || {};

      setCategories((prev) => {
        const next = { ...prev };
        for (const [catId, fileIds] of Object.entries(kbConfig)) {
          if (next[catId] && Array.isArray(fileIds)) {
            next[catId] = {
              ...next[catId]!,
              files: fileIds.map((fid: string) => ({
                id: fid,
                name: `File ${fid.slice(0, 8)}`,
                size: 0,
                status: 'uploaded' as const,
                vapiFileId: fid,
              })),
            };
          }
        }
        return next;
      });
    } catch {
      toast.error(t('common:setup.knowledge.failedToSave'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadKnowledge();
  }, [loadKnowledge]);

  const toggleCategory = (catId: string) => {
    setCategories((prev) => ({
      ...prev,
      [catId]: { ...prev[catId]!, expanded: !prev[catId]!.expanded },
    }));
  };

  const handleFileUpload = useCallback(
    async (catId: string, selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return;

      const newFiles: UploadedFile[] = Array.from(selectedFiles).map((file) => ({
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        status: 'uploading' as const,
        progress: 0,
      }));

      setCategories((prev) => ({
        ...prev,
        [catId]: { ...prev[catId]!, files: [...prev[catId]!.files, ...newFiles] },
      }));

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]!;
        const fileId = newFiles[i]!.id;

        try {
          setCategories((prev) => ({
            ...prev,
            [catId]: {
              ...prev[catId]!,
              files: prev[catId]!.files.map((f) =>
                f.id === fileId ? { ...f, progress: 50, status: 'uploading' as const } : f,
              ),
            },
          }));

          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/vapi/upload-file', {
            method: 'POST',
            headers: { 'x-csrf-token': csrfToken },
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Upload failed with status ${response.status}`);
          }

          const result = await response.json();

          setCategories((prev) => ({
            ...prev,
            [catId]: {
              ...prev[catId]!,
              files: prev[catId]!.files.map((f) =>
                f.id === fileId
                  ? { ...f, status: 'uploaded' as const, progress: 100, vapiFileId: result.fileId, name: file.name }
                  : f,
              ),
            },
          }));

          setHasChanges(true);
          toast.success(`${file.name} ${t('common:setup.knowledge.uploaded')}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          setCategories((prev) => ({
            ...prev,
            [catId]: {
              ...prev[catId]!,
              files: prev[catId]!.files.map((f) =>
                f.id === fileId ? { ...f, status: 'error' as const } : f,
              ),
            },
          }));
          toast.error(`${t('common:setup.knowledge.uploadError')}: ${file.name} — ${errorMessage}`);
        }
      }
    },
    [csrfToken, t],
  );

  const removeFile = async (catId: string, fileId: string, vapiFileId?: string) => {
    if (vapiFileId) {
      try {
        await fetch(`/api/vapi/delete-file/${vapiFileId}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken },
        });
      } catch {
        toast.error(t('common:setup.knowledge.failedToDelete'));
        return;
      }
    }

    setCategories((prev) => ({
      ...prev,
      [catId]: {
        ...prev[catId]!,
        files: prev[catId]!.files.filter((f) => f.id !== fileId),
      },
    }));
    setHasChanges(true);
    toast.success(t('common:setup.knowledge.fileRemoved'));
  };

  const viewFile = async (vapiFileId: string) => {
    try {
      const response = await fetch(`/api/vapi/get-file/${vapiFileId}`, {
        headers: { 'x-csrf-token': csrfToken },
      });
      if (!response.ok) throw new Error('Failed to get file URL');
      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch {
      toast.error(t('common:setup.knowledge.failedToView'));
    }
  };

  const handleDrag = (catId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isEntering = e.type === 'dragenter' || e.type === 'dragover';
    setCategories((prev) => ({
      ...prev,
      [catId]: { ...prev[catId]!, dragActive: isEntering },
    }));
  };

  const handleDrop = (catId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCategories((prev) => ({
      ...prev,
      [catId]: { ...prev[catId]!, dragActive: false },
    }));
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(catId, e.dataTransfer.files);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const knowledgeBaseConfig: Record<string, string[]> = {};
      for (const [catId, catState] of Object.entries(categories)) {
        const fileIds = catState.files
          .filter((f) => f.status === 'uploaded' && f.vapiFileId)
          .map((f) => f.vapiFileId!);
        if (fileIds.length > 0) {
          knowledgeBaseConfig[catId] = fileIds;
        }
      }

      const res = await fetch('/api/agent/knowledge', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ knowledgeBaseConfig }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || 'Failed to save');
      }

      const result = await res.json();
      setQueryToolId(result.queryToolId || null);
      setHasChanges(false);
      toast.success(
        t('common:setup.knowledge.kbUpdated', { count: result.totalFiles }),
      );
    } catch (err: any) {
      toast.error(err.message || t('common:setup.knowledge.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const totalUploadedFiles = Object.values(categories).reduce(
    (acc, cat) => acc + cat.files.filter((f) => f.status === 'uploaded').length,
    0,
  );

  const activeCategoryCount = Object.values(categories).filter(
    (c) => c.files.some((f) => f.status === 'uploaded'),
  ).length;

  if (loading) {
    return (
      <div className="container max-w-4xl py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <Trans i18nKey="common:setup.knowledge.manageTitle" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Trans i18nKey="common:setup.knowledge.manageDescription" />
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving
            ? <Trans i18nKey="common:setup.knowledge.saving" />
            : <Trans i18nKey="common:setup.knowledge.saveAndUpdate" />
          }
        </Button>
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/50 ring-1 ring-border/40 px-4 py-3">
        <div className="text-sm">
          <span className="font-medium text-primary">{totalUploadedFiles}</span>{' '}
          <span className="text-muted-foreground">
            {t('common:setup.knowledge.filesAcrossCategories', {
              count: totalUploadedFiles,
              categories: activeCategoryCount,
            })}
          </span>
        </div>
        {queryToolId && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <Trans i18nKey="common:setup.knowledge.queryToolActive" />
          </div>
        )}
        {hasChanges && (
          <div className="ml-auto text-xs text-amber-600 font-medium">
            <Trans i18nKey="common:setup.knowledge.unsavedChanges" />
          </div>
        )}
      </div>

      {/* Category sections */}
      <div className="space-y-3">
        {KB_CATEGORIES.map((cat) => {
          const state = categories[cat.id]!;
          const uploadedCount = state.files.filter((f) => f.status === 'uploaded').length;
          const Icon = cat.icon;

          return (
            <Card key={cat.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="rounded-lg bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {t(`common:setup.knowledge.categories.${cat.labelKey}`)}
                    </span>
                    {uploadedCount > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                        {uploadedCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {t(`common:setup.knowledge.categories.${cat.descKey}`)}
                  </p>
                </div>
                {state.expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>

              {state.expanded && (
                <CardContent className="pt-1 border-t border-border/30 space-y-3">
                  {/* Drop zone */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                      state.dragActive
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border/50 hover:border-border'
                    }`}
                    onDragEnter={(e) => handleDrag(cat.id, e)}
                    onDragLeave={(e) => handleDrag(cat.id, e)}
                    onDragOver={(e) => handleDrag(cat.id, e)}
                    onDrop={(e) => handleDrop(cat.id, e)}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        <Trans i18nKey="common:setup.knowledge.dropOrBrowse" />{' '}
                        <label
                          htmlFor={`kb-file-upload-${cat.id}`}
                          className="text-primary cursor-pointer underline underline-offset-2"
                        >
                          <Trans i18nKey="common:setup.knowledge.browse" />
                        </label>
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        <Trans i18nKey="common:setup.knowledge.fileFormats" />
                      </p>
                      <Input
                        type="file"
                        id={`kb-file-upload-${cat.id}`}
                        className="hidden"
                        multiple
                        accept=".pdf,.doc,.docx,.txt,.csv,.md,.json,.xml,.yaml"
                        onChange={(e) => handleFileUpload(cat.id, e.target.files)}
                      />
                    </div>
                  </div>

                  {/* Files in this category */}
                  {state.files.length > 0 && (
                    <div className="space-y-1.5">
                      {state.files.map((file) => (
                        <div key={file.id} className="rounded-lg bg-muted/30 ring-1 ring-border/30 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <File className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{file.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatFileSize(file.size)}
                                {file.status === 'uploading' && ` • ${file.progress}%`}
                                {file.status === 'uploaded' && file.size > 0 && ` • ${t('common:setup.knowledge.uploaded')}`}
                                {file.status === 'error' && ` • ${t('common:setup.knowledge.uploadFailed')}`}
                              </p>
                            </div>
                            {file.status === 'uploading' && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                            )}
                            {file.status === 'error' && (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                            )}
                            {file.status === 'uploaded' && file.vapiFileId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 flex-shrink-0"
                                onClick={() => viewFile(file.vapiFileId!)}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 flex-shrink-0"
                              onClick={() => removeFile(cat.id, file.id, file.vapiFileId)}
                              disabled={file.status === 'uploading'}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          {file.status === 'uploading' && file.progress !== undefined && (
                            <div className="mt-1.5 w-full bg-muted rounded-full h-0.5">
                              <div
                                className="bg-primary h-0.5 rounded-full transition-all"
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Example hints */}
                  <div className="text-[10px] text-muted-foreground/60">
                    <Trans i18nKey="common:setup.knowledge.examples" />{' '}
                    {t(`common:setup.knowledge.categories.${cat.examplesKey}`)}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Info box */}
      <Alert>
        <AlertDescription className="text-xs">
          <strong><Trans i18nKey="common:setup.knowledge.howItWorksLabel" /></strong>{' '}
          <Trans i18nKey="common:setup.knowledge.howItWorks" />
        </AlertDescription>
      </Alert>
    </div>
  );
}
