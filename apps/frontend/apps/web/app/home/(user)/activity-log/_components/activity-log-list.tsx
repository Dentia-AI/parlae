'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
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
  const [logs, setLogs] = useState<AiActionLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('all');
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (source !== 'all') params.set('source', source);
      if (action) params.set('action', action);
      if (status) params.set('status', status);
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
    <div className="space-y-6">
      {/* HIPAA Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
        <ShieldAlert className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200">HIPAA Compliant Activity Log</p>
          <p className="text-blue-700 dark:text-blue-300 mt-0.5">
            This log shows actions performed by your AI agent. Patient-identifying information (names, contact details, medical records)
            is never stored. Use the Resource IDs to look up records in your PMS or Google Calendar.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI Activity Log</CardTitle>
              <CardDescription>
                Actions your AI agent performed in your practice management system or Google Calendar.
                {pagination && ` Showing ${logs.length} of ${pagination.total} entries.`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Input
              placeholder="Search by resource ID, call ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="pms">PMS</SelectItem>
                <SelectItem value="gcal">Google Cal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Actions</SelectItem>
                <SelectItem value="book_appointment">Book Appointment</SelectItem>
                <SelectItem value="cancel_appointment">Cancel Appointment</SelectItem>
                <SelectItem value="reschedule_appointment">Reschedule Appointment</SelectItem>
                <SelectItem value="create_patient">Create Patient</SelectItem>
                <SelectItem value="update_patient">Update Patient</SelectItem>
                <SelectItem value="add_note">Add Note</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Date / Time</TableHead>
                      <TableHead className="w-[80px]">Source</TableHead>
                      <TableHead>Action &amp; Details</TableHead>
                      <TableHead className="w-[140px]">Resource ID</TableHead>
                      <TableHead className="w-[120px]">Call</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No activity log entries found.
                          {(source !== 'all' || action || status || search) && ' Try adjusting your filters.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id} className={!log.success ? 'bg-destructive/5' : ''}>
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
                            {log.pmsProvider && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{log.pmsProvider}</div>
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
                                View Call
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-xs">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.status === 'completed' && log.success && (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Done
                              </Badge>
                            )}
                            {log.status === 'pending' && (
                              <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                                <Clock className="h-3 w-3" />
                                Pending
                              </Badge>
                            )}
                            {(log.status === 'failed' || !log.success) && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <XCircle className="h-3 w-3" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
