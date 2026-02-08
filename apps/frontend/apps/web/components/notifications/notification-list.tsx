'use client';

import { formatDistanceToNow } from 'date-fns';
import { Info, AlertTriangle, XCircle, X, Bell } from 'lucide-react';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';
import { cn } from '@kit/ui/utils';
import type { Notification } from '@prisma/client';
import { useNotifications } from './use-notifications';

interface NotificationListProps {
  notifications: Notification[];
  onClose?: () => void;
}

export function NotificationList({
  notifications,
  onClose,
}: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No notifications</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-2">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClose={onClose}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function NotificationItem({
  notification,
  onClose,
}: {
  notification: Notification;
  onClose?: () => void;
}) {
  const { dismiss } = useNotifications();

  const handleDismiss = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await dismiss(notification.id);
  };

  const handleClick = () => {
    if (notification.link) {
      window.location.href = notification.link;
      onClose?.();
    }
  };

  const Icon = {
    INFO: Info,
    WARNING: AlertTriangle,
    ERROR: XCircle,
  }[notification.type];

  const typeStyles = {
    INFO: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    WARNING:
      'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
    ERROR: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
  }[notification.type];

  return (
    <div
      className={cn(
        'relative rounded-lg border p-3 transition-colors',
        typeStyles,
        notification.link && 'cursor-pointer hover:opacity-80'
      )}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm">{notification.body}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
            })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

