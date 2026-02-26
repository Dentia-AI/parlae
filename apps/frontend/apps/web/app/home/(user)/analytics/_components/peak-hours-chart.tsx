'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Clock } from 'lucide-react';

interface DurationBucket {
  label: string;
  range: string;
  count: number;
  color: string;
}

interface CallDurationChartProps {
  data?: Array<{ duration: number }>;
  totalCalls: number;
}

function bucketize(durations: number[]): DurationBucket[] {
  const buckets = [
    { label: '<30s', range: '0-30s', min: 0, max: 30, color: 'from-rose-400 to-rose-500', count: 0 },
    { label: '30s-1m', range: '30s–1m', min: 30, max: 60, color: 'from-amber-400 to-amber-500', count: 0 },
    { label: '1-2m', range: '1–2 min', min: 60, max: 120, color: 'from-sky-400 to-sky-500', count: 0 },
    { label: '2-3m', range: '2–3 min', min: 120, max: 180, color: 'from-blue-400 to-blue-500', count: 0 },
    { label: '3-5m', range: '3–5 min', min: 180, max: 300, color: 'from-violet-400 to-violet-500', count: 0 },
    { label: '5m+', range: '5+ min', min: 300, max: Infinity, color: 'from-emerald-400 to-emerald-500', count: 0 },
  ];

  for (const d of durations) {
    const bucket = buckets.find(b => d >= b.min && d < b.max);
    if (bucket) bucket.count++;
  }

  return buckets.map(b => ({ label: b.label, range: b.range, count: b.count, color: b.color }));
}

export function CallDurationChart({ data, totalCalls }: CallDurationChartProps) {
  const { t } = useTranslation('common');
  const durations = (data ?? []).map(d => d.duration);
  const buckets = bucketize(durations);
  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 0;
  const avgMin = Math.floor(avgDuration / 60);
  const avgSec = avgDuration % 60;

  const medianDuration = durations.length > 0
    ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]!
    : 0;
  const medMin = Math.floor(medianDuration / 60);
  const medSec = medianDuration % 60;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t('dashboard.callDuration')}</CardTitle>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{t('dashboard.distribution')}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 pt-0">
        {totalCalls === 0 ? (
          <div className="text-center py-8 text-muted-foreground flex-1 flex items-center justify-center">
            {t('dashboard.noDurationData')}
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1">
            {/* Histogram bars */}
            <div className="flex items-end gap-1.5 h-28">
              {buckets.map((bucket, i) => {
                const height = (bucket.count / maxCount) * 100;
                const pct = totalCalls > 0 ? Math.round((bucket.count / totalCalls) * 100) : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full group">
                    <span className="text-[10px] font-semibold text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                      {bucket.count > 0 ? `${bucket.count} (${pct}%)` : ''}
                    </span>
                    <div className="relative w-full flex-1">
                      <div
                        className={`absolute bottom-0 left-0.5 right-0.5 bg-gradient-to-t ${bucket.color} rounded-t-md hover:brightness-110 transition-all cursor-pointer`}
                        style={{ height: `${Math.max(height, bucket.count > 0 ? 6 : 2)}%` }}
                        title={`${bucket.range}: ${bucket.count} calls (${pct}%)`}
                      />
                    </div>
                    <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                      {bucket.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Stats */}
            <div className="space-y-1.5 pt-2 border-t mt-auto">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.average')}</span>
                <span className="font-semibold tabular-nums">{avgMin}m {avgSec}s</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.median')}</span>
                <span className="font-semibold tabular-nums">{medMin}m {medSec}s</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
