import { Suspense } from 'react';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { CallLogsTable } from './_components/call-logs-table';

export const metadata = {
  title: 'Call Logs',
  description: 'View and manage call records from your AI receptionist',
};

export default function CallLogsPage() {
  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-shrink-0 pb-4">
          <h2 className="text-2xl font-bold tracking-tight"><Trans i18nKey="common:callLogs.pageTitle" /></h2>
          <p className="text-muted-foreground text-sm mt-1">
            <Trans i18nKey="common:callLogs.pageDescription" />
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          }
        >
          <CallLogsTable />
        </Suspense>
      </div>
    </PageBody>
  );
}
