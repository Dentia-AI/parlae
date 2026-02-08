'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { useNotifications } from './use-notifications';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBellSidebar() {
  const [expanded, setExpanded] = useState(false);
  const { notifications, unreadCount, dismissNotification } = useNotifications();

  // Get top 3 unread notifications
  const topNotifications = notifications
    .filter((n) => !n.dismissed)
    .slice(0, 3);

  const hasNotifications = topNotifications.length > 0;

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        className="w-full justify-start relative"
        onClick={() => setExpanded(!expanded)}
      >
        <Bell className="h-5 w-5 mr-2" />
        <span className="flex-1 text-left">Notifications</span>
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="h-5 min-w-5 rounded-full px-1 text-xs"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {expanded && hasNotifications && (
        <div className="mt-2 space-y-2 px-2">
          {topNotifications.map((notification) => (
            <Card
              key={notification.id}
              className={cn(
                'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                notification.dismissed && 'opacity-50'
              )}
              onClick={() => {
                if (!notification.dismissed) {
                  dismissNotification(notification.id);
                }
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {notification.title}
                  </p>
                  {notification.body && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                {!notification.dismissed && (
                  <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                )}
              </div>
            </Card>
          ))}

          {notifications.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                window.location.href = '/home/notifications';
              }}
            >
              View all notifications
            </Button>
          )}
        </div>
      )}

      {expanded && !hasNotifications && (
        <div className="mt-2 px-2">
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No new notifications
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

