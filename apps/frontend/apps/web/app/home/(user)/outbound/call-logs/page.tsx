import { Suspense } from 'react';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { OutboundCallLogsTable } from './_components/outbound-call-logs-table';

export const metadata = {
  title: 'Outbound Call Logs',
  description: 'View call records from outbound campaigns',
};

export default function OutboundCallLogsPage() {
  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-shrink-0 pb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            <Trans i18nKey="common:outbound.callLogs.pageTitle" defaults="Outbound Call Logs" />
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            <Trans
              i18nKey="common:outbound.callLogs.pageDescription"
              defaults="View call records from your outbound campaigns"
            />
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          <OutboundCallLogsTable />
        </Suspense>
      </div>
    </PageBody>
  );
}
