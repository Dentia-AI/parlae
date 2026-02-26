'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import { Skeleton } from '@kit/ui/skeleton';
import { toast } from '@kit/ui/sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import {
  RefreshCw,
  Calendar,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

interface AiActionLogEntry {
  id: string;
  accountId: string;
  source: string;
  action: string;
  category: string;
  callId: string | null;
  externalResourceId: string | null;
  externalResourceType: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  providerName: string | null;
  duration: number | null;
  summary: string;
  success: boolean;
  status: string;
  errorMessage: string | null;
  pmsProvider: string | null;
  writebackId: string | null;
  calendarEventId: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  book_appointment: 'Booked Appointment',
  cancel_appointment: 'Cancelled Appointment',
  reschedule_appointment: 'Rescheduled Appointment',
  create_patient: 'Created Patient Record',
  update_patient: 'Updated Patient Record',
  add_note: 'Added Note',
  create_event: 'Created Event',
  update_event: 'Updated Event',
  delete_event: 'Deleted Event',
};

function formatActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAppointmentTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] max-w-[120px] truncate inline-block align-middle">
        {text}
      </code>
      <Copy className="h-3 w-3 flex-shrink-0" />
      {copied && <span className="text-green-600 text-[10px]">Copied</span>}
    </button>
  );
}

export function ActivityLogList() {
  const { t } = useTranslation('common');
  const [logs, setLogs] = useState<AiActionLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('all');
  const [action, setAction] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
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

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (source !== 'all') params.set('source', source);
      if (action && action !== 'all') params.set('action', action);
      if (status && status !== 'all') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/activity-log?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
        setPagination(data.pagination);
      } else {
        toast.error(data.error || 'Failed to fetch activity log');
      }
    } catch {
      toast.error('Failed to fetch activity log');
    } finally {
      setLoading(false);
    }
  }, [page, source, action, status, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [source, action, status, search]);

  const actionOptions = useMemo(() => {
    const actions = new Set(logs.map((l) => l.action));
    return Array.from(actions).sort();
  }, [logs]);

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      {/* HIPAA Notice - stays outside card */}
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          headerCollapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-[200px] opacity-100 mb-4'
        }`}
      >
        <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
          <ShieldAlert className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-medium text-blue-800 dark:text-blue-200">{t('activityLog.hipaaTitle')}</span>
            <span className="text-blue-700 dark:text-blue-300">
              {' '}— {t('activityLog.hipaaDescription')}
            </span>
          </div>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Card header with title, filters */}
        <div
          className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
            headerCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
          }`}
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('activityLog.pageTitle')}</CardTitle>
                <CardDescription>
                  {loading
                    ? t('activityLog.loadingLog')
                    : pagination
                      ? t('activityLog.showingEntries', { shown: logs.length, total: pagination.total })
                      : t('activityLog.defaultDescription')}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {t('activityLog.refresh')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <div className="relative flex-1 max-w-xs">
                <Input
                  placeholder={t('activityLog.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('activityLog.allSources')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('activityLog.allSources')}</SelectItem>
                  <SelectItem value="pms">{t('activityLog.sourcePms')}</SelectItem>
                  <SelectItem value="gcal">{t('activityLog.sourceGcal')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('activityLog.allActions')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('activityLog.allActions')}</SelectItem>
                  <SelectItem value="book_appointment">{t('activityLog.actionBookAppt')}</SelectItem>
                  <SelectItem value="cancel_appointment">{t('activityLog.actionCancelAppt')}</SelectItem>
                  <SelectItem value="reschedule_appointment">{t('activityLog.actionRescheduleAppt')}</SelectItem>
                  <SelectItem value="create_patient">{t('activityLog.actionCreatePatient')}</SelectItem>
                  <SelectItem value="update_patient">{t('activityLog.actionUpdatePatient')}</SelectItem>
                  <SelectItem value="add_note">{t('activityLog.actionAddNote')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('activityLog.allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('activityLog.allStatuses')}</SelectItem>
                  <SelectItem value="completed">{t('activityLog.statusCompleted')}</SelectItem>
                  <SelectItem value="pending">{t('activityLog.statusPending')}</SelectItem>
                  <SelectItem value="failed">{t('activityLog.statusFailed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </div>

        {/* Table content */}
        <CardContent className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden">
          {loading ? (
            <div className="px-6 py-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="relative flex-1 min-h-0">
              <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-6">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-[160px]">{t('activityLog.colDateTime')}</TableHead>
                      <TableHead className="w-[80px]">{t('activityLog.colSource')}</TableHead>
                      <TableHead>{t('activityLog.colActionDetails')}</TableHead>
                      <TableHead className="w-[140px]">{t('activityLog.colResourceId')}</TableHead>
                      <TableHead className="w-[120px]">{t('activityLog.colCall')}</TableHead>
                      <TableHead className="w-[90px]">{t('activityLog.colStatus')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          {t('activityLog.noEntries')}
                          {(source !== 'all' || action || status || search) && t('activityLog.adjustFilters')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id} className={!log.success ? 'bg-destructive/10' : ''}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            {log.source === 'pms' ? (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Database className="h-3 w-3" />
                                PMS
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-700">
                                <Calendar className="h-3 w-3" />
                                GCal
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="font-medium text-sm">{formatActionLabel(log.action)}</div>
                              <div className="text-xs text-muted-foreground">{log.summary}</div>
                              {log.appointmentTime && (
                                <div className="text-xs text-muted-foreground">
                                  {formatAppointmentTime(log.appointmentTime)}
                                  {log.duration && ` (${log.duration} min)`}
                                  {log.providerName && ` with ${log.providerName}`}
                                </div>
                              )}
                              {log.errorMessage && (
                                <div className="text-xs text-destructive">{log.errorMessage}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.externalResourceId ? (
                              <CopyButton text={log.externalResourceId} />
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.callId ? (
                              <Link
                                href={`/home/call-logs/${log.callId}`}
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                            <ExternalLink className="h-3 w-3" />
                            {t('activityLog.viewCall')}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.status === 'completed' && log.success && (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('activityLog.badgeDone')}
                              </Badge>
                            )}
                            {log.status === 'pending' && (
                              <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                            <Clock className="h-3 w-3" />
                            {t('activityLog.badgePending')}
                              </Badge>
                            )}
                            {(log.status === 'failed' || !log.success) && (
                              <Badge variant="destructive" className="text-xs gap-1">
                            <XCircle className="h-3 w-3" />
                            {t('activityLog.badgeFailed')}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>

        {/* Pagination inside card */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                {t('activityLog.pageInfo', { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}
              </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                  <ChevronLeft className="h-4 w-4" />
                  {t('activityLog.previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('activityLog.next')}
                  <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
