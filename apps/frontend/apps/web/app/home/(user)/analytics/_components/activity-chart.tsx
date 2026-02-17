'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { TrendingUp } from 'lucide-react';

interface ActivityChartProps {
  data: Array<{
    date: string;
    count: number;
  }>;
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

export function ActivityChart({ data }: ActivityChartProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity</CardTitle>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Daily Trend</span>
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
            <>
              <div className="flex items-end justify-between gap-2 h-36">
                {data.map((item, index) => {
                  const height = (item.count / maxCount) * 100;
                  const date = new Date(item.date);
                  const dayLabel = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                  const gradient = barColors[index % barColors.length]!;

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center gap-1.5 group h-full"
                    >
                      {item.count > 0 && (
                        <span className="text-xs font-semibold text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.count}
                        </span>
                      )}
                      <div className="relative w-full flex-1">
                        <div
                          className={`absolute bottom-0 left-1 right-1 bg-gradient-to-t ${gradient} rounded-t-md shadow-sm hover:shadow-md hover:brightness-110 transition-all cursor-pointer`}
                          style={{ height: `${Math.max(height, 3)}%` }}
                          title={`${item.count} calls on ${dayLabel}`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground group-hover:text-foreground font-medium transition-colors">
                        {date.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-500" />
                  <span>Calls per day</span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
