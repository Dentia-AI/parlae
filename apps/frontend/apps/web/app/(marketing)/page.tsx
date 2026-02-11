import Link from 'next/link';

import { ArrowRightIcon } from 'lucide-react';

// Force dynamic rendering to ensure environment variables are read at runtime
export const dynamicParams = true;
export const revalidate = 0;

import { PricingTable } from '@kit/billing-gateway/marketing';
import {
  CtaButton,
  Pill,
  SecondaryHero,
} from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

import billingConfig from '~/config/billing.config';
import pathsConfig from '~/config/paths.config';
import { withI18n } from '~/lib/i18n/with-i18n';
import { getAppUrl } from '~/lib/urls/app-host';

import { NeuralWaveHero } from './_components/neural-wave-hero';
import { TrustedByCarousel } from './_components/trusted-by-carousel';
import { AnimatedFeaturesSection } from './_components/animated-features-section';
import { HowItWorksSection } from './_components/how-it-works-section';
import { IntegrationsSection } from './_components/integrations-section';
import { TestimonialsSection } from './_components/testimonials-section';
import { ComparisonSection } from './_components/comparison-section';
import { FinalCTASection } from './_components/final-cta-section';
import { HipaaBadge } from './_components/hipaa-badge';

function Home() {
  return (
    <div className={'flex flex-col'}>
      {/* Hero Section with Voice Wave Animation */}
      <section className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
        {/* Content - text comes first */}
        <div className="relative z-10 flex min-h-screen items-center pt-20">
          <div className="container mx-auto px-4 text-center">
            <div className="animate-fade-in-up">
              <h1 className="mb-6 mt-8 text-5xl font-bold tracking-tight md:text-7xl">
                <Trans i18nKey="marketing:heroTitle" />
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  <Trans i18nKey="marketing:heroTitleHighlight" />
                </span>
              </h1>
              
              {/* Animation positioned here - below the headline */}
              <div className="relative mx-auto mb-8 h-32 max-w-4xl md:h-40">
                <NeuralWaveHero />
              </div>
              
              <p className="text-muted-foreground mx-auto mb-12 max-w-2xl text-xl">
                <Trans i18nKey="marketing:heroSubtitle" />
              </p>
              
              <MainCallToActionButton />
              
              <div className="mt-12 flex items-center justify-center">
                <HipaaBadge />
              </div>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 animate-bounce">
          <div className="border-muted-foreground/30 h-8 w-5 rounded-full border-2">
            <div className="bg-muted-foreground/50 mx-auto mt-2 h-2 w-1 animate-pulse rounded-full" />
          </div>
        </div>
      </section>

      {/* Trusted By Carousel */}
      <TrustedByCarousel />

      {/* Features Section */}
      <div id="features">
        <AnimatedFeaturesSection />
      </div>

      {/* How It Works */}
      <HowItWorksSection />

      {/* Integrations */}
      <div id="integrations">
        <IntegrationsSection />
      </div>

      {/* Comparison */}
      <div id="compare">
        <ComparisonSection />
      </div>

      {/* Testimonials */}
      <div id="testimonials">
        <TestimonialsSection />
      </div>

      {/* Pricing - Hidden for now */}
      {/* <div id="pricing">
        <div className={'container mx-auto px-4 py-24'}>
          <div
            className={
              'flex flex-col items-center justify-center space-y-12'
            }
          >
            <SecondaryHero
              pill={<Pill label="Start for free">Enterprise-grade security.</Pill>}
              heading="Simple, Transparent Pricing"
              subheading="Choose the plan that's right for your practice. All plans include our core features."
            />

            <div className={'w-full'}>
              <PricingTable
                config={billingConfig}
                paths={{
                  signUp: getAppUrl(pathsConfig.auth.signUp),
                  return: getAppUrl(pathsConfig.app.home),
                }}
              />
            </div>
          </div>
        </div>
      </div> */}

      {/* Final CTA */}
      <FinalCTASection />
    </div>
  );
}

export default withI18n(Home);

function MainCallToActionButton() {
  return (
    <div className={'flex flex-col items-center justify-center gap-4 sm:flex-row'}>
      <CtaButton className="h-12 px-8 text-base shadow-lg shadow-primary/50 transition-transform hover:scale-105">
        <Link href={getAppUrl(pathsConfig.auth.signUp)} prefetch={false}>
          <span className={'flex items-center space-x-2'}>
            <span>
              <Trans i18nKey="marketing:getStarted" />
            </span>

            <ArrowRightIcon className={'h-5 w-5'} />
          </span>
        </Link>
      </CtaButton>

      <CtaButton 
        variant={'outline'} 
        className="h-12 border-2 px-8 text-base transition-all"
      >
        <Link href={'/contact'}>
          <Trans i18nKey="marketing:bookADemo" />
        </Link>
      </CtaButton>
    </div>
  );
}
