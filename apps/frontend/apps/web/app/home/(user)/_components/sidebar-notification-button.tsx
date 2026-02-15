'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kit/ui/popover';
import { useNotifications } from '~/components/notifications/use-notifications';
import { formatDistanceToNow } from 'date-fns';

export function SidebarNotificationButton() {
  const { notifications, unreadCount, dismiss, dismissAll } =
    useNotifications();

  const topNotifications = notifications
    .filter((n: any) => !n.dismissed)
    .slice(0, 5);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 flex-shrink-0 group-data-[minimized=true]/sidebar:h-8 group-data-[minimized=true]/sidebar:w-8"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <button
              onClick={() => dismissAll()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto">
          {topNotifications.length > 0 ? (
            <div className="divide-y">
              {topNotifications.map((notification: any) => (
                <div
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors',
                    notification.dismissed && 'opacity-50',
                  )}
                  onClick={() => {
                    if (!notification.dismissed) {
                      dismiss(notification.id);
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {!notification.dismissed && (
                    <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No new notifications
              </p>
            </div>
          )}
        </div>

        {notifications.length > 5 && (
          <div className="border-t px-4 py-2">
            <a
              href="/home/notifications"
              className="text-xs text-primary hover:underline"
            >
              View all notifications
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
