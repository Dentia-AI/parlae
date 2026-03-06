'use client';

import { useState } from 'react';
import { AlertCircle, Bell } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kit/ui/popover';
import { useNotifications } from './use-notifications';
import { formatDistanceToNow } from 'date-fns';

const reasonLabels: Record<string, string> = {
  FOLLOW_UP: 'Follow-up required',
  TRANSFER_FAILED: 'Transfer failed',
  NO_RESOLUTION: 'No resolution',
  EMERGENCY: 'Emergency handled',
  VOICEMAIL: 'Left voicemail',
  CALLBACK_REQUESTED: 'Callback requested',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { actionItems, actionItemCount } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-gray-700 dark:text-gray-100" />
          {actionItemCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {actionItemCount > 9 ? '9+' : actionItemCount}
            </Badge>
          )}
          <span className="sr-only">Action Items</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Action Items</h3>
          {actionItemCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {actionItemCount} open
            </span>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {actionItems.length > 0 ? (
            <div className="divide-y">
              {actionItems.map((item) => (
                <a
                  key={item.id}
                  href="/home/action-items"
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  onClick={() => setOpen(false)}
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
          ) : (
            <div className="px-4 py-8 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No open action items
              </p>
            </div>
          )}
        </div>
        {actionItemCount > actionItems.length && (
          <div className="border-t px-4 py-2">
            <a
              href="/home/action-items"
              className="text-xs text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View all {actionItemCount} action items
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
