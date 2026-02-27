'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { TrendingUp } from 'lucide-react';

interface ActivityChartProps {
  data: Array<{
    date: string;
    count: number;
  }>;
  is24h?: boolean;
}

const barColors = [
  'from-violet-500 to-violet-600',
  'from-indigo-500 to-indigo-600',
  'from-blue-500 to-blue-600',
  'from-sky-500 to-sky-600',
  'from-cyan-500 to-cyan-600',
  'from-teal-500 to-teal-600',
  'from-emerald-500 to-emerald-600',
  'from-green-500 to-green-600',
  'from-violet-500 to-violet-600',
  'from-indigo-500 to-indigo-600',
  'from-blue-500 to-blue-600',
  'from-sky-500 to-sky-600',
  'from-cyan-500 to-cyan-600',
  'from-teal-500 to-teal-600',
];

function formatBarLabel(dateStr: string, is24h: boolean): string {
  if (is24h) {
    const date = new Date(dateStr);
    const h = date.getHours();
    if (h === 0) return '12a';
    if (h === 12) return '12p';
    return h > 12 ? `${h - 12}p` : `${h}a`;
  }
  return String(new Date(dateStr).getDate());
}

function formatTooltip(dateStr: string, count: number, is24h: boolean): string {
  if (is24h) {
    const date = new Date(dateStr);
    const h = date.getHours();
    const label = h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
    return `${count} calls at ${label}`;
  }
  const date = new Date(dateStr);
  const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${count} calls on ${dayLabel}`;
}

export function ActivityChart({ data, is24h = false }: ActivityChartProps) {
  const { t } = useTranslation('common');
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const trendLabel = is24h ? t('dashboard.hourlyTrend') : t('dashboard.dailyTrend');
  const legendLabel = is24h ? t('dashboard.callsPerHour') : t('dashboard.callsPerDay');

  const showEveryN = is24h && data.length > 12 ? 2 : 1;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t('dashboard.activityTrend')}</CardTitle>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>{trendLabel}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('dashboard.noActivityData')}
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-1 sm:gap-2 h-36">
                {data.map((item, index) => {
                  const height = (item.count / maxCount) * 100;
                  const gradient = barColors[index % barColors.length]!;
                  const label = formatBarLabel(item.date, is24h);
                  const showLabel = index % showEveryN === 0;

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center gap-1.5 group h-full min-w-0"
                    >
                      {item.count > 0 && (
                        <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.count}
                        </span>
                      )}
                      <div className="relative w-full flex-1">
                        <div
                          className={`absolute bottom-0 left-0.5 right-0.5 sm:left-1 sm:right-1 bg-gradient-to-t ${gradient} rounded-t-md shadow-sm hover:shadow-md hover:brightness-110 transition-all cursor-pointer`}
                          style={{ height: `${Math.max(height, item.count > 0 ? 6 : 2)}%` }}
                          title={formatTooltip(item.date, item.count, is24h)}
                        />
                      </div>
                      {showLabel && (
                        <span className="text-[9px] sm:text-xs text-muted-foreground group-hover:text-foreground font-medium transition-colors truncate">
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-500" />
                  <span>{legendLabel}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
