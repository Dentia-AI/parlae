'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@kit/ui/switch';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface AutoApproveToggleProps {
  enabled: boolean;
}

export function AutoApproveToggle({ enabled: initialEnabled }: AutoApproveToggleProps) {
  const { t } = useTranslation('common');
  const csrfToken = useCsrfToken();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);

    startTransition(async () => {
      try {
        const res = await fetch('/api/outbound/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            action: 'setAutoApprove',
            value: checked,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update');
        }

        toast.success(
          checked
            ? t('outbound.autoApprove.enabled', 'Auto-approve enabled — campaigns will start automatically')
            : t('outbound.autoApprove.disabled', 'Auto-approve disabled — campaigns will require approval'),
        );
        router.refresh();
      } catch {
        setEnabled(!checked);
        toast.error(t('outbound.autoApprove.error', 'Failed to update auto-approve setting'));
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="toggle-auto-approve" className="text-sm text-muted-foreground">
        {t('outbound.autoApprove.label', 'Auto-approve campaigns')}
      </Label>
      <Switch
        id="toggle-auto-approve"
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  );
}
