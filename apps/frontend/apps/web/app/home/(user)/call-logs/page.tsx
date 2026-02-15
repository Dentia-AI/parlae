import { Suspense } from 'react';
import { PageBody } from '@kit/ui/page';

import { CallLogsTable } from './_components/call-logs-table';

export const metadata = {
  title: 'Call Logs',
  description: 'View and manage call records from your AI receptionist',
};

export default function CallLogsPage() {
  return (
    <PageBody className="pt-4">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Call Logs</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Review call records, transcripts, and AI analysis from your receptionist.
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
