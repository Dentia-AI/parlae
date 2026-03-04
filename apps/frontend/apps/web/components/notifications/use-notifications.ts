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

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await getNotificationsAction();
      return result.data || [];
    },
    refetchInterval: 30000,
  });

  const { data: actionItemCount = 0 } = useQuery({
    queryKey: ['action-items-count'],
    queryFn: async () => {
      const res = await fetch('/api/action-items/count');
      if (!res.ok) return 0;
      const json = await res.json();
      return json.count ?? 0;
    },
    refetchInterval: 30000,
  });

  const notifications = data || [];
  const unreadNotifications = notifications.filter((n: any) => !n.dismissed).length;
  const unreadCount = Math.max(unreadNotifications, actionItemCount);

  const dismissMutation = useMutation({
    mutationFn: (notificationId: number) =>
      dismissNotificationAction({ notificationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

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
    actionItemCount,
    isLoading,
    dismiss: (id: number) => dismissMutation.mutate(id),
    dismissAll: () => dismissAllMutation.mutate(),
  };
}

