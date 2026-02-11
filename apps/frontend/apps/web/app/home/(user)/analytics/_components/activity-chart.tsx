'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { TrendingUp } from 'lucide-react';

interface ActivityChartProps {
  data: Array<{
    date: string;
    count: number;
  }>;
}

export function ActivityChart({ data }: ActivityChartProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity</CardTitle>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Monthly Trend</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No activity data available
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2 h-32">
              {data.map((item, index) => {
                const height = (item.count / maxCount) * 100;
                const date = new Date(item.date);
                const dayLabel = date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div className="relative w-full">
                      <div
                        className="bg-primary hover:bg-primary/80 transition-all rounded-t-sm cursor-pointer"
                        style={{ height: `${height}%`, minHeight: '4px' }}
                        title={`${item.count} calls on ${dayLabel}`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      {date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
