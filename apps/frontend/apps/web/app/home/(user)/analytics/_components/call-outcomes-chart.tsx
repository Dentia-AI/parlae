'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

interface CallOutcomesChartProps {
  data: Array<{
    outcome: string;
    count: number;
    percentage: number;
  }>;
}

const outcomeColors: Record<string, { dot: string; bar: string; label: string }> = {
  BOOKED: {
    dot: 'bg-emerald-500',
    bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    label: 'Booked',
  },
  TRANSFERRED: {
    dot: 'bg-blue-500',
    bar: 'bg-gradient-to-r from-blue-500 to-blue-400',
    label: 'Transferred',
  },
  INSURANCE_INQUIRY: {
    dot: 'bg-violet-500',
    bar: 'bg-gradient-to-r from-violet-500 to-violet-400',
    label: 'Insurance Inquiry',
  },
  PAYMENT_PLAN: {
    dot: 'bg-amber-500',
    bar: 'bg-gradient-to-r from-amber-500 to-amber-400',
    label: 'Payment Plan',
  },
  INFORMATION: {
    dot: 'bg-cyan-500',
    bar: 'bg-gradient-to-r from-cyan-500 to-cyan-400',
    label: 'Information',
  },
  VOICEMAIL: {
    dot: 'bg-slate-500',
    bar: 'bg-gradient-to-r from-slate-500 to-slate-400',
    label: 'Voicemail',
  },
  NO_ANSWER: {
    dot: 'bg-rose-400',
    bar: 'bg-gradient-to-r from-rose-400 to-rose-300',
    label: 'No Answer',
  },
  OTHER: {
    dot: 'bg-orange-500',
    bar: 'bg-gradient-to-r from-orange-500 to-orange-400',
    label: 'Other',
  },
};

export function CallOutcomesChart({ data }: CallOutcomesChartProps) {
  const sortedData = [...data].sort((a, b) => b.count - a.count);
  const totalCalls = sortedData.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Call Outcomes</CardTitle>
          {totalCalls > 0 && (
            <span className="text-sm text-muted-foreground">
              {totalCalls} total
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {sortedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No call outcome data available
            </div>
          ) : (
            sortedData.map((item, index) => {
              const config = outcomeColors[item.outcome] || outcomeColors.OTHER!;

              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${config.dot} ring-2 ring-offset-2 ring-offset-background ring-${config.dot.replace('bg-', '')}/30`} />
                      <span className="font-medium">{config.label}</span>
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
