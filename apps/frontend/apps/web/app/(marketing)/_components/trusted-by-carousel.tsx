'use client';

import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';

const QUEBEC_CLINICS = [
  { name: 'Centre Dentaire Laval', logo: null },
  { name: 'Clinique Dentaire Montreal', logo: null },
  { name: 'Dentistes Rive-Sud', logo: null },
  { name: 'Clinique Dentaire Quebec', logo: null },
  { name: 'Centre Dentaire Longueuil', logo: null },
  { name: 'Clinique Dentaire Gatineau', logo: null },
  { name: 'Dentistes Sherbrooke', logo: null },
  { name: 'Centre Dentaire Trois-Rivières', logo: null },
];

export function TrustedByCarousel() {
  // Triple the clinics for seamless infinite scroll
  const extendedClinics = [...QUEBEC_CLINICS, ...QUEBEC_CLINICS, ...QUEBEC_CLINICS];

  return (
    <div className="w-full overflow-hidden py-12">
      <div className="container mx-auto">
        <h3 className="text-muted-foreground mb-8 text-center text-sm font-medium uppercase tracking-wider">
          <Trans i18nKey="marketing:trustedBy" />
        </h3>
        
        <div className="relative">
          <div className="overflow-hidden">
            {/* Infinite scroll animation - pauses on hover */}
            <div 
              className="flex hover:pause-animation"
              style={{
                animation: 'scroll-left 30s linear infinite',
              }}
            >
              {extendedClinics.map((clinic, index) => (
                <div
                  key={`${clinic.name}-${index}`}
                  className="flex min-w-[300px] shrink-0 items-center justify-center px-4"
                >
                  <div
                    className={cn(
                      'bg-muted/30 flex h-24 w-full items-center justify-center rounded-lg border border-border/50 transition-all duration-300',
                      'hover:border-primary/50 hover:bg-muted/50',
                    )}
                  >
                    {clinic.logo ? (
                      <img
                        src={clinic.logo}
                        alt={clinic.name}
                        className="h-12 object-contain opacity-70 transition-opacity hover:opacity-100"
                      />
                    ) : (
                      <span className="text-muted-foreground px-4 text-center text-sm font-medium">
                        {clinic.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gradient overlays for smooth edges */}
          <div className="pointer-events-none absolute left-0 top-0 h-full w-32 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-background to-transparent z-10" />
        </div>
      </div>

      <style jsx global>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }

        .hover\\:pause-animation:hover {
          animation-play-state: paused !important;
        }
      `}</style>
    </div>
  );
}
