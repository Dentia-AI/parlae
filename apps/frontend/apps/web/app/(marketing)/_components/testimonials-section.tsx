'use client';

import { Star, Quote } from 'lucide-react';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';

const TESTIMONIALS = [
  {
    nameKey: 'testimonial1Name',
    titleKey: 'testimonial1Title',
    quoteKey: 'testimonial1Quote',
    image: null,
    rating: 5,
  },
  {
    nameKey: 'testimonial2Name',
    titleKey: 'testimonial2Title',
    quoteKey: 'testimonial2Quote',
    image: null,
    rating: 5,
  },
  {
    nameKey: 'testimonial3Name',
    titleKey: 'testimonial3Title',
    quoteKey: 'testimonial3Quote',
    image: null,
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mb-16 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">
          <Trans i18nKey="marketing:testimonialsTitle" />
        </h2>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          <Trans i18nKey="marketing:testimonialsSubtitle" />
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((testimonial, index) => (
          <Card
            key={index}
            className={cn(
              'border-border/50 relative p-8 transition-all duration-300',
              'hover:border-primary/50 hover:shadow-lg',
            )}
          >
            {/* Quote icon */}
            <Quote className="text-primary/20 absolute right-8 top-8 h-12 w-12" />

            {/* Rating */}
            <div className="mb-4 flex gap-1">
              {[...Array(testimonial.rating)].map((_, i) => (
                <Star
                  key={i}
                  className="text-primary h-4 w-4 fill-current"
                />
              ))}
            </div>

            {/* Quote */}
            <p className="text-muted-foreground relative z-10 mb-6 leading-relaxed">
              "<Trans i18nKey={`marketing:${testimonial.quoteKey}`} />"
            </p>

            {/* Author */}
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                <span className="text-primary text-lg font-semibold">
                  {/* Show first letter of name - use English version for initial */}
                  D
                </span>
              </div>
              <div>
                <div className="font-semibold">
                  <Trans i18nKey={`marketing:${testimonial.nameKey}`} />
                </div>
                <div className="text-muted-foreground text-sm">
                  <Trans i18nKey={`marketing:${testimonial.titleKey}`} />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Stats section */}
      <div className="mt-16 grid gap-8 md:grid-cols-3">
        <div className="text-center">
          <div className="text-primary mb-2 text-4xl font-bold">500+</div>
          <div className="text-muted-foreground text-sm">
            <Trans i18nKey="marketing:statActiveClinics" />
          </div>
        </div>
        <div className="text-center">
          <div className="text-primary mb-2 text-4xl font-bold">50K+</div>
          <div className="text-muted-foreground text-sm">
            <Trans i18nKey="marketing:statCallsHandled" />
          </div>
        </div>
        <div className="text-center">
          <div className="text-primary mb-2 text-4xl font-bold">98%</div>
          <div className="text-muted-foreground text-sm">
            <Trans i18nKey="marketing:statSatisfaction" />
          </div>
        </div>
      </div>
    </div>
  );
}
