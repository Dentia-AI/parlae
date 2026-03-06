'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface ActionItem {
  id: string;
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  reason: string;
  status: string;
  contactName: string | null;
  contactPhone: string | null;
  summary: string | null;
  agentNotes: string | null;
  staffNotes: string | null;
  assignedToUserId: string | null;
  campaignId: string | null;
  callType: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  name: string;
}

const REASON_COLORS: Record<string, string> = {
  FOLLOW_UP_REQUIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  TRANSFER_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  NO_RESOLUTION: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  CALLER_HUNG_UP: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  CALL_ERROR: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  VOICEMAIL_REVIEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN: <AlertCircle className="h-4 w-4 text-orange-500" />,
  IN_PROGRESS: <Clock className="h-4 w-4 text-blue-500" />,
  RESOLVED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  OPEN: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  RESOLVED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
};

function formatPhone(raw: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export function ActionItemsList() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const getCsrfToken = useCsrfToken;
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [directionFilter, setDirectionFilter] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [assignDropdownId, setAssignDropdownId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (directionFilter) params.set('direction', directionFilter);

      const res = await fetch(`/api/action-items?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.teamMembers) setTeamMembers(data.teamMembers);
      }
    } catch (err) {
      console.error('Failed to fetch action items:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, directionFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const updateItem = async (id: string, body: Record<string, unknown>) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...updated } : item)),
        );
        queryClient.invalidateQueries({ queryKey: ['action-items-notifications'] });
      }
    } catch (err) {
      console.error('Failed to update action item:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const reasonLabel = (reason: string) =>
    t(`actionItems.reasons.${reason}`, { defaultValue: reason.replace(/_/g, ' ') });

  const statusLabel = (status: string) =>
    t(`actionItems.statuses.${status}`, { defaultValue: status.replace(/_/g, ' ') });

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const getMemberName = (userId: string | null) => {
    if (!userId) return null;
    const member = teamMembers.find((m) => m.id === userId);
    return member?.name || null;
  };

  const handleAssign = async (itemId: string, memberId: string) => {
    setAssignDropdownId(null);
    await updateItem(itemId, { assignedToUserId: memberId, status: 'IN_PROGRESS' });
  };

  const navigateToCall = (item: ActionItem) => {
    if (item.direction === 'OUTBOUND') {
      router.push(`/home/outbound/call-logs/${item.callId}`);
    } else {
      router.push(`/home/call-logs/${item.callId}`);
    }
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-auto">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />

        {/* Direction chips */}
        {['', 'INBOUND', 'OUTBOUND'].map((d) => (
          <Button
            key={d || 'all'}
            variant={directionFilter === d ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7 px-2.5"
            onClick={() => { setDirectionFilter(d); setPage(1); }}
          >
            {d === '' ? t('actionItems.filterAll') : d === 'INBOUND' ? t('actionItems.filterInbound') : t('actionItems.filterOutbound')}
          </Button>
        ))}

        <span className="mx-1 text-muted-foreground/40">|</span>

        {/* Status chips */}
        {['OPEN', 'IN_PROGRESS', 'RESOLVED', ''].map((s) => (
          <Button
            key={s || 'any'}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7 px-2.5"
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s === '' ? t('actionItems.filterAnyStatus') : statusLabel(s)}
          </Button>
        ))}

        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1" onClick={() => fetchItems()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {total} {t('actionItems.itemsTotal')}
      </p>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mb-3" />
          <p className="text-lg font-medium">{t('actionItems.emptyTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('actionItems.emptyDescription')}</p>
        </div>
      )}

      {/* Items list */}
      {!loading && items.map((item) => (
        <Card
          key={item.id}
          className={`group transition-colors ${item.status === 'RESOLVED' ? 'opacity-50 border-muted' : 'hover:border-primary/30'}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Status icon */}
              <div className="mt-0.5 flex-shrink-0">
                {STATUS_ICON[item.status] || STATUS_ICON.OPEN}
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* Top row: status + reason badge + direction + time */}
                <div className="flex items-center flex-wrap gap-1.5">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 border ${STATUS_BADGE_STYLES[item.status] || ''}`}>
                    {STATUS_ICON[item.status]} {statusLabel(item.status)}
                  </Badge>
                  <Badge className={`text-[10px] px-1.5 py-0 ${REASON_COLORS[item.reason] || REASON_COLORS.CALL_ERROR}`}>
                    {reasonLabel(item.reason)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                    {item.direction === 'INBOUND'
                      ? <><PhoneIncoming className="h-2.5 w-2.5" /> {t('actionItems.filterInbound')}</>
                      : <><PhoneOutgoing className="h-2.5 w-2.5" /> {t('actionItems.filterOutbound')}</>
                    }
                  </Badge>
                  {item.callType && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {item.callType}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>

                {/* Contact info */}
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {item.contactName || t('actionItems.unknownContact')}
                  </p>
                  {item.contactPhone && (
                    <a
                      href={`tel:${item.contactPhone}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {formatPhone(item.contactPhone)}
                    </a>
                  )}
                </div>

                {/* Summary */}
                {item.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.summary}</p>
                )}

                {/* Agent notes */}
                {item.agentNotes && (
                  <div className="flex items-start gap-1 text-xs text-muted-foreground/80 bg-muted/50 rounded px-2 py-1">
                    <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{item.agentNotes}</span>
                  </div>
                )}

                {/* Assigned to */}
                {item.assignedToUserId && (
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <UserCheck className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium">{t('actionItems.assignedTo')}: {getMemberName(item.assignedToUserId) || t('actionItems.teamMember')}</span>
                  </div>
                )}

                {/* Staff notes */}
                {item.staffNotes && (
                  <div className="flex items-start gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
                    <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{item.staffNotes}</span>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {item.status === 'OPEN' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2.5 gap-1"
                      disabled={updatingId === item.id}
                      onClick={() => updateItem(item.id, { status: 'IN_PROGRESS', assignedToUserId: '__self__' })}
                    >
                      <UserCheck className="h-3 w-3" />
                      {t('actionItems.actionStart')}
                    </Button>
                  )}
                  {/* Assign to team member dropdown */}
                  {(item.status === 'OPEN' || item.status === 'IN_PROGRESS') && teamMembers.length > 0 && (
                    <div className="relative">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5 gap-1"
                        disabled={updatingId === item.id}
                        onClick={() => setAssignDropdownId(assignDropdownId === item.id ? null : item.id)}
                      >
                        {t('actionItems.assignTo')}
                      </Button>
                      {assignDropdownId === item.id && (
                        <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
                          {teamMembers.map((member) => (
                            <button
                              key={member.id}
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                              onClick={() => handleAssign(item.id, member.id)}
                            >
                              {member.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {(item.status === 'OPEN' || item.status === 'IN_PROGRESS') && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs px-2.5 gap-1"
                      disabled={updatingId === item.id}
                      onClick={() => updateItem(item.id, { status: 'RESOLVED' })}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {t('actionItems.actionResolve')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2.5 ml-auto gap-1"
                    onClick={() => navigateToCall(item)}
                  >
                    {t('actionItems.viewCall')}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between py-2">
          <p className="text-xs text-muted-foreground">
            {t('actionItems.pageInfo', { page, totalPages })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('actionItems.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              {t('actionItems.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
