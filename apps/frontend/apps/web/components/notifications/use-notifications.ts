'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationsAction,
  dismissNotificationAction,
  dismissAllNotificationsAction,
} from '@kit/shared/notifications/server-actions';
import { toast } from '@kit/ui/sonner';

export function useNotifications() {
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await getNotificationsAction();
      return result.data || [];
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const notifications = data || [];
  const unreadCount = notifications.length;

  // Dismiss single notification
  const dismissMutation = useMutation({
    mutationFn: (notificationId: number) =>
      dismissNotificationAction({ notificationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Dismiss all notifications
  const dismissAllMutation = useMutation({
    mutationFn: () => dismissAllNotificationsAction(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    dismiss: (id: number) => dismissMutation.mutate(id),
    dismissAll: () => dismissAllMutation.mutate(),
  };
}

