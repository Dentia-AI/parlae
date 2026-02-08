'use client';

import { AlertCircle } from 'lucide-react';
import { useTransition } from 'react';

import { Button } from '@kit/ui/button';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Trans } from '@kit/ui/trans';

type ImpersonationBannerProps = {
  adminEmail: string;
  targetEmail: string;
  onStop: () => Promise<void>;
};

export function ImpersonationBanner({ adminEmail, targetEmail, onStop }: ImpersonationBannerProps) {
  const [pending, startTransition] = useTransition();

  console.log('[ImpersonationBanner] Rendering with:', { adminEmail, targetEmail });

  return (
    <Alert variant="default" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
      <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
      <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
        <span className="text-sm break-words">
          <Trans
            i18nKey={'admin:impersonatingUser'}
            defaults={'You are impersonating {{targetEmail}} as admin {{adminEmail}}'}
            values={{ targetEmail, adminEmail }}
          />
        </span>
        <form
          action={() => {
            startTransition(async () => {
              await onStop();
            });
          }}
          className="flex-shrink-0"
        >
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
            className="bg-white dark:bg-gray-900"
          >
            <Trans i18nKey={'admin:stopImpersonation'} defaults={'Return to Admin'} />
          </Button>
        </form>
      </AlertDescription>
    </Alert>
  );
}
