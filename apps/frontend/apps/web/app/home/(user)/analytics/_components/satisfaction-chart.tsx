'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

interface SatisfactionEntry {
  label: string;
  count: number;
  percentage: number;
}

interface SatisfactionChartProps {
  data: SatisfactionEntry[];
}

const satisfactionColors: Record<string, string> = {
  Satisfied: '#10b981',
  'Not Satisfied': '#f43f5e',
  Unknown: '#94a3b8',
};

function DonutSegments({
  data,
  size = 180,
  strokeWidth = 32,
  satisfiedLabel = 'satisfied',
}: {
  data: SatisfactionEntry[];
  size?: number;
  strokeWidth?: number;
  satisfiedLabel?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground text-sm"
        >
          —
        </text>
      </svg>
    );
  }

  const satisfiedEntry = data.find((d) => d.label === 'Satisfied');
  const satisfiedPct =
    satisfiedEntry && total > 0
      ? Math.round((satisfiedEntry.count / total) * 100)
      : 0;

  let cumulativePercentage = 0;
  const segments = data.filter((d) => d.count > 0);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((item, i) => {
        const pct = item.count / total;
        const dashLength = pct * circumference;
        const gapLength = circumference - dashLength;
        const offset =
          -cumulativePercentage * circumference + circumference * 0.25;
        cumulativePercentage += pct;
        const color = satisfactionColors[item.label] ?? '#94a3b8';

        return (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLength} ${gapLength}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            className="transition-all duration-500"
          />
        );
      })}
      <text
        x={center}
        y={center - 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-2xl font-bold"
        style={{ fontSize: '1.5rem', fontWeight: 700 }}
      >
        {satisfiedPct}%
      </text>
      <text
        x={center}
        y={center + 14}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-muted-foreground"
        style={{ fontSize: '0.75rem' }}
      >
        {satisfiedLabel}
      </text>
    </svg>
  );
}

export function SatisfactionChart({ data }: SatisfactionChartProps) {
  const { t } = useTranslation('common');
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('dashboard.callerSatisfaction')}</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('dashboard.noSatisfactionData')}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <DonutSegments data={data} satisfiedLabel={t('dashboard.satisfied')} />
            <div className="grid grid-cols-1 gap-y-2 w-full max-w-xs">
              {data.map((item, i) => {
                const color = satisfactionColors[item.label] ?? '#94a3b8';
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span>{t(`dashboard.satisfaction.${item.label}`, { defaultValue: item.label })}</span>
                    </div>
                    <span className="tabular-nums font-medium ml-2">
                      {item.count}{' '}
                      <span className="text-muted-foreground text-xs">
                        ({Math.round(item.percentage)}%)
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
