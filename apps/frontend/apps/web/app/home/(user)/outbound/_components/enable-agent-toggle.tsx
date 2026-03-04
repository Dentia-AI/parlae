'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@kit/ui/switch';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';

interface EnableAgentToggleProps {
  accountId: string;
  group: 'PATIENT_CARE' | 'FINANCIAL';
  enabled: boolean;
  pmsConnected?: boolean;
}

export function EnableAgentToggle({
  accountId,
  group,
  enabled: initialEnabled,
  pmsConnected = true,
}: EnableAgentToggleProps) {
  const { t } = useTranslation('common');
  const getCsrfToken = useCsrfToken;
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const agentLabel = group === 'PATIENT_CARE'
    ? t('outbound.toggle.patientCareAgent')
    : t('outbound.toggle.financialAgent');

  const persistToggle = (checked: boolean) => {
    setEnabled(checked);

    startTransition(async () => {
      try {
        const res = await fetch('/api/outbound/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify({
            action: checked ? 'enable' : 'disable',
            group,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update settings');
        }

        toast.success(
          checked
            ? t('outbound.toggle.enabled', { agent: agentLabel })
            : t('outbound.toggle.disabled', { agent: agentLabel }),
        );

        router.refresh();
      } catch {
        setEnabled(!checked);
        toast.error(t('outbound.toggle.error'));
      }
    });
  };

  const handleToggle = (checked: boolean) => {
    if (!checked) {
      setShowConfirm(true);
      return;
    }
    persistToggle(true);
  };

  const confirmDisable = () => {
    setShowConfirm(false);
    persistToggle(false);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Label htmlFor={`toggle-${group}`} className="text-sm text-muted-foreground">
          {agentLabel}
        </Label>
        <Switch
          id={`toggle-${group}`}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isPending || !pmsConnected}
        />
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('outbound.toggle.disableTitle', 'Disable {{agent}}?', { agent: agentLabel })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'outbound.toggle.disableDescription',
                'This will stop all {{agent}} campaigns from being generated. Existing active campaigns will continue until they complete.',
                { agent: agentLabel.toLowerCase() },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common:common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisable}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('outbound.toggle.confirmDisable', 'Disable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
