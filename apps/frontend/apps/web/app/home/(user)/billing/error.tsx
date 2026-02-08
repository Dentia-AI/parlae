'use client';

import Link from 'next/link';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Trans } from '@kit/ui/trans';

import pathsConfig from '~/config/paths.config';

export default function PersonalAccountBillingErrorPage() {
  return (
    <div className={'flex flex-1 items-center justify-center py-16'}>
      <Card className="max-w-md text-center">
        <CardHeader className="space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <CardTitle>
            <Trans
              i18nKey="billing:planPickerAlertErrorTitle"
              defaults="We couldn’t complete your checkout"
            />
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="billing:planPickerAlertErrorDescription"
              defaults="Please try again or reach out to support if the issue persists."
            />
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild variant="default">
              <Link href={pathsConfig.app.personalAccountBilling}>
                <Trans i18nKey="common:goBack" defaults="Go back" />
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link href="/contact">
                <Trans i18nKey="common:contactUs" defaults="Contact us" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
