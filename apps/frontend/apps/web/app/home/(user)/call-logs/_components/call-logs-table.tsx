'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@kit/ui/card';
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
  Phone,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ArrowUpDown,
  AlertCircle,
  CheckCircle2,
  Shield,
  FileText,
  Filter,
  X,
} from 'lucide-react';

interface CallLog {
  id: string;
  vapiCallId: string | null;
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

// ── Styling Maps ──────────────────────────────────────────────────────────

const outcomeLabels: Record<string, string> = {
  BOOKED: 'Booked',
  TRANSFERRED: 'Transferred',
  INSURANCE_INQUIRY: 'Insurance',
  PAYMENT_PLAN: 'Payment',
  INFORMATION: 'Info',
  VOICEMAIL: 'Voicemail',
  NO_ANSWER: 'No Answer',
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
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300',
};

const sentimentIcons: Record<string, { icon: string; color: string }> = {
  very_positive: { icon: '😊', color: 'text-green-600' },
  positive: { icon: '🙂', color: 'text-green-500' },
  neutral: { icon: '😐', color: 'text-gray-500' },
  negative: { icon: '😟', color: 'text-orange-500' },
  very_negative: { icon: '😠', color: 'text-red-500' },
  anxious: { icon: '😰', color: 'text-yellow-600' },
  urgent: { icon: '🚨', color: 'text-red-600' },
};

const urgencyColors: Record<string, string> = {
  routine: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  soon: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  urgent: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  emergency: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

// ── Helpers ────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null) {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

// ── Component ──────────────────────────────────────────────────────────

export function CallLogsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [calls, setCalls] = useState<CallLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<{ outcomes: FilterOption[]; reasons: FilterOption[] }>({ outcomes: [], reasons: [] });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [outcomeFilter, setOutcomeFilter] = useState(searchParams.get('outcome') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
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
      if (statusFilter) params.set('status', statusFilter);

      // Date range
      const now = new Date();
      const startDate = new Date();
      if (dateRange === '1d') startDate.setDate(now.getDate() - 1);
      else if (dateRange === '7d') startDate.setDate(now.getDate() - 7);
      else if (dateRange === '14d') startDate.setDate(now.getDate() - 14);
      params.set('startDate', startDate.toISOString());
      params.set('endDate', now.toISOString());

      const response = await fetch(`/api/call-logs?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setCalls(data.calls);
        setPagination(data.pagination);
        setFilters(data.filters);
      }
    } catch (error) {
      console.error('Error fetching call logs:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, outcomeFilter, statusFilter, dateRange]);

  useEffect(() => {
    fetchCallLogs();
  }, [fetchCallLogs]);

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`/home/call-logs?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setOutcomeFilter('');
    setStatusFilter('');
    setDateRange('30d');
    router.push('/home/call-logs');
  };

  const hasActiveFilters = searchTerm || outcomeFilter || statusFilter || dateRange !== '14d';

  return (
    <div className="space-y-4">
      {/* HIPAA Notice */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
        <Shield className="h-3.5 w-3.5 flex-shrink-0" />
        <span>HIPAA Protected: Call records contain PHI. Access is logged for compliance.</span>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email..."
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

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Call Records
              </CardTitle>
              {pagination && (
                <CardDescription>
                  {pagination.total} total records
                  {hasActiveFilters && ' (filtered)'}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                <p className="text-sm text-muted-foreground">Loading call records...</p>
              </div>
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-16">
              <Phone className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">No call records found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasActiveFilters
                  ? 'Try adjusting your filters or search term.'
                  : 'Call records will appear here once your AI agent starts handling calls.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => (
                <div
                  key={call.id}
                  onClick={() => router.push(`/home/call-logs/${call.id}`)}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer group"
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {call.contactName || 'Unknown Caller'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {call.phoneNumber}
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

                    {/* Summary */}
                    {call.summary && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {call.summary}
                      </p>
                    )}

                    {/* Tags row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${outcomeColors[call.outcome] || outcomeColors.OTHER}`}
                      >
                        {outcomeLabels[call.outcome] || call.outcome}
                      </Badge>

                      {call.urgencyLevel && call.urgencyLevel !== 'routine' && (
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${urgencyColors[call.urgencyLevel] || ''}`}>
                          {call.urgencyLevel}
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

                      {call.insuranceVerified && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 text-purple-700 dark:text-purple-400">
                          Insurance
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

                      {call.callReason && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {call.callReason.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
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
        </CardContent>
      </Card>
    </div>
  );
}
