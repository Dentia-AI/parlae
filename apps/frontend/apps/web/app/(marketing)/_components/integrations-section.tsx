'use client';

import { useState } from 'react';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';

const FEATURED_PMS = [
  'DentiTek',
  'Dentrix',
  'EagleSoft',
  'Open Dental',
  'DentiMax',
  'ClearDent',
  'Curve Hero',
  'SoftDent',
  'AbelDent',
  'Maxident',
  'Progident',
  'MacPractice',
  'iDentalSoft',
  'Sensei Cloud',
];

const ALL_PMS: Record<string, string[]> = {
  A: ['AbelDent', 'AkituOne', 'Autopia', 'Axxium VisionR'],
  C: ['ClearDent', 'Curve Hero'],
  D: [
    'DentiTek',
    'DentalVision',
    'Dentech',
    'DentiMax',
    'Dentonovo',
    'Dentrix',
    'Dolphin Management',
    'Domtrak',
    'Dox Pedo',
    'DSN-Dental',
    'DSN-OMS',
    'DSN-Perio',
  ],
  E: ['EagleSoft', 'Easy Dental', 'EndoVision', 'Exceldent'],
  G: ['Genesis', 'Gold'],
  I: ['iDentalSoft'],
  L: ['LiveDDM'],
  M: ['MacPractice', 'Maxident', 'MediaDent', 'Mogo'],
  O: [
    'OCS-Office Partner',
    'OmegaPrax',
    'OMSVision',
    'Open Dental',
    'Opes',
    'Ortho2 ViewPoint',
    'Ortho2Edge',
    'OrthoTrac',
    'Oryx',
  ],
  P: [
    'Paradigm',
    'PBS Endo',
    'PerioVision',
    'PracticeWeb',
    'PracticeWorks',
    'Private Practice Software',
    'Progident',
  ],
  Q: ['QSIDental Web', 'Quadra'],
  S: ['Sensei Cloud', 'SoftDent', 'Software of Excellence', 'SuzyDental'],
  T: ['TDO', 'Total Dental', 'Tracker'],
  W: ['WinDent', 'WinDentSQL', 'WinOMS'],
  X: ['XLDent'],
};

const ALL_PMS_FLAT = Object.values(ALL_PMS).flat();
const PMS_COUNT = ALL_PMS_FLAT.length;

function PmsPill({ name, featured = false }: { name: string; featured?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
        featured
          ? 'border border-primary/20 bg-primary/10 text-primary'
          : 'border border-border/50 bg-muted/50 text-foreground/80',
      )}
    >
      {name}
    </span>
  );
}

function CarouselRow({
  items,
  direction = 'left',
  speed = 40,
}: {
  items: string[];
  direction?: 'left' | 'right';
  speed?: number;
}) {
  const tripled = [...items, ...items, ...items];
  const animationName = direction === 'left' ? 'pms-scroll-left' : 'pms-scroll-right';

  return (
    <div className="relative overflow-hidden">
      <div
        className="flex gap-3 hover:pause-animation"
        style={{ animation: `${animationName} ${speed}s linear infinite` }}
      >
        {tripled.map((name, i) => (
          <PmsPill key={`${name}-${i}`} name={name} featured />
        ))}
      </div>
    </div>
  );
}

export function IntegrationsSection() {
  const [open, setOpen] = useState(false);

  const row1 = FEATURED_PMS.slice(0, 7);
  const row2 = FEATURED_PMS.slice(7);

  return (
    <div className="bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight">
            <Trans i18nKey="marketing:integrationsTitle" />
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            <Trans i18nKey="marketing:integrationsSubtitle" />
          </p>
          <p className="text-primary mt-2 text-sm font-semibold">
            <Trans i18nKey="marketing:pmsCount" values={{ count: PMS_COUNT }} />
          </p>
        </div>

        {/* Animated carousel */}
        <div className="relative mx-auto max-w-5xl space-y-3">
          <CarouselRow items={row1} direction="left" speed={35} />
          <CarouselRow items={row2} direction="right" speed={40} />

          {/* Gradient fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-muted/30 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-muted/30 to-transparent" />
        </div>

        {/* View All button */}
        <div className="mt-10 text-center">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="border-primary/30 text-primary hover:bg-primary/5 inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition-colors">
                <Trans i18nKey="marketing:viewAllIntegrations" />
                <span className="bg-primary/10 rounded-full px-2 py-0.5 text-xs">
                  {PMS_COUNT}
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  <Trans i18nKey="marketing:allIntegrations" />
                </DialogTitle>
              </DialogHeader>

              {/* DentiTek highlight */}
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold">
                    DentiTek
                  </span>
                  <span className="text-muted-foreground text-sm">
                    <Trans i18nKey="marketing:featuredIntegration" />
                  </span>
                </div>
              </div>

              {/* Alphabetical grid */}
              <div className="space-y-5">
                {Object.entries(ALL_PMS).map(([letter, systems]) => (
                  <div key={letter}>
                    <h4 className="text-muted-foreground mb-2 text-xs font-bold uppercase tracking-widest">
                      {letter}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {systems.map((name) => (
                        <span
                          key={name}
                          className={cn(
                            'rounded-md border px-3 py-2 text-center text-sm transition-colors',
                            name === 'DentiTek'
                              ? 'border-primary/30 bg-primary/5 font-medium text-primary'
                              : 'border-border/50 bg-muted/30 text-foreground/80 hover:border-primary/30 hover:bg-primary/5',
                          )}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* SEO: hidden list of all PMS names for crawlers */}
        <ul className="sr-only" aria-label="Supported practice management systems">
          {ALL_PMS_FLAT.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>

        {/* Don't see your PMS? CTA */}
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

      <style jsx global>{`
        @keyframes pms-scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        @keyframes pms-scroll-right {
          0% { transform: translateX(-33.333%); }
          100% { transform: translateX(0); }
        }
        .hover\\:pause-animation:hover {
          animation-play-state: paused !important;
        }
      `}</style>
    </div>
  );
}
