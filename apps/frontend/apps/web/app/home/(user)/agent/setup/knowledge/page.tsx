'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@kit/ui/button';
import { Stepper } from '@kit/ui/stepper';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
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
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';
import { useSetupProgress } from '../_lib/use-setup-progress';

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
// KB Categories — matches KB_CATEGORIES in template-utils.ts
// ---------------------------------------------------------------------------

const KB_CATEGORIES = [
  {
    id: 'clinic-info',
    label: 'Clinic Information',
    description: 'Business hours, location, directions, parking, contact details',
    icon: Building2,
    examples: ['Hours of operation', 'Address & directions', 'Parking info', 'Phone & email'],
  },
  {
    id: 'services',
    label: 'Services & Procedures',
    description: 'Dental services, treatments, pricing information',
    icon: Stethoscope,
    examples: ['Service menu & pricing', 'Treatment descriptions', 'Special offers'],
  },
  {
    id: 'insurance',
    label: 'Insurance & Coverage',
    description: 'Accepted plans, coverage policies, billing FAQs',
    icon: ShieldCheck,
    examples: ['Accepted insurance list', 'Coverage policies', 'Billing procedures'],
  },
  {
    id: 'providers',
    label: 'Doctors & Providers',
    description: 'Doctor biographies, specialties, credentials',
    icon: Users,
    examples: ['Doctor bios & photos', 'Specialties & certifications', 'Availability schedules'],
  },
  {
    id: 'policies',
    label: 'Office Policies',
    description: 'Cancellation rules, new patient requirements, payment terms',
    icon: ScrollText,
    examples: ['Cancellation & no-show policy', 'New patient forms', 'Payment terms'],
  },
  {
    id: 'faqs',
    label: 'FAQs',
    description: 'Common questions, preparation & aftercare instructions',
    icon: HelpCircle,
    examples: ['Common questions', 'Pre-visit preparation', 'Post-procedure care'],
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KnowledgeBasePage() {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const { t } = useTranslation();

  const [categories, setCategories] = useState<Record<string, CategoryState>>(() => {
    const initial: Record<string, CategoryState> = {};
    for (const cat of KB_CATEGORIES) {
      initial[cat.id] = { files: [], expanded: false, dragActive: false };
    }
    return initial;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [accountId, setAccountId] = useState<string>('');

  const { progress, saveKnowledge, isLoading } = useSetupProgress(accountId);

  useEffect(() => {
    const storedAccountId = sessionStorage.getItem('accountId');
    if (storedAccountId) {
      setAccountId(storedAccountId);
    }
  }, []);

  // Load saved categorized knowledge base files from database
  useEffect(() => {
    if (!progress?.knowledge?.data) return;

    const data = progress.knowledge.data as any;
    const categorizedFiles = data.categorizedFiles as Record<string, Array<{ id: string; name: string; size?: number }>> | undefined;

    if (categorizedFiles) {
      setCategories((prev) => {
        const next = { ...prev };
        for (const [catId, files] of Object.entries(categorizedFiles)) {
          if (next[catId] && Array.isArray(files)) {
            next[catId] = {
              ...next[catId],
              files: files.map((f) => ({
                id: f.id,
                name: f.name,
                size: f.size || 0,
                status: 'uploaded' as const,
                vapiFileId: f.id,
              })),
            };
          }
        }
        return next;
      });
    } else if (data.files && Array.isArray(data.files)) {
      // Legacy: flat file list — put all files in the first category
      const legacyFiles: UploadedFile[] = data.files.map((f: any) => ({
        id: f.id,
        name: f.name,
        size: f.size || 0,
        status: 'uploaded' as const,
        vapiFileId: f.id,
      }));
      if (legacyFiles.length > 0) {
        setCategories((prev) => ({
          ...prev,
          'clinic-info': { ...prev['clinic-info']!, files: legacyFiles, expanded: true, dragActive: false },
        }));
      }
    }
  }, [progress]);

  const handleStepClick = (stepIndex: number) => {
    const routes = [
      '/home/agent/setup',
      '/home/agent/setup/knowledge',
      '/home/agent/setup/integrations',
      '/home/agent/setup/phone',
      '/home/agent/setup/review',
    ];
    router.push(routes[stepIndex]!);
  };

  const toggleCategory = (catId: string) => {
    setCategories((prev) => ({
      ...prev,
      [catId]: { ...prev[catId]!, expanded: !prev[catId]!.expanded },
    }));
  };

  const handleFileUpload = useCallback(async (catId: string, selectedFiles: FileList | null) => {
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
                ? { ...f, status: 'uploaded' as const, progress: 100, vapiFileId: result.fileId }
                : f,
            ),
          },
        }));

        toast.success(`${file.name} uploaded`);
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
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
      }
    }
  }, [csrfToken]);

  const removeFile = async (catId: string, fileId: string, vapiFileId?: string) => {
    if (vapiFileId) {
      try {
        await fetch(`/api/vapi/delete-file/${vapiFileId}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken },
        });
      } catch (error) {
        console.error('Delete error:', error);
        toast.error('Failed to delete file');
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
    toast.success('File removed');
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
      toast.error('Failed to view file');
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

  const handleContinue = async () => {
    const selectedVoice = sessionStorage.getItem('selectedVoice');
    if (!selectedVoice) {
      toast.error(t('common:setup.knowledge.voiceNotFound'));
      return;
    }
    if (!accountId) {
      toast.error('Account ID not found. Please start from the beginning.');
      return;
    }

    try {
      setIsSaving(true);

      // Build categorized file data
      const categorizedFiles: Record<string, Array<{ id: string; name: string; size: number }>> = {};
      const allFiles: Array<{ id: string; name: string; size: number }> = [];

      for (const [catId, catState] of Object.entries(categories)) {
        const uploaded = catState.files
          .filter((f) => f.status === 'uploaded' && f.vapiFileId)
          .map((f) => ({ id: f.vapiFileId!, name: f.name, size: f.size }));

        if (uploaded.length > 0) {
          categorizedFiles[catId] = uploaded;
          allFiles.push(...uploaded);
        }
      }

      // Save to database (categorized format)
      await saveKnowledge({
        files: allFiles,
        categorizedFiles,
      });

      // Build knowledgeBaseConfig for sessionStorage (category → fileIds)
      const knowledgeBaseConfig: Record<string, string[]> = {};
      for (const [catId, files] of Object.entries(categorizedFiles)) {
        knowledgeBaseConfig[catId] = files.map((f) => f.id);
      }

      sessionStorage.setItem('knowledgeBaseFiles', JSON.stringify(allFiles));
      sessionStorage.setItem('knowledgeBaseConfig', JSON.stringify(knowledgeBaseConfig));

      const totalFiles = allFiles.length;
      if (totalFiles > 0) {
        toast.success(`${totalFiles} file(s) saved across ${Object.keys(categorizedFiles).length} categories`);
      } else {
        toast.success('Knowledge base progress saved');
      }

      router.push('/home/agent/setup/integrations');
    } catch (error) {
      console.error('Failed to save knowledge base:', error);
      toast.error('Failed to save knowledge base. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const totalUploadedFiles = Object.values(categories).reduce(
    (acc, cat) => acc + cat.files.filter((f) => f.status === 'uploaded').length,
    0,
  );

  const steps = [
    t('common:setup.steps.voice'),
    t('common:setup.steps.knowledge'),
    t('common:setup.steps.integrations'),
    t('common:setup.steps.phone'),
    t('common:setup.steps.review'),
  ];

  return (
    <div className="container max-w-4xl py-4 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          <Trans i18nKey="common:setup.knowledge.title" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload documents to train your AI receptionist. Organize by category for smarter, more targeted responses.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-6 flex-shrink-0">
        <Stepper steps={steps} currentStep={1} onStepClick={handleStepClick} />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-3 pb-4">
          {/* Summary banner */}
          {totalUploadedFiles > 0 && (
            <div className="rounded-lg bg-primary/5 ring-1 ring-primary/20 px-4 py-2.5 text-sm">
              <span className="font-medium text-primary">{totalUploadedFiles}</span>{' '}
              <span className="text-muted-foreground">
                file{totalUploadedFiles !== 1 ? 's' : ''} uploaded across{' '}
                {Object.values(categories).filter((c) => c.files.some((f) => f.status === 'uploaded')).length}{' '}
                categories
              </span>
            </div>
          )}

          {/* Category sections */}
          {KB_CATEGORIES.map((cat) => {
            const state = categories[cat.id]!;
            const uploadedCount = state.files.filter((f) => f.status === 'uploaded').length;
            const Icon = cat.icon;

            return (
              <div
                key={cat.id}
                className="rounded-xl bg-card shadow-sm ring-1 ring-border/40 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200"
              >
                {/* Category header — always visible */}
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
                      <span className="text-sm font-semibold">{cat.label}</span>
                      {uploadedCount > 0 && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                          {uploadedCount} file{uploadedCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                  </div>
                  {state.expanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {state.expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3">
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
                          Drop files here or{' '}
                          <label
                            htmlFor={`file-upload-${cat.id}`}
                            className="text-primary cursor-pointer underline underline-offset-2"
                          >
                            browse
                          </label>
                        </p>
                        <p className="text-[10px] text-muted-foreground/60">PDF, DOC, DOCX, TXT up to 10MB</p>
                        <Input
                          type="file"
                          id={`file-upload-${cat.id}`}
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
                                  {file.status === 'uploaded' && ' • Uploaded'}
                                  {file.status === 'error' && ' • Failed'}
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
                                  title="View file"
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
                                title="Remove file"
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

                    {/* Example docs hint */}
                    <div className="text-[10px] text-muted-foreground/60">
                      Examples: {cat.examples.join(' • ')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Info box */}
          <div className="rounded-xl bg-muted/30 p-4 text-xs text-muted-foreground">
            <strong className="text-foreground">How it works:</strong> Files across all categories are merged into a
            single knowledge base for your clinic. Organizing them by category helps keep things tidy — your AI
            receptionist will search the combined knowledge base for accurate answers. You can skip categories that don&apos;t apply.
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Navigation */}
      <div className="pt-4 border-t flex-shrink-0 bg-background">
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/home/agent/setup')}>
            <Trans i18nKey="common:setup.navigation.back" />
          </Button>
          <Button onClick={handleContinue} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <Trans i18nKey="common:setup.knowledge.continueToIntegrations" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
