'use client';

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';
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
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface PendingCampaignsBannerProps {
  pendingCount: number;
}

export function PendingCampaignsBanner({ pendingCount }: PendingCampaignsBannerProps) {
  const { t } = useTranslation('common');
  const getCsrfToken = useCsrfToken;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (pendingCount === 0) return null;

  function handleApproveAll() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/outbound/campaigns/approve-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to approve');
        }

        const data = await res.json();
        toast.success(
          t('outbound.approveAll.success', {
            count: data.approved,
            defaultValue: `${data.approved} campaign(s) approved`,
          }),
        );
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to approve campaigns');
      }
    });
  }

  return (
    <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-2 flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                {t('outbound.pendingBanner.title', {
                  count: pendingCount,
                  defaultValue: `${pendingCount} campaign(s) pending approval`,
                })}
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                {t('outbound.pendingBanner.description', 'Review contacts and approve to start calling')}
              </p>
            </div>
          </div>

          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="bg-green-600 text-white hover:bg-green-700 flex-shrink-0"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {t('outbound.approveAll.button', 'Approve All')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('outbound.approveAll.dialogTitle', 'Approve all pending campaigns?')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('outbound.approveAll.dialogDescription', {
                    count: pendingCount,
                    defaultValue: `This will activate ${pendingCount} campaign(s). Calls will begin within the next calling window.`,
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  {t('common:cancel', 'Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleApproveAll}
                  disabled={isPending}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  )}
                  {t('outbound.approveAll.confirm', 'Approve All')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
