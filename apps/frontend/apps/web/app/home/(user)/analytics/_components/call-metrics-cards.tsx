'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function MetricCard({ title, value, subtitle, icon: Icon, trend }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <p className="text-xs text-muted-foreground mt-1">
            <span className={trend.isPositive ? 'text-green-600' : 'text-red-600'}>
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>{' '}
            from previous period
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface CallMetricsCardsProps {
  metrics: {
    totalCalls: number;
    bookingRate: number;
    avgCallTime: number;
    activityPerDay: number;
  };
}

export function CallMetricsCards({ metrics }: CallMetricsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {/* Metrics cards would go here */}
    </div>
  );
}
