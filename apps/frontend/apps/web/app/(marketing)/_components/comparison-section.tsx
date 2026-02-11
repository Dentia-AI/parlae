'use client';

import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';
import { HipaaInlineBadge } from './hipaa-badge';

const COMPARISON_DATA = [
  {
    featureKey: 'compAvailability',
    traditionalKey: 'trad9to5',
    parlaeKey: 'trad247',
    highlight: true,
  },
  {
    featureKey: 'compResponseTime',
    traditionalKey: 'tradWait',
    parlaeKey: 'tradInstant',
    highlight: true,
  },
  {
    featureKey: 'compCallVolume',
    traditionalKey: 'tradLimited',
    parlaeKey: 'tradUnlimited',
    highlight: false,
  },
  {
    featureKey: 'compLanguages',
    traditionalKey: 'tradFewLanguages',
    parlaeKey: 'tradMultiLanguages',
    highlight: false,
  },
  {
    featureKey: 'compConsistency',
    traditionalKey: 'tradVaries',
    parlaeKey: 'tradPerfect',
    highlight: false,
  },
  {
    featureKey: 'compPMSIntegration',
    traditionalKey: 'tradManual',
    parlaeKey: 'tradAutoSync',
    highlight: true,
  },
  {
    featureKey: 'compCostPerCall',
    traditionalKey: 'tradCostHigh',
    parlaeKey: 'tradCostLow',
    highlight: true,
  },
  {
    featureKey: 'compTraining',
    traditionalKey: 'tradWeeks',
    parlaeKey: 'tradMinutes',
    highlight: false,
  },
];

export function ComparisonSection() {
  return (
    <div className="bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight">
            <Trans i18nKey="marketing:comparisonTitle" />
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            <Trans i18nKey="marketing:comparisonSubtitle" />
          </p>
        </div>

        <Card className="border-border/50 mx-auto max-w-4xl overflow-hidden">
          {/* Header */}
          <div className="bg-muted/50 grid grid-cols-3 gap-4 p-6">
            <div className="text-muted-foreground text-sm font-medium">
              <Trans i18nKey="marketing:featureLabel" />
            </div>
            <div className="text-center text-sm font-medium">
              <Trans i18nKey="marketing:traditionalService" />
            </div>
            <div className="bg-primary/10 text-primary rounded-lg text-center text-sm font-semibold">
              Parlae AI
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/50">
            {COMPARISON_DATA.map((row, index) => (
              <div
                key={index}
                className={cn(
                  'grid grid-cols-3 gap-4 p-6 transition-colors',
                  row.highlight && 'bg-primary/5',
                )}
              >
                <div className="flex items-center font-medium">
                  <Trans i18nKey={`marketing:${row.featureKey}`} />
                </div>
                <div className="text-muted-foreground flex items-center justify-center text-center text-sm">
                  <Trans i18nKey={`marketing:${row.traditionalKey}`} />
                </div>
                <div className="text-primary flex items-center justify-center text-center text-sm font-semibold">
                  <Trans i18nKey={`marketing:${row.parlaeKey}`} />
                </div>
              </div>
            ))}
          </div>

          {/* Footer CTA */}
          <div className="bg-primary/5 border-primary/20 border-t p-8 text-center">
            <p className="text-muted-foreground mb-4 text-sm">
              <Trans i18nKey="marketing:compFooter" />
            </p>
            <div className="flex items-center justify-center">
              <HipaaInlineBadge />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
