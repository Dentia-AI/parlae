'use client';

import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Bell } from 'lucide-react';
import { ScrollArea } from '@kit/ui/scroll-area';

interface ActionItem {
  id: string;
  callerName: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
}

interface NotificationListProps {
  actionItems: ActionItem[];
  onClose?: () => void;
}

const reasonLabels: Record<string, string> = {
  FOLLOW_UP: 'Follow-up required',
  TRANSFER_FAILED: 'Transfer failed',
  NO_RESOLUTION: 'No resolution',
  EMERGENCY: 'Emergency handled',
  VOICEMAIL: 'Left voicemail',
  CALLBACK_REQUESTED: 'Callback requested',
};

export function NotificationList({
  actionItems,
  onClose,
}: NotificationListProps) {
  if (actionItems.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No open action items</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="divide-y">
        {actionItems.map((item) => (
          <a
            key={item.id}
            href="/home/action-items"
            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            onClick={() => onClose?.()}
          >
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-1.5 flex-shrink-0 mt-0.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {item.callerName || 'Unknown caller'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {reasonLabels[item.reason || ''] || item.reason || 'Needs attention'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </a>
        ))}
      </div>
    </ScrollArea>
  );
}
