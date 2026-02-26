import { PageBody } from '@kit/ui/page';

import { ActivityLogList } from './_components/activity-log-list';

export const metadata = {
  title: 'AI Activity Log',
};

export default function ActivityLogPage() {
  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-shrink-0 pb-4">
          <h1 className="text-2xl font-bold">AI Activity Log</h1>
          <p className="text-muted-foreground">
            Track all actions your AI agent performed in your practice management system or Google Calendar.
          </p>
        </div>
        <ActivityLogList />
      </div>
    </PageBody>
  );
}
