'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Loader2, Upload, File, X, AlertCircle } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import { uploadKnowledgeBaseAction } from '../_lib/actions';

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

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pending, startTransition] = useTransition();
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    // No need to check for phone number anymore
  }, [router]);

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

        toast.success(`${file.name} uploaded successfully`);
      } catch (error) {
        console.error('Upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, status: 'error' } : f
        ));
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
      }
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
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

  const handleContinue = () => {
    const selectedVoice = sessionStorage.getItem('selectedVoice');
    
    if (!selectedVoice) {
      toast.error('Voice selection not found. Please go back to step 1.');
      return;
    }

    // Get only successfully uploaded files with Vapi file IDs
    const uploadedFiles = files
      .filter(f => f.status === 'uploaded' && f.vapiFileId)
      .map(f => ({
        id: f.vapiFileId,
        name: f.name,
        size: f.size,
      }));

    // Store files with Vapi IDs
    sessionStorage.setItem('knowledgeBaseFiles', JSON.stringify(uploadedFiles));
    
    if (uploadedFiles.length > 0) {
      toast.success(`${uploadedFiles.length} file(s) ready for deployment`);
    }
    
    router.push(`/home/agent/setup/integrations`);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-muted-foreground mt-2">
          Upload documents to train your AI receptionist
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <Stepper
          steps={['Voice Selection', 'Knowledge Base', 'Integrations', 'Phone Integration', 'Review & Launch']}
          currentStep={1}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Knowledge Base</CardTitle>
          <CardDescription>
            Upload documents about your services, hours, policies, and FAQs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-muted p-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-medium mb-1">
                  Drop files here or click to upload
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF, DOC, DOCX, TXT files up to 10MB each
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
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                Select Files
              </Button>
            </div>
          </div>

          {/* Uploaded Files List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Uploaded Files ({files.length})
              </Label>
              <div className="space-y-2">
                {files.map((file) => (
                  <Card key={file.id} className="p-3">
                    <div className="flex items-center gap-3">
                      <File className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                          {file.status === 'uploading' && ` • ${file.progress}%`}
                          {file.status === 'uploaded' && ' • Uploaded'}
                          {file.status === 'error' && ' • Upload failed'}
                        </p>
                      </div>
                      {file.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {file.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        disabled={file.status === 'uploading'}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {file.status === 'uploading' && file.progress !== undefined && (
                      <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Alert>
            <AlertDescription>
              <strong>Tip:</strong> Upload documents like:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Business hours and location info</li>
                <li>Services offered and pricing</li>
                <li>Frequently asked questions (FAQs)</li>
                <li>Appointment booking policies</li>
                <li>Insurance and payment information</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => router.push(`/home/agent/setup`)}
            >
              Back
            </Button>
            <Button
              onClick={handleContinue}
            >
              Continue to Integrations
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
