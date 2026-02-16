'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  Loader2,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface PmsStatus {
  connected: boolean;
  provider?: string;
  practiceName?: string;
}

interface CalendarStatus {
  connected: boolean;
  email?: string;
}

export default function IntegrationsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [pmsStatus, setPmsStatus] = useState<PmsStatus>({ connected: false });
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus>({ connected: false });
  const csrfToken = useCsrfToken();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [pmsRes, calendarRes] = await Promise.all([
        fetch('/api/pms/status').then((r) => r.ok ? r.json() : { connected: false }),
        fetch('/api/google-calendar/status').then((r) => r.ok ? r.json() : { connected: false }),
      ]);

      setPmsStatus({
        connected: pmsRes.connected || false,
        provider: pmsRes.providerName,
        practiceName: pmsRes.practiceName,
      });

      setCalendarStatus({
        connected: calendarRes.connected || false,
        email: calendarRes.email,
      });
    } catch {
      // Silently handle — will show as disconnected
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnectPms = () => {
    window.location.href = '/home/agent/setup/integrations?returnTo=/home/agent/integrations';
  };

  const handleConnectCalendar = async () => {
    try {
      const res = await fetch('/api/google-calendar/auth-url');
      if (!res.ok) throw new Error('Failed to get auth URL');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to start Google Calendar connection');
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm('Disconnect Google Calendar? Appointments will fall back to PMS only.')) return;
    try {
      const res = await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      toast.success('Google Calendar disconnected');
      setCalendarStatus({ connected: false });
    } catch {
      toast.error('Failed to disconnect Google Calendar');
    }
  };

  if (loading) {
    return (
      <div className="container max-w-3xl py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your practice management system and calendar connections
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* PMS Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900 p-2">
                <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <CardTitle className="text-lg">Practice Management System</CardTitle>
                <CardDescription>
                  Connect Sikka or another PMS for automated patient and appointment management
                </CardDescription>
              </div>
            </div>
            {pmsStatus.connected ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <XCircle className="h-3 w-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {pmsStatus.connected ? (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Provider:</span>{' '}
                <span className="font-medium">{pmsStatus.provider || 'Unknown'}</span>
              </div>
              {pmsStatus.practiceName && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Practice:</span>{' '}
                  <span className="font-medium">{pmsStatus.practiceName}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleConnectPms}>
                Reconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert>
                <AlertDescription>
                  Without a PMS connection, appointment scheduling will use Google Calendar as a fallback.
                </AlertDescription>
              </Alert>
              <Button onClick={handleConnectPms}>
                <Building2 className="h-4 w-4 mr-2" />
                Connect PMS
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Calendar Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900 p-2">
                <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Calendar</CardTitle>
                <CardDescription>
                  {pmsStatus.connected
                    ? 'Fallback for scheduling when PMS is unavailable'
                    : 'Primary calendar for appointment scheduling'}
                </CardDescription>
              </div>
            </div>
            {calendarStatus.connected ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <XCircle className="h-3 w-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {calendarStatus.connected ? (
            <div className="space-y-2">
              {calendarStatus.email && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Account:</span>{' '}
                  <span className="font-medium">{calendarStatus.email}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleConnectCalendar}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Reconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={handleDisconnectCalendar}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleConnectCalendar}>
              <Calendar className="h-4 w-4 mr-2" />
              Connect Google Calendar
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
