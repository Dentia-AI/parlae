'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';

interface CallOutcomesChartProps {
  data: Array<{
    outcome: string;
    count: number;
    percentage: number;
  }>;
}

const outcomeColors: Record<string, { bg: string; text: string; label: string }> = {
  BOOKED: { bg: 'bg-green-500', text: 'text-green-500', label: 'Booked' },
  TRANSFERRED: { bg: 'bg-blue-500', text: 'text-blue-500', label: 'Transferred' },
  INSURANCE_INQUIRY: { bg: 'bg-purple-500', text: 'text-purple-500', label: 'Insurance Inquiry' },
  PAYMENT_PLAN: { bg: 'bg-amber-500', text: 'text-amber-500', label: 'Payment Plan' },
  INFORMATION: { bg: 'bg-cyan-500', text: 'text-cyan-500', label: 'Information' },
  VOICEMAIL: { bg: 'bg-gray-500', text: 'text-gray-500', label: 'Voicemail' },
  NO_ANSWER: { bg: 'bg-gray-400', text: 'text-gray-400', label: 'No Answer' },
  OTHER: { bg: 'bg-orange-500', text: 'text-orange-500', label: 'Other' },
};

export function CallOutcomesChart({ data }: CallOutcomesChartProps) {
  const sortedData = [...data].sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Call Outcomes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No call outcome data available
            </div>
          ) : (
            sortedData.map((item, index) => {
              const config = outcomeColors[item.outcome] || outcomeColors.OTHER;

              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${config.bg}`} />
                      <span className="font-medium">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {item.count} ({Math.round(item.percentage)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${config.bg} transition-all duration-300`}
                      style={{ width: `${item.percentage}%` }}
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
