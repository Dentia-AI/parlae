'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useTransition } from 'react';
import { Button } from '@kit/ui/button';
// Card components replaced with softer section styling
import { Stepper } from '@kit/ui/stepper';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Loader2, Upload, File, X, AlertCircle, Eye, Trash2 } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { uploadKnowledgeBaseAction } from '../_lib/actions';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';
import { useSetupProgress } from '../_lib/use-setup-progress';

interface UploadedFile {
  id: string; // This will be the Vapi file ID
  name: string;
  size: number;
  status: 'uploading' | 'uploaded' | 'error';
  progress?: number;
  vapiFileId?: string; // Store the Vapi file ID
}

export default function KnowledgeBasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const csrfToken = useCsrfToken();
  const { t } = useTranslation();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pending, startTransition] = useTransition();
  const [dragActive, setDragActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [accountId, setAccountId] = useState<string>('');

  const { progress, saveKnowledge, isLoading } = useSetupProgress(accountId);

  useEffect(() => {
    // Get accountId from sessionStorage
    const storedAccountId = sessionStorage.getItem('accountId');
    if (storedAccountId) {
      setAccountId(storedAccountId);
    }
  }, []);

  // Load saved knowledge base files from database
  useEffect(() => {
    if (progress?.knowledge?.data?.files && Array.isArray(progress.knowledge.data.files)) {
      const savedFiles: UploadedFile[] = progress.knowledge.data.files.map((file: any) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        status: 'uploaded' as const,
        vapiFileId: file.id,
      }));
      setFiles(savedFiles);
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
    router.push(routes[stepIndex]);
  };

  const handleFileChange = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = Array.from(selectedFiles).map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Upload files one by one to Vapi
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const fileId = newFiles[i].id;

      try {
        // Update progress to show uploading
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, progress: 50, status: 'uploading' } : f
        ));

        // Upload to Vapi via API
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/vapi/upload-file', {
          method: 'POST',
          headers: {
            'x-csrf-token': csrfToken,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Upload error:', errorData);
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const result = await response.json();

        // Mark as uploaded with Vapi file ID
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { ...f, status: 'uploaded', progress: 100, vapiFileId: result.fileId } 
            : f
        ));

        toast.success(`${file.name} ${t('common:setup.knowledge.uploadSuccess')}`);
      } catch (error) {
        console.error('Upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, status: 'error' } : f
        ));
        toast.error(`${t('common:setup.knowledge.uploadError')} ${file.name}: ${errorMessage}`);
      }
    }
  };

  const removeFile = async (fileId: string, vapiFileId?: string) => {
    if (!vapiFileId) {
      // File not yet uploaded to Vapi, just remove from UI
      setFiles(prev => prev.filter(f => f.id !== fileId));
      return;
    }

    try {
      // Delete from Vapi
      const response = await fetch(`/api/vapi/delete-file/${vapiFileId}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete file from Vapi');
      }

      // Remove from UI
      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success(t('common:setup.knowledge.fileDeleted'));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('common:setup.knowledge.deleteError'));
    }
  };

  const viewFile = async (vapiFileId: string, fileName: string) => {
    try {
      // Get file URL from Vapi
      const response = await fetch(`/api/vapi/get-file/${vapiFileId}`, {
        headers: {
          'x-csrf-token': csrfToken,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get file URL');
      }

      const data = await response.json();
      
      // Open file in new tab
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('File URL not available');
      }
    } catch (error) {
      console.error('View file error:', error);
      toast.error('Failed to view file');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files);
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

      // Get only successfully uploaded files with Vapi file IDs
      const uploadedFiles = files
        .filter(f => f.status === 'uploaded' && f.vapiFileId)
        .map(f => ({
          id: f.vapiFileId!,
          name: f.name,
          size: f.size,
        }));

      // Save to database (saveKnowledge expects array directly, not wrapped in object)
      await saveKnowledge(uploadedFiles);

      // Also store in sessionStorage for backward compatibility
      sessionStorage.setItem('knowledgeBaseFiles', JSON.stringify(uploadedFiles));
      
      if (uploadedFiles.length > 0) {
        toast.success(`${uploadedFiles.length} ${t('common:setup.knowledge.filesReady')}`);
      } else {
        toast.success('Knowledge base progress saved');
      }
      
      router.push(`/home/agent/setup/integrations`);
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
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const steps = [
    t('common:setup.steps.voice'),
    t('common:setup.steps.knowledge'),
    t('common:setup.steps.integrations'),
    t('common:setup.steps.phone'),
    t('common:setup.steps.review'),
  ];

  return (
    <div className="container max-w-4xl py-4 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header - Compact */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          <Trans i18nKey="common:setup.knowledge.title" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <Trans i18nKey="common:setup.knowledge.description" />
        </p>
      </div>

      {/* Progress Steps - Compact */}
      <div className="mb-6 flex-shrink-0">
        <Stepper
          steps={steps}
          currentStep={1}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Scrollable Content Area with Fade */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4">
        <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/40 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="px-5 py-4 border-b border-border/30">
            <h2 className="text-base font-semibold">
              <Trans i18nKey="common:setup.knowledge.pageTitle" defaults="Step 2: Knowledge Base" />
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              <Trans i18nKey="common:setup.knowledge.cardDescription" defaults="Upload documents about your services, hours, policies, and FAQs" />
            </p>
          </div>
          <div className="p-5 space-y-4">
            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                dragActive 
                  ? 'border-primary bg-primary/5 shadow-sm' 
                  : 'border-border/50 hover:border-border'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-muted p-3">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-base font-medium mb-1">
                    <Trans i18nKey="common:setup.knowledge.dropFilesHere" />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Trans i18nKey="common:setup.knowledge.supportedFormats" />
                  </p>
                </div>
                <Input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => handleFileChange(e.target.files)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <Trans i18nKey="common:setup.knowledge.selectFiles" />
                </Button>
              </div>
            </div>

            {/* Uploaded Files List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  <Trans i18nKey="common:setup.knowledge.uploadedFiles" /> ({files.length})
                </Label>
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file.id} className="rounded-lg bg-muted/30 ring-1 ring-border/30 p-2.5">
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                            {file.status === 'uploading' && ` • ${file.progress}%`}
                            {file.status === 'uploaded' && ` • ${t('common:setup.knowledge.uploaded')}`}
                            {file.status === 'error' && ` • ${t('common:setup.knowledge.uploadFailed')}`}
                          </p>
                        </div>
                        {file.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                        )}
                        {file.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                        {file.status === 'uploaded' && file.vapiFileId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewFile(file.vapiFileId!, file.name)}
                            className="flex-shrink-0"
                            title="View file"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id, file.vapiFileId)}
                          disabled={file.status === 'uploading'}
                          className="flex-shrink-0"
                          title="Delete file"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {file.status === 'uploading' && file.progress !== undefined && (
                        <div className="mt-2 w-full bg-muted rounded-full h-1">
                          <div
                            className="bg-primary h-1 rounded-full transition-all"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-muted/30 p-4">
              <div className="text-xs">
                <strong><Trans i18nKey="common:setup.knowledge.tipTitle" /></strong> Upload documents like:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li><Trans i18nKey="common:setup.knowledge.tipItems.hours" /></li>
                  <li><Trans i18nKey="common:setup.knowledge.tipItems.services" /></li>
                  <li><Trans i18nKey="common:setup.knowledge.tipItems.faqs" /></li>
                  <li><Trans i18nKey="common:setup.knowledge.tipItems.policies" /></li>
                  <li><Trans i18nKey="common:setup.knowledge.tipItems.insurance" /></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        </div>
        {/* Fade effect at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Navigation - Fixed at bottom */}
      <div className="pt-4 border-t flex-shrink-0 bg-background">
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/home/agent/setup`)}
          >
            <Trans i18nKey="common:setup.navigation.back" />
          </Button>
          <Button
            onClick={handleContinue}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : <Trans i18nKey="common:setup.knowledge.continueToIntegrations" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
