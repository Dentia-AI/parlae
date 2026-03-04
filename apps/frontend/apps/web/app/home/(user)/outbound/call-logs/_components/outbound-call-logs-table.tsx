'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  PhoneOutgoing,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Shield,
  FileText,
  X,
  PhoneOff,
  Voicemail,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OutboundCallLog {
  id: string;
  callId: string | null;
  phoneNumber: string;
  callType: string;
  duration: number | null;
  status: string;
  outcome: string;
  callReason: string | null;
  urgencyLevel: string | null;
  contactName: string | null;
  contactEmail: string | null;
  summary: string | null;
  appointmentSet: boolean;
  insuranceVerified: boolean;
  paymentPlanDiscussed: boolean;
  transferredToStaff: boolean;
  transferredTo: string | null;
  followUpRequired: boolean;
  customerSentiment: string | null;
  costCents: number | null;
  callStartedAt: string;
  callEndedAt: string | null;
  campaignName: string | null;
  disconnectionReason: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface FilterOption {
  value: string;
  count: number;
}

const outcomeLabels: Record<string, string> = {
  BOOKED: 'Booked',
  TRANSFERRED: 'Transferred',
  INSURANCE_INQUIRY: 'Insurance',
  PAYMENT_PLAN: 'Payment',
  INFORMATION: 'Info',
  VOICEMAIL: 'Voicemail',
  NO_ANSWER: 'No Answer',
  HUNG_UP: 'Hung Up',
  RESCHEDULED: 'Rescheduled',
  CANCELLED: 'Cancelled',
  EMERGENCY: 'Emergency',
  BUSY: 'Busy',
  FAILED: 'Failed',
  OTHER: 'Other',
};

const outcomeColors: Record<string, string> = {
  BOOKED: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  TRANSFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  INSURANCE_INQUIRY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  PAYMENT_PLAN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  INFORMATION: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  VOICEMAIL: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  NO_ANSWER: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  HUNG_UP: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  RESCHEDULED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300',
};

const callTypeLabels: Record<string, string> = {
  RECALL: 'Recall',
  REMINDER: 'Reminder',
  FOLLOWUP: 'Follow-up',
  NOSHOW: 'No-Show',
  TREATMENT_PLAN: 'Treatment Plan',
  POSTOP: 'Post-Op',
  REACTIVATION: 'Reactivation',
  SURVEY: 'Survey',
  WELCOME: 'Welcome',
  PAYMENT: 'Payment',
  BENEFITS: 'Benefits',
  OUTBOUND: 'Outbound',
};

const callTypeColors: Record<string, string> = {
  RECALL: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  REMINDER: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  FOLLOWUP: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  NOSHOW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  TREATMENT_PLAN: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  POSTOP: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  REACTIVATION: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  PAYMENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  BENEFITS: 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
};

const sentimentIcons: Record<string, { icon: string; color: string }> = {
  very_positive: { icon: '😊', color: 'text-green-600' },
  positive: { icon: '🙂', color: 'text-green-500' },
  neutral: { icon: '😐', color: 'text-gray-500' },
  negative: { icon: '😟', color: 'text-orange-500' },
  very_negative: { icon: '😠', color: 'text-red-500' },
};

function formatDuration(seconds: number | null) {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getOutcomeIcon(outcome: string) {
  switch (outcome) {
    case 'BOOKED':
    case 'RESCHEDULED':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'VOICEMAIL':
      return <Voicemail className="h-4 w-4 text-gray-400" />;
    case 'NO_ANSWER':
    case 'HUNG_UP':
      return <PhoneOff className="h-4 w-4 text-orange-500" />;
    case 'FAILED':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <PhoneOutgoing className="h-4 w-4 text-primary" />;
  }
}

interface OutboundCallLogsTableProps {
  basePath?: string;
}

export function OutboundCallLogsTable({ basePath = '/home/outbound/call-logs' }: OutboundCallLogsTableProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [calls, setCalls] = useState<OutboundCallLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<{
    outcomes: FilterOption[];
    callTypes: FilterOption[];
  }>({ outcomes: [], callTypes: [] });
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [outcomeFilter, setOutcomeFilter] = useState(searchParams.get('outcome') || '');
  const [callTypeFilter, setCallTypeFilter] = useState(searchParams.get('callType') || '');
  const [dateRange, setDateRange] = useState(searchParams.get('range') || '14d');

  const currentPage = parseInt(searchParams.get('page') || '1');

  const fetchCallLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', '20');

      if (searchTerm) params.set('search', searchTerm);
      if (outcomeFilter) params.set('outcome', outcomeFilter);
      if (callTypeFilter) params.set('callType', callTypeFilter);

      const now = new Date();
      const startDate = new Date();
      if (dateRange === '1d') startDate.setDate(now.getDate() - 1);
      else if (dateRange === '7d') startDate.setDate(now.getDate() - 7);
      else if (dateRange === '14d') startDate.setDate(now.getDate() - 14);
      else if (dateRange === '30d') startDate.setDate(now.getDate() - 30);
      params.set('startDate', startDate.toISOString());
      params.set('endDate', now.toISOString());

      const response = await fetch(`/api/outbound/call-logs?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setCalls(data.calls);
        setPagination(data.pagination);
        setFilters(data.filters);
      }
    } catch (error) {
      console.error('Error fetching outbound call logs:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, outcomeFilter, callTypeFilter, dateRange]);

  useEffect(() => {
    fetchCallLogs();
  }, [fetchCallLogs]);

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`${basePath}?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setOutcomeFilter('');
    setCallTypeFilter('');
    setDateRange('14d');
    router.push(basePath);
  };

  const hasActiveFilters = searchTerm || outcomeFilter || callTypeFilter || dateRange !== '14d';
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const st = el.scrollTop;
      if (st > lastScrollTop.current && st > 40) {
        setHeaderCollapsed(true);
      } else if (st < lastScrollTop.current) {
        setHeaderCollapsed(false);
      }
      lastScrollTop.current = st;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading]);

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          headerCollapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-[500px] opacity-100'
        }`}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md mb-4">
          <Shield className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{t('callLogs.hipaaNotice')}</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or campaign..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCallLogs()}
            />
          </div>

          <Select value={outcomeFilter || 'all'} onValueChange={(v) => setOutcomeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outcomes</SelectItem>
              {Object.entries(outcomeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={callTypeFilter || 'all'} onValueChange={(v) => setCallTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Call Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(callTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="14d">Last 14 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Outbound Call Records
            </h3>
            {pagination && (
              <p className="text-sm text-muted-foreground">
                {pagination.total} total records
                {hasActiveFilters && ' (filtered)'}
              </p>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading outbound call logs...</p>
          </div>
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-16">
          <PhoneOutgoing className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="font-medium">No outbound call records</p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasActiveFilters
              ? 'Try adjusting your filters to see more results.'
              : 'Outbound calls will appear here once campaigns start running.'}
          </p>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0">
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
            <div className="space-y-2 pb-2">
              {calls.map((call) => (
                <div
                  key={call.id}
                  onClick={() => router.push(`/home/outbound/call-logs/${call.id}`)}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer group"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50 transition-colors">
                      {getOutcomeIcon(call.outcome)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {call.contactName || 'Unknown Contact'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {call.phoneNumber}
                          {call.campaignName && (
                            <span className="ml-1.5 text-muted-foreground/70">
                              &middot; {call.campaignName}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {call.customerSentiment && sentimentIcons[call.customerSentiment] && (
                          <span className={sentimentIcons[call.customerSentiment]!.color} title={call.customerSentiment}>
                            {sentimentIcons[call.customerSentiment]!.icon}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(call.callStartedAt)}
                        </span>
                      </div>
                    </div>

                    {call.summary && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {call.summary}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${outcomeColors[call.outcome] || outcomeColors.OTHER}`}
                      >
                        {outcomeLabels[call.outcome] || call.outcome}
                      </Badge>

                      {call.callType && call.callType !== 'OUTBOUND' && (
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${callTypeColors[call.callType] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                        >
                          {callTypeLabels[call.callType] || call.callType}
                        </Badge>
                      )}

                      {call.duration !== null && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(call.duration)}
                        </span>
                      )}

                      {call.appointmentSet && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          Appt
                        </Badge>
                      )}

                      {call.followUpRequired && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-700 dark:text-orange-400">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                          Follow-up
                        </Badge>
                      )}

                      {call.transferredToStaff && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Transferred{call.transferredTo ? `: ${call.transferredTo}` : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between py-4 border-t">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => updatePage(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore}
              onClick={() => updatePage(pagination.page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
