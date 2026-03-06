'use client';

import { useState } from 'react';
import { AlertCircle, Bell } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Card } from '@kit/ui/card';
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

export function NotificationBellSidebar() {
  const [expanded, setExpanded] = useState(false);
  const { actionItems, actionItemCount } = useNotifications();

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        className="w-full justify-start relative"
        onClick={() => setExpanded(!expanded)}
      >
        <Bell className="h-5 w-5 text-gray-700 dark:text-gray-100 group-data-[minimized=false]/sidebar:mr-2" />
        <span className="flex-1 text-left group-data-[minimized=true]/sidebar:hidden">Action Items</span>
        {actionItemCount > 0 && (
          <Badge
            variant="destructive"
            className="h-5 min-w-5 rounded-full px-1 text-xs absolute -top-1 -right-1 group-data-[minimized=false]/sidebar:static"
          >
            {actionItemCount > 9 ? '9+' : actionItemCount}
          </Badge>
        )}
      </Button>

      {expanded && actionItems.length > 0 && (
        <div className="mt-2 space-y-2 px-2">
          {actionItems.slice(0, 3).map((item) => (
            <a key={item.id} href="/home/action-items">
              <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.callerName || 'Unknown caller'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {reasonLabels[item.reason || ''] || item.reason || 'Needs attention'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              </Card>
            </a>
          ))}

          {actionItemCount > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                window.location.href = '/home/action-items';
              }}
            >
              View all {actionItemCount} action items
            </Button>
          )}
        </div>
      )}

      {expanded && actionItems.length === 0 && (
        <div className="mt-2 px-2">
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No open action items
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
