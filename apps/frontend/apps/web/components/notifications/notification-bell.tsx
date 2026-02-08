'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kit/ui/popover';
import { NotificationList } from './notification-list';
import { useNotifications } from './use-notifications';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, dismissAll } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismissAll()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <NotificationList
          notifications={notifications}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

