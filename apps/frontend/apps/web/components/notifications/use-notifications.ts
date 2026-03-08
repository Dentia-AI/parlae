'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

interface ActionItem {
  id: string;
  callId: string;
  contactName: string | null;
  contactPhone: string | null;
  summary: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  reason: string | null;
  status: string;
  callType: string | null;
  campaignId: string | null;
  createdAt: string;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['action-items-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/action-items?status=OPEN&limit=5');
      if (!res.ok) return { items: [], total: 0 };
      const json = await res.json();
      return {
        items: (json.items || []) as ActionItem[],
        total: json.pagination?.total ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  const actionItems = data?.items || [];
  const actionItemCount = data?.total ?? 0;

  return {
    actionItems,
    actionItemCount,
    isLoading,
    refetch: () =>
      queryClient.invalidateQueries({ queryKey: ['action-items-notifications'] }),
  };
}

