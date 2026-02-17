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
  DollarSign,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '@kit/shared/utils';

import { CallMetricsCards } from './call-metrics-cards';
import { CallOutcomesChart } from './call-outcomes-chart';
import { RecentCallsList } from './recent-calls-list';
import { ActivityChart } from './activity-chart';

interface AnalyticsData {
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalCalls: number;
    bookingRate: number;
    avgCallTime: number;
    insuranceVerified: number;
    paymentPlans: {
      count: number;
      totalAmount: number;
    };
    collections: {
      count: number;
      totalAmount: number;
      recovered: number;
      collectionRate: number;
    };
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

  const locale = 'en-US';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header with Date Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Call Analytics</h2>
          <Badge variant="outline" className="gap-1">
            Last {dateRange === '1d' ? '24 hours' : dateRange === '7d' ? '7 days' : '14 days'}
          </Badge>
        </div>

        <div className="flex gap-2">
          <Button
            variant={dateRange === '1d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('1d')}
          >
            24 Hours
          </Button>
          <Button
            variant={dateRange === '7d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('7d')}
          >
            7 Days
          </Button>
          <Button
            variant={dateRange === '14d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('14d')}
          >
            14 Days
          </Button>
          <Button variant="outline" size="sm" className="gap-1">
            <Calendar className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <div className="rounded-md bg-blue-500/10 p-2">
              <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.metrics.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.metrics.totalCalls > 0
                ? `${data.metrics.totalCalls} in selected period`
                : 'No calls yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booking Rate</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-2">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.metrics.bookingRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.outcomesDistribution.find(o => o.outcome === 'BOOKED')?.count || 0} appointments booked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Call Time</CardTitle>
            <div className="rounded-md bg-violet-500/10 p-2">
              <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(data.metrics.avgCallTime)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Average duration per call
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <div className="rounded-md bg-amber-500/10 p-2">
              <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(data.metrics.totalCalls / (dateRange === '1d' ? 1 : dateRange === '7d' ? 7 : 14)).toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Calls per day average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Insurance Verified</CardTitle>
            <div className="rounded-md bg-cyan-500/10 p-2">
              <CheckCircle className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.metrics.insuranceVerified.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.metrics.totalCalls > 0 
                ? Math.round((data.metrics.insuranceVerified / data.metrics.totalCalls) * 100) 
                : 0}% verification rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Plans</CardTitle>
            <div className="rounded-md bg-indigo-500/10 p-2">
              <DollarSign className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency({
                value: data.metrics.paymentPlans.totalAmount / 100,
                currencyCode: 'USD',
                locale,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.metrics.paymentPlans.count} plans discussed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collections</CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-2">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency({
                value: data.metrics.collections.recovered / 100,
                currencyCode: 'USD',
                locale,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              recovered from outstanding
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <div className="rounded-md bg-teal-500/10 p-2">
              <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {data.metrics.collections.collectionRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.metrics.collections.count > 0 ? `${data.metrics.collections.count} collected` : '--'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActivityChart data={data.activityTrend} />
        <CallOutcomesChart data={data.outcomesDistribution} />
      </div>

      {/* Recent Calls */}
      <RecentCallsList />
    </div>
  );
}
