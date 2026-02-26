'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Phone, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import Link from 'next/link';
import { changePhoneNumberAction } from '../setup/_lib/actions';
import { formatPhoneDisplay } from '~/lib/format-phone';

const MAX_PHONE_CHANGES = 5;

interface PhoneSetupCardProps {
  phoneNumber: string;
  displayPhone: string;
  integrationMethod: string;
  phoneChangeCount?: number;
}

export function PhoneSetupCard({ phoneNumber, displayPhone, integrationMethod, phoneChangeCount = 0 }: PhoneSetupCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  const integrationLabel = t(`agentOverview.integrationMethods.${integrationMethod}`, { defaultValue: integrationMethod });

  const handleChangeNumber = () => {
    startTransition(async () => {
      try {
        const result = await changePhoneNumberAction({});

        if (result.success) {
          toast.success(`Phone number changed to ${formatPhoneDisplay(result.phoneNumber)}`);
          setShowConfirm(false);
          router.refresh();
        } else {
          toast.error(result.error || 'Failed to change phone number');
        }
      } catch (error) {
        toast.error('Failed to change phone number');
        console.error(error);
      }
    });
  };

  const remaining = MAX_PHONE_CHANGES - phoneChangeCount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{t('agentOverview.phoneSetup')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <p className="text-sm text-muted-foreground">{t('agentOverview.phoneNumber')}</p>
            <p className="font-mono font-semibold">{displayPhone}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('agentOverview.integration')}</p>
            <p className="font-semibold">{integrationLabel}</p>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Link href="/home/agent/phone-settings">
            <Button variant="outline" size="sm" className="w-full">
              {t('agentOverview.managePhone')}
            </Button>
          </Link>

          {phoneChangeCount >= MAX_PHONE_CHANGES ? (
            <p className="text-xs text-center text-muted-foreground">
              {t('agentOverview.changeLimitReached')}
            </p>
          ) : !showConfirm ? (
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setShowConfirm(true)}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {t('agentOverview.changeNumber')}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground/60">
                {t('agentOverview.changesRemaining', { remaining, total: MAX_PHONE_CHANGES })}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {t('agentOverview.changeConfirmWarning', { number: displayPhone, remaining })}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={handleChangeNumber}
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {t('agentOverview.changing')}
                    </>
                  ) : (
                    t('agentOverview.confirm')
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowConfirm(false)}
                  disabled={pending}
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
