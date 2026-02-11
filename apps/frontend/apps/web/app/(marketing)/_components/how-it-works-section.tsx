'use client';

import { Play } from 'lucide-react';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';

const STEPS = [
  {
    number: '01',
    titleKey: 'stepConnectTitle',
    descKey: 'stepConnectDesc',
    color: 'from-blue-500 to-purple-500',
  },
  {
    number: '02',
    titleKey: 'stepCustomizeTitle',
    descKey: 'stepCustomizeDesc',
    color: 'from-purple-500 to-pink-500',
  },
  {
    number: '03',
    titleKey: 'stepForwardTitle',
    descKey: 'stepForwardDesc',
    color: 'from-pink-500 to-orange-500',
  },
  {
    number: '04',
    titleKey: 'stepWatchTitle',
    descKey: 'stepWatchDesc',
    color: 'from-orange-500 to-green-500',
  },
];

export function HowItWorksSection() {
  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mb-16 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">
          <Trans i18nKey="marketing:howItWorksTitle" />
        </h2>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          <Trans i18nKey="marketing:howItWorksSubtitle" />
        </p>
      </div>

      <div className="relative">
        {/* Connection lines */}
        <div className="absolute left-1/2 top-0 hidden h-full w-0.5 bg-gradient-to-b from-primary/50 to-transparent lg:block" />

        <div className="space-y-12">
          {STEPS.map((step, index) => (
            <div
              key={index}
              className={cn(
                'relative grid gap-8 lg:grid-cols-2',
                index % 2 === 0 ? 'lg:text-right' : 'lg:flex-row-reverse',
              )}
            >
              {/* Content */}
              <div
                className={cn(
                  'flex flex-col justify-center',
                  index % 2 === 0 ? 'lg:items-end' : 'lg:col-start-2',
                )}
              >
                <Card
                  className={cn(
                    'border-border/50 group max-w-md p-8 transition-all duration-300',
                    'hover:border-primary/50 hover:shadow-lg',
                  )}
                >
                  <div className="mb-4 flex items-center gap-4">
                    <div
                      className={cn(
                        'flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-bold text-white',
                        step.color,
                      )}
                    >
                      {step.number}
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/50 to-transparent" />
                  </div>
                  <h3 className="mb-3 text-2xl font-semibold">
                    <Trans i18nKey={`marketing:${step.titleKey}`} />
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    <Trans i18nKey={`marketing:${step.descKey}`} />
                  </p>
                </Card>
              </div>

              {/* Visual placeholder */}
              <div
                className={cn(
                  'flex items-center justify-center',
                  index % 2 === 0 ? 'lg:col-start-2' : 'lg:col-start-1 lg:row-start-1',
                )}
              >
                <div className="bg-muted/50 flex h-64 w-full max-w-md items-center justify-center rounded-xl border border-border/50">
                  <div
                    className={cn(
                      'flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br',
                      step.color,
                    )}
                  >
                    <Play className="h-10 w-10 text-white" />
                  </div>
                </div>
              </div>

              {/* Center indicator */}
              <div className="absolute left-1/2 top-1/2 hidden h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-lg shadow-primary/50 lg:block" />
            </div>
          ))}
        </div>
      </div>

      {/* Setup time callout */}
      <div className="mt-16 text-center">
        <Card className="border-primary/20 bg-primary/5 mx-auto max-w-2xl p-8">
          <div className="flex items-center justify-center gap-4">
            <div className="text-primary text-5xl font-bold">5</div>
            <div className="text-left">
              <div className="text-xl font-semibold">
                <Trans i18nKey="marketing:minutesToSetup" />
              </div>
              <p className="text-muted-foreground text-sm">
                <Trans i18nKey="marketing:averageSetupTime" />
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
