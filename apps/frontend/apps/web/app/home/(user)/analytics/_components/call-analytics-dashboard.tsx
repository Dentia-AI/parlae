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
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      if (dateRange === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (dateRange === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      } else {
        startDate.setDate(startDate.getDate() - 90);
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
    <div className="space-y-6">
      {/* Header with Date Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Call Analytics</h2>
          <Badge variant="outline" className="gap-1">
            Last {dateRange === '7d' ? '7 days' : dateRange === '30d' ? '30 days' : '90 days'}
          </Badge>
        </div>

        <div className="flex gap-2">
          <Button
            variant={dateRange === '7d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('7d')}
          >
            7 Days
          </Button>
          <Button
            variant={dateRange === '30d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('30d')}
          >
            30 Days
          </Button>
          <Button
            variant={dateRange === '90d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('90d')}
          >
            90 Days
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
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.metrics.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">+23%</span> from previous period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booking Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.metrics.bookingRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.outcomesDistribution.find(o => o.outcome === 'BOOKED')?.count || 0} appointments booked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Call Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
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
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(data.metrics.totalCalls / (dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90))}
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
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
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
            <DollarSign className="h-4 w-4 text-muted-foreground" />
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
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency({
                value: data.metrics.collections.recovered / 100,
                currencyCode: 'USD',
                locale,
              })}
            </div>
            <p className="text-xs text-success-foreground mt-1">recovered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {data.metrics.collections.collectionRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.metrics.collections.count > 0 ? `+12%` : '--'}
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
