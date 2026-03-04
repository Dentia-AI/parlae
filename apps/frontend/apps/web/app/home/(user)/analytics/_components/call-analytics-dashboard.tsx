'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  AlertCircle,
  Phone,
  TrendingUp,
  Clock,
  Calendar,
  PhoneOutgoing,
  Signal,
  CheckCircle2,
  Megaphone,
} from 'lucide-react';

import { CallOutcomesChart } from './call-outcomes-chart';
import { SatisfactionChart } from './satisfaction-chart';
import { RecentCallsList } from './recent-calls-list';
import { ActivityChart } from './activity-chart';
import { CallDurationChart } from './peak-hours-chart';

interface SatisfactionEntry {
  label: string;
  count: number;
  percentage: number;
}

interface AnalyticsData {
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalCalls: number;
    bookingRate: number;
    avgCallTime: number;
  };
  activityTrend: Array<{
    date: string;
    count: number;
  }>;
  outcomesDistribution: Array<{
    outcome: string;
    count: number;
    percentage: number;
  }>;
  satisfactionBreakdown?: SatisfactionEntry[];
  callDurations?: Array<{ duration: number }>;
}

interface OutboundData {
  outboundCalls: number;
  reachRate: number;
  successRate: number;
  activeCampaigns: number;
  enabled: boolean;
}

export function CallAnalyticsDashboard() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [outboundData, setOutboundData] = useState<OutboundData | null>(null);
  const [actionItemCount, setActionItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'1d' | '7d' | '14d'>('7d');
  const activityRef = useRef<HTMLDivElement>(null);
  const [activityHeight, setActivityHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!activityRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setActivityHeight(entry.contentRect.height);
    });
    observer.observe(activityRef.current);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      if (dateRange === '1d') {
        startDate.setDate(startDate.getDate() - 1);
      } else if (dateRange === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else {
        startDate.setDate(startDate.getDate() - 14);
      }

      const dateParams = `startDate=${startDate.toISOString()}&endDate=${new Date().toISOString()}`;

      const [callsRes, outboundRes, actionRes] = await Promise.all([
        fetch(`/api/analytics/calls?${dateParams}`),
        fetch(`/api/analytics/outbound?${dateParams}`).catch(() => null),
        fetch('/api/action-items/count').catch(() => null),
      ]);

      if (callsRes.ok) {
        const analyticsData = await callsRes.json();
        setData(analyticsData);
      }

      if (outboundRes?.ok) {
        const obData = await outboundRes.json();
        setOutboundData(obData);
      }

      if (actionRes?.ok) {
        const acData = await actionRes.json();
        setActionItemCount(acData.count || 0);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const is24h = dateRange === '1d';

  const rawActivity = is24h
    ? (data?.metrics.totalCalls ?? 0) / 24
    : (data?.metrics.totalCalls ?? 0) / (dateRange === '7d' ? 7 : 14);
  const activityValue = rawActivity > 0 ? Math.ceil(rawActivity) : 0;

  const activityLabel = is24h ? t('dashboard.callsPerHourAvg') : t('dashboard.callsPerDayAvg');

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('dashboard.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 [&_.bg-card]:bg-gray-100 dark:[&_.bg-card]:bg-card">
      {/* Header with Date Range Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h2>
          <Badge variant="outline" className="gap-1 hidden sm:inline-flex">
            {dateRange === '1d' ? t('dashboard.last24h') : dateRange === '7d' ? t('dashboard.last7d') : t('dashboard.last14d')}
          </Badge>
        </div>

        <div className="flex gap-1.5 sm:gap-2">
          <Button
            variant={dateRange === '1d' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none text-xs sm:text-sm px-2.5 sm:px-3"
            onClick={() => setDateRange('1d')}
          >
            24h
          </Button>
          <Button
            variant={dateRange === '7d' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none text-xs sm:text-sm px-2.5 sm:px-3"
            onClick={() => setDateRange('7d')}
          >
            7d
          </Button>
          <Button
            variant={dateRange === '14d' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none text-xs sm:text-sm px-2.5 sm:px-3"
            onClick={() => setDateRange('14d')}
          >
            14d
          </Button>
          <Button variant="outline" size="sm" className="gap-1 px-2.5 sm:px-3">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">{t('dashboard.export')}</span>
          </Button>
        </div>
      </div>

      {/* Attention Required Banner */}
      {actionItemCount > 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-2">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {t('dashboard.attentionRequired', { count: actionItemCount })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.attentionDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              onClick={() => router.push('/home/action-items')}
            >
              {t('dashboard.viewActionItems')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalCalls')}</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-1.5">
              <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.metrics.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {data.metrics.totalCalls > 0 ? t('dashboard.inSelectedPeriod') : t('dashboard.noCallsYet')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">{t('dashboard.bookingRate')}</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.metrics.bookingRate}%</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.booked', {
                count: (data.outcomesDistribution.find(o => o.outcome === 'BOOKED')?.count || 0)
                     + (data.outcomesDistribution.find(o => o.outcome === 'RESCHEDULED')?.count || 0),
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">{t('dashboard.avgCallTime')}</CardTitle>
            <div className="rounded-md bg-violet-500/10 p-1.5">
              <Clock className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{formatTime(data.metrics.avgCallTime)}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.avgPerCall')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">{t('dashboard.activity')}</CardTitle>
            <div className="rounded-md bg-amber-500/10 p-1.5">
              <Calendar className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{activityValue}</div>
            <p className="text-xs text-muted-foreground">{activityLabel}</p>
          </CardContent>
        </Card>
      </div>

      {outboundData?.enabled && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">{t('dashboard.outboundCalls')}</CardTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('dashboard.outboundBadge')}</Badge>
              </div>
              <div className="rounded-md bg-orange-500/10 p-1.5">
                <PhoneOutgoing className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{outboundData.outboundCalls.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{t('dashboard.inSelectedPeriod')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">{t('dashboard.reachRate')}</CardTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('dashboard.outboundBadge')}</Badge>
              </div>
              <div className="rounded-md bg-cyan-500/10 p-1.5">
                <Signal className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{outboundData.reachRate}%</div>
              <p className="text-xs text-muted-foreground">{t('dashboard.reachRateDesc')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">{t('dashboard.outboundSuccessRate')}</CardTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('dashboard.outboundBadge')}</Badge>
              </div>
              <div className="rounded-md bg-emerald-500/10 p-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{outboundData.successRate}%</div>
              <p className="text-xs text-muted-foreground">{t('dashboard.outboundSuccessDesc')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium">{t('dashboard.activeCampaigns')}</CardTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('dashboard.outboundBadge')}</Badge>
              </div>
              <div className="rounded-md bg-purple-500/10 p-1.5">
                <Megaphone className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{outboundData.activeCampaigns}</div>
              <p className="text-xs text-muted-foreground">{t('dashboard.activeCampaignsDesc')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row: Outcomes + Satisfaction + Duration */}
      <div className="grid gap-3 md:grid-cols-3">
        <CallOutcomesChart data={data.outcomesDistribution} />
        <SatisfactionChart data={data.satisfactionBreakdown ?? []} />
        <CallDurationChart data={data.callDurations} totalCalls={data.metrics.totalCalls} />
      </div>

      {/* Activity Trend + Recent Calls side by side */}
      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-3" ref={activityRef}>
          <ActivityChart data={data.activityTrend} is24h={is24h} />
        </div>
        <div className="md:col-span-2" style={activityHeight ? { maxHeight: activityHeight } : undefined}>
          <RecentCallsList />
        </div>
      </div>
    </div>
  );
}
