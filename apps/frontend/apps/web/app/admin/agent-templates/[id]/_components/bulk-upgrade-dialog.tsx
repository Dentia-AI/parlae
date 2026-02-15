'use client';

import { useState, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Badge } from '@kit/ui/badge';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  ArrowUpCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface BulkUpgradeDialogProps {
  templateId: string;
  templateName: string;
  templateVersion: string;
  clinicCount: number;
}

type PlanEntry = {
  accountId: string;
  accountName: string | null;
  currentVersion: string | null;
  currentTemplate: string | null;
  targetVersion: string;
  targetTemplate: string;
  status: string;
  reason?: string;
};

type MigrationWarning = {
  type: string;
  severity: 'info' | 'warning' | 'breaking';
  assistant?: string;
  message: string;
};

type MigrationReport = {
  fromVersion: string;
  toVersion: string;
  isBreaking: boolean;
  warnings: MigrationWarning[];
  summary: string;
};

type UpgradeResult = {
  dryRun: boolean;
  plan: PlanEntry[];
  summary: {
    total: number;
    upgraded?: number;
    willUpgrade?: number;
    skipped?: number;
    willSkip?: number;
    failed?: number;
  };
  migration?: MigrationReport;
};

export function BulkUpgradeDialog({
  templateId,
  templateName,
  templateVersion,
  clinicCount,
}: BulkUpgradeDialogProps) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'confirm' | 'preview' | 'result'>('confirm');
  const [previewData, setPreviewData] = useState<UpgradeResult | null>(null);
  const [resultData, setResultData] = useState<UpgradeResult | null>(null);
  const [force, setForce] = useState(false);

  const handleDryRun = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/agent-templates/bulk-upgrade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            templateId,
            dryRun: true,
            force,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to preview upgrade');
        }

        setPreviewData(data);
        setStep('preview');
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to preview upgrade',
        );
      }
    });
  };

  const handleExecute = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/agent-templates/bulk-upgrade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            templateId,
            dryRun: false,
            force,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Bulk upgrade failed');
        }

        setResultData(data);
        setStep('result');
        toast.success(
          `Upgraded ${data.summary.upgraded} clinic(s) to ${templateVersion}`,
        );
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Bulk upgrade failed',
        );
      }
    });
  };

  const handleClose = () => {
    setOpen(false);
    setStep('confirm');
    setPreviewData(null);
    setResultData(null);
    setForce(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="default">
          <ArrowUpCircle className="h-4 w-4 mr-2" />
          Bulk Upgrade All Clinics
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>Bulk Upgrade Clinics</DialogTitle>
              <DialogDescription>
                Upgrade all eligible clinics to{' '}
                <strong>{templateName}</strong> ({templateVersion}).
                This will re-create their Vapi squads with the new configuration.
              </DialogDescription>
            </DialogHeader>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This action will replace existing Vapi squads for each clinic.
                The old squad will be deleted and a new one created. Upgrade
                history is preserved for rollback.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id="force"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="force" className="text-sm cursor-pointer">
                Force upgrade (include clinics already on this version)
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleDryRun} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                )}
                Preview Upgrade Plan
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'preview' && previewData && (
          <>
            <DialogHeader>
              <DialogTitle>Upgrade Preview</DialogTitle>
              <DialogDescription>
                Review the upgrade plan before executing.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-4 py-2">
              <div className="text-center p-3 bg-muted rounded-md">
                <div className="text-2xl font-bold">{previewData.summary.total}</div>
                <div className="text-xs text-muted-foreground">Total Clinics</div>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-md">
                <div className="text-2xl font-bold text-green-600">
                  {previewData.summary.willUpgrade}
                </div>
                <div className="text-xs text-muted-foreground">Will Upgrade</div>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-md">
                <div className="text-2xl font-bold text-yellow-600">
                  {previewData.summary.willSkip}
                </div>
                <div className="text-xs text-muted-foreground">Will Skip</div>
              </div>
            </div>

            {/* Migration Warnings */}
            {previewData.migration &&
              previewData.migration.warnings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Migration Notes</p>
                  {previewData.migration.isBreaking && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {previewData.migration.summary}
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="max-h-32 overflow-y-auto space-y-1 border rounded-md p-2">
                    {previewData.migration.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs p-1"
                      >
                        {w.severity === 'breaking' && (
                          <XCircle className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                        )}
                        {w.severity === 'warning' && (
                          <AlertTriangle className="h-3 w-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        {w.severity === 'info' && (
                          <CheckCircle2 className="h-3 w-3 text-blue-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span className="text-muted-foreground">
                          {w.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="max-h-60 overflow-y-auto space-y-2 border rounded-md p-2">
              {previewData.plan.map((entry) => (
                <div
                  key={entry.accountId}
                  className="flex items-center justify-between p-2 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {entry.accountName || entry.accountId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.currentVersion || 'No version'} → {entry.targetVersion}
                    </p>
                  </div>
                  <Badge
                    variant={entry.status === 'pending' ? 'default' : 'secondary'}
                  >
                    {entry.status === 'pending' ? 'Will Upgrade' : 'Skip'}
                  </Badge>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('confirm')}>
                Back
              </Button>
              <Button
                onClick={handleExecute}
                disabled={
                  pending || (previewData.summary.willUpgrade ?? 0) === 0
                }
                variant="destructive"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                )}
                Execute Upgrade ({previewData.summary.willUpgrade} clinics)
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'result' && resultData && (
          <>
            <DialogHeader>
              <DialogTitle>Upgrade Complete</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-4 gap-3 py-2">
              <div className="text-center p-3 bg-muted rounded-md">
                <div className="text-xl font-bold">{resultData.summary.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-md">
                <div className="text-xl font-bold text-green-600">
                  {resultData.summary.upgraded}
                </div>
                <div className="text-xs text-muted-foreground">Upgraded</div>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-md">
                <div className="text-xl font-bold text-yellow-600">
                  {resultData.summary.skipped}
                </div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-md">
                <div className="text-xl font-bold text-red-600">
                  {resultData.summary.failed}
                </div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 border rounded-md p-2">
              {resultData.plan.map((entry) => (
                <div
                  key={entry.accountId}
                  className="flex items-center justify-between p-2 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {entry.accountName || entry.accountId}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-muted-foreground">{entry.reason}</p>
                    )}
                  </div>
                  {entry.status === 'upgraded' && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  {entry.status === 'skipped' && (
                    <SkipForward className="h-4 w-4 text-yellow-600" />
                  )}
                  {entry.status === 'failed' && (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
