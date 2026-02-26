import { ActivityLogList } from './_components/activity-log-list';

export const metadata = {
  title: 'AI Activity Log',
};

export default function ActivityLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">AI Activity Log</h1>
        <p className="text-muted-foreground">
          Track all actions your AI agent performed in your practice management system or Google Calendar.
        </p>
      </div>
      <ActivityLogList />
    </div>
  );
}
