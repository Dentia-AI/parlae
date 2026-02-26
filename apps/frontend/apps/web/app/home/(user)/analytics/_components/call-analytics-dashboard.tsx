'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Phone,
  TrendingUp,
  Clock,
  Calendar,
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

export function CallAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'1d' | '7d' | '14d'>('7d');

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

      const response = await fetch(
        `/api/analytics/calls?startDate=${startDate.toISOString()}&endDate=${new Date().toISOString()}`
      );

      if (response.ok) {
        const analyticsData = await response.json();
        setData(analyticsData);
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

  const activityValue = is24h
    ? ((data?.metrics.totalCalls ?? 0) / 24).toFixed(1)
    : (
        (data?.metrics.totalCalls ?? 0) /
        (dateRange === '7d' ? 7 : 14)
      ).toFixed(1);

  const activityLabel = is24h ? 'Calls per hour avg' : 'Calls per day average';

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header with Date Range Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Call Analytics</h2>
          <Badge variant="outline" className="gap-1 hidden sm:inline-flex">
            Last {dateRange === '1d' ? '24 hours' : dateRange === '7d' ? '7 days' : '14 days'}
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
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-1.5">
              <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{data.metrics.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {data.metrics.totalCalls > 0 ? 'in selected period' : 'No calls yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Booking Rate</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.metrics.bookingRate}%</div>
            <p className="text-xs text-muted-foreground">
              {data.outcomesDistribution.find(o => o.outcome === 'BOOKED')?.count || 0} booked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Avg. Call Time</CardTitle>
            <div className="rounded-md bg-violet-500/10 p-1.5">
              <Clock className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{formatTime(data.metrics.avgCallTime)}</div>
            <p className="text-xs text-muted-foreground">Average per call</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <div className="rounded-md bg-amber-500/10 p-1.5">
              <Calendar className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-2xl font-bold">{activityValue}</div>
            <p className="text-xs text-muted-foreground">{activityLabel}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row: Outcomes + Satisfaction + Duration */}
      <div className="grid gap-3 md:grid-cols-3">
        <CallOutcomesChart data={data.outcomesDistribution} />
        <SatisfactionChart data={data.satisfactionBreakdown ?? []} />
        <CallDurationChart data={data.callDurations} totalCalls={data.metrics.totalCalls} />
      </div>

      {/* Activity Trend + Recent Calls side by side */}
      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-3">
          <ActivityChart data={data.activityTrend} is24h={is24h} />
        </div>
        <div className="md:col-span-2">
          <RecentCallsList />
        </div>
      </div>
    </div>
  );
}
