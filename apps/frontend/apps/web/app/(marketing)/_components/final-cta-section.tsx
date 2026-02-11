'use client';

import Link from 'next/link';
import { ArrowRight, Shield, Lock, Server } from 'lucide-react';
import { Card } from '@kit/ui/card';
import { cn } from '@kit/ui/utils';
import { Trans } from '@kit/ui/trans';

const BENEFITS = [
  { icon: Shield, key: 'benefitHIPAA' },
  { icon: Lock, key: 'benefitEncryption' },
  { icon: Server, key: 'benefitSOC2' },
];

export function FinalCTASection() {
  return (
    <div className="bg-muted/30 relative overflow-hidden py-24">
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />

      <div className="container relative mx-auto px-4">
        <Card className="border-primary/20 bg-background/95 mx-auto max-w-4xl overflow-hidden backdrop-blur-sm">
          <div className="p-12 text-center">
            <h2 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
              <Trans i18nKey="marketing:finalCTATitle" />
            </h2>
            <p className="text-muted-foreground mx-auto mb-8 max-w-2xl text-lg">
              <Trans i18nKey="marketing:finalCTASubtitle" />
            </p>

            {/* Benefits list */}
            <div className="mb-8 flex flex-wrap items-center justify-center gap-6">
              {BENEFITS.map((benefit, index) => (
                <div key={index} className="flex items-center gap-2">
                  <benefit.icon className="text-green-500 h-5 w-5" />
                  <span className="text-sm font-medium">
                    <Trans i18nKey={`marketing:${benefit.key}`} />
                  </span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/auth/sign-up"
                className={cn(
                  'bg-primary hover:bg-primary/90 group inline-flex items-center gap-2 rounded-lg px-8 py-4 text-lg font-semibold text-white transition-all duration-300',
                  'shadow-lg shadow-primary/50 hover:shadow-xl hover:shadow-primary/50',
                )}
              >
                <Trans i18nKey="marketing:getStarted" />
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/contact"
                className={cn(
                  'border-primary text-primary hover:bg-primary/5 inline-flex items-center gap-2 rounded-lg border-2 px-8 py-4 text-lg font-semibold transition-all duration-300',
                )}
              >
                <Trans i18nKey="marketing:bookADemo" />
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 grid gap-8 border-t border-border/50 pt-12 md:grid-cols-3">
              <div className="text-center">
                <div className="text-primary mb-2 text-3xl font-bold">$50K+</div>
                <div className="text-muted-foreground text-sm">
                  <Trans i18nKey="marketing:statAnnualSavings" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-primary mb-2 text-3xl font-bold">3x</div>
                <div className="text-muted-foreground text-sm">
                  <Trans i18nKey="marketing:statMoreAppointments" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-primary mb-2 text-3xl font-bold">0</div>
                <div className="text-muted-foreground text-sm">
                  <Trans i18nKey="marketing:statMissedCalls" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="bg-muted/50 border-t border-border/50 px-12 py-6">
            <p className="text-muted-foreground text-center text-sm">
              <Trans 
                i18nKey="marketing:trustedByPractices" 
                components={{ strong: <span className="text-primary font-semibold" /> }}
              />
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
