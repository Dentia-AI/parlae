'use client';

import { Card } from '@kit/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';

const INTEGRATIONS = [
  {
    name: 'Dentrix',
    descKey: 'integrationDentrix',
    logo: null,
    status: 'available',
  },
  {
    name: 'Eaglesoft',
    descKey: 'integrationEaglesoft',
    logo: null,
    status: 'available',
  },
  {
    name: 'Open Dental',
    descKey: 'integrationOpenDental',
    logo: null,
    status: 'available',
  },
  {
    name: 'Curve',
    descKey: 'integrationCurve',
    logo: null,
    status: 'available',
  },
  {
    name: 'Sikka',
    descKey: 'integrationSikka',
    logo: null,
    status: 'available',
  },
  {
    name: 'More Coming',
    descKey: 'integrationMoreComing',
    logo: null,
    status: 'coming-soon',
  },
];

export function IntegrationsSection() {
  return (
    <div className="bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight">
            <Trans i18nKey="marketing:integrationsTitle" />
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            <Trans i18nKey="marketing:integrationsSubtitle" />
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((integration, index) => (
            <Card
              key={index}
              className={cn(
                'border-border/50 group relative overflow-hidden p-6 transition-all duration-300',
                integration.status === 'available'
                  ? 'hover:border-primary/50 hover:shadow-lg'
                  : 'opacity-70',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {integration.logo ? (
                    <img
                      src={integration.logo}
                      alt={integration.name}
                      className="mb-4 h-12 object-contain"
                    />
                  ) : (
                    <div className="bg-primary/10 mb-4 inline-flex rounded-lg px-4 py-2">
                      <span className="text-primary font-semibold">
                        {integration.name}
                      </span>
                    </div>
                  )}
                  <p className="text-muted-foreground text-sm">
                    <Trans i18nKey={`marketing:${integration.descKey}`} />
                  </p>
                </div>

                {integration.status === 'available' && (
                  <div className="bg-primary/10 text-primary ml-4 rounded-full p-1">
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </div>

              {integration.status === 'coming-soon' && (
                <div className="absolute right-4 top-4">
                  <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium">
                    <Trans i18nKey="marketing:comingSoon" />
                  </span>
                </div>
              )}

              {/* Hover effect */}
              {integration.status === 'available' && (
                <div className="bg-primary/5 absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              )}
            </Card>
          ))}
        </div>

        {/* API section */}
        <div className="mt-16 text-center">
          <Card className="border-primary/20 bg-primary/5 mx-auto max-w-2xl p-8">
            <h3 className="mb-3 text-xl font-semibold">
              <Trans i18nKey="marketing:dontSeePMS" />
            </h3>
            <p className="text-muted-foreground mb-6">
              <Trans i18nKey="marketing:customIntegrationDesc" />
            </p>
            <button className="bg-primary hover:bg-primary/90 rounded-lg px-6 py-3 font-medium text-white transition-colors">
              <Trans i18nKey="marketing:requestCustomIntegration" />
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
