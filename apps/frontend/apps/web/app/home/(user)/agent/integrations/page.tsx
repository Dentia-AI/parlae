'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  Building2,
  Calendar,
  CheckCircle2,
  Info,
  RefreshCw,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';
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
  const { t } = useTranslation();
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
      toast.error(t('integrationsPage.connectFailed'));
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm(t('integrationsPage.disconnectConfirm'))) return;
    try {
      const res = await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      toast.success(t('integrationsPage.disconnected'));
      setCalendarStatus({ connected: false });
    } catch {
      toast.error(t('integrationsPage.disconnectFailed'));
    }
  };

  if (loading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('integrationsPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('integrationsPage.description')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          <RefreshCw className="h-4 w-4 mr-1" />
          {t('integrationsPage.refresh')}
        </Button>
      </div>

      {/* PMS Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">
              <Trans i18nKey="common:setup.integrations.pmsTitle" />
            </CardTitle>
            {pmsStatus.connected ? (
              <Badge variant="default" className="bg-green-600 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                <Trans i18nKey="common:setup.integrations.connected" />
              </Badge>
            ) : (
              <Badge variant="default" className="bg-green-600 text-xs">
                <Trans i18nKey="common:setup.integrations.recommended" />
              </Badge>
            )}
          </div>
          <CardDescription className="text-sm">
            <Trans i18nKey="common:setup.integrations.pmsDescription" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Card className={pmsStatus.connected ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : 'border-primary/50 bg-primary/5'}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2.5 ${pmsStatus.connected ? 'bg-green-100 dark:bg-green-900/20' : 'bg-primary/10'}`}>
                  <Building2 className={`h-5 w-5 ${pmsStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-primary'}`} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">
                    <Trans i18nKey="common:setup.integrations.pmsIntegrationTitle" />
                  </h4>
                  {pmsStatus.connected ? (
                    <div className="mt-1">
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                        {pmsStatus.provider || 'Connected'}
                        {pmsStatus.practiceName ? ` — ${pmsStatus.practiceName}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.appointmentBooking" /></span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.patientLookup" /></span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.insuranceVerification" /></span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.paymentProcessing" /></span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Trans i18nKey="common:setup.integrations.pmsIntegrationDesc" />
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.appointmentBooking" /></span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.patientLookup" /></span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.insuranceVerification" /></span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span><Trans i18nKey="common:setup.integrations.paymentProcessing" /></span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {pmsStatus.connected ? (
                  <Button onClick={handleConnectPms} variant="outline" size="sm">
                    {t('integrationsPage.reconnect')}
                  </Button>
                ) : (
                  <Button onClick={handleConnectPms} size="sm">
                    <Trans i18nKey="common:setup.integrations.connectPMS" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {!pmsStatus.connected && (
            <div className="rounded-xl bg-muted/30 px-4 py-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <Trans i18nKey="common:setup.integrations.pmsAlertRecommended" />
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            <Trans i18nKey="common:setup.integrations.calendarTitle" />
          </CardTitle>
          <CardDescription className="text-sm">
            {pmsStatus.connected
              ? <Trans i18nKey="common:setup.integrations.calendarDescConnected" />
              : <Trans i18nKey="common:setup.integrations.calendarDescNotConnected" />
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Card className={calendarStatus.connected ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : 'border-muted'}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 dark:bg-blue-900/20 p-2.5">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Trans i18nKey="common:setup.integrations.googleCalendar" />
                    {calendarStatus.connected && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                        <Trans i18nKey="common:setup.integrations.connected" />
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {calendarStatus.connected
                      ? `${t('common:setup.integrations.googleCalendarConnectedAs')} ${calendarStatus.email || 'Google Account'}`
                      : pmsStatus.connected
                        ? <Trans i18nKey="common:setup.integrations.googleCalendarBasicSync" />
                        : <Trans i18nKey="common:setup.integrations.googleCalendarBasicManagement" />
                    }
                  </p>
                  {!calendarStatus.connected && !pmsStatus.connected && (
                    <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-2">
                      <CheckCircle2 className="h-3 w-3" />
                      <span><Trans i18nKey="common:setup.integrations.googleCalendarAppointmentOnly" /></span>
                    </div>
                  )}
                </div>
                {calendarStatus.connected ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleConnectCalendar}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      {t('integrationsPage.reconnect')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={handleDisconnectCalendar}
                    >
                      <Trans i18nKey="common:setup.integrations.disconnect" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={handleConnectCalendar}
                    size="sm"
                    variant={pmsStatus.connected ? 'outline' : 'default'}
                  >
                    <Trans i18nKey="common:setup.integrations.connectCalendar" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {!pmsStatus.connected && !calendarStatus.connected && (
            <div className="rounded-xl bg-muted/30 px-4 py-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <Trans i18nKey="common:setup.integrations.googleCalendarNote" />
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
