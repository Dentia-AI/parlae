'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

interface CallOutcomesChartProps {
  data: Array<{
    outcome: string;
    count: number;
    percentage: number;
  }>;
}

const outcomeColors: Record<string, { dot: string; bar: string }> = {
  BOOKED: { dot: 'bg-emerald-500', bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400' },
  TRANSFERRED: { dot: 'bg-blue-500', bar: 'bg-gradient-to-r from-blue-500 to-blue-400' },
  INSURANCE_INQUIRY: { dot: 'bg-violet-500', bar: 'bg-gradient-to-r from-violet-500 to-violet-400' },
  INFORMATION: { dot: 'bg-cyan-500', bar: 'bg-gradient-to-r from-cyan-500 to-cyan-400' },
  HUNG_UP: { dot: 'bg-rose-500', bar: 'bg-gradient-to-r from-rose-500 to-rose-400' },
  EMERGENCY: { dot: 'bg-red-500', bar: 'bg-gradient-to-r from-red-500 to-red-400' },
  RESCHEDULED: { dot: 'bg-amber-500', bar: 'bg-gradient-to-r from-amber-500 to-amber-400' },
  CANCELLED: { dot: 'bg-orange-500', bar: 'bg-gradient-to-r from-orange-500 to-orange-400' },
  OTHER: { dot: 'bg-slate-500', bar: 'bg-gradient-to-r from-slate-500 to-slate-400' },
};

const MAX_VISIBLE = 4;

export function CallOutcomesChart({ data }: CallOutcomesChartProps) {
  const { t } = useTranslation('common');
  const sortedData = [...data].sort((a, b) => b.count - a.count);
  const totalCalls = sortedData.reduce((sum, item) => sum + item.count, 0);

  // Show top 4 categories; group the rest into "Other"
  let displayData = sortedData;
  if (sortedData.length > MAX_VISIBLE + 1) {
    const top = sortedData.slice(0, MAX_VISIBLE);
    const rest = sortedData.slice(MAX_VISIBLE);
    const otherCount = rest.reduce((sum, item) => sum + item.count, 0);
    const otherPct = totalCalls > 0 ? (otherCount / totalCalls) * 100 : 0;
    displayData = [...top, { outcome: 'OTHER', count: otherCount, percentage: otherPct }];
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t('dashboard.callOutcomes')}</CardTitle>
          {totalCalls > 0 && (
            <span className="text-sm text-muted-foreground">
              {t('dashboard.total', { count: totalCalls })}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {displayData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('dashboard.noOutcomeData')}
            </div>
          ) : (
            displayData.map((item, index) => {
              const config = outcomeColors[item.outcome] || outcomeColors.OTHER!;

              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
                      <span className="font-medium">{t(`dashboard.outcomes.${item.outcome}`, { defaultValue: item.outcome })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 tabular-nums">
                      <span className="font-semibold">{item.count}</span>
                      <span className="text-muted-foreground text-xs">
                        ({Math.round(item.percentage)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-secondary/50 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full ${config.bar} rounded-full transition-all duration-500 ease-out`}
                      style={{ width: `${Math.max(item.percentage, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
