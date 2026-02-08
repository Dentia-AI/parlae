import Image from 'next/image';
import Link from 'next/link';

import { ArrowRightIcon, LayoutDashboard } from 'lucide-react';

// Force dynamic rendering to ensure environment variables are read at runtime
export const dynamic = 'force-dynamic';

import { PricingTable } from '@kit/billing-gateway/marketing';
import {
  CtaButton,
  EcosystemShowcase,
  FeatureCard,
  FeatureGrid,
  FeatureShowcase,
  FeatureShowcaseIconContainer,
  Hero,
  Pill,
  PillActionButton,
  SecondaryHero,
} from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

import billingConfig from '~/config/billing.config';
import pathsConfig from '~/config/paths.config';
import { withI18n } from '~/lib/i18n/with-i18n';
import { getAppUrl } from '~/lib/urls/app-host';

function Home() {
  return (
    <div className={'mt-4 flex flex-col space-y-24 py-14'}>
      <div className={'mx-auto'}>
        <Hero
          pill={
            <Pill label={'New'}>
              <span>The SaaS Starter Kit for ambitious developers</span>
              <PillActionButton asChild>
                <Link href={'/auth/sign-up'}>
                  <ArrowRightIcon className={'h-4 w-4'} />
                </Link>
              </PillActionButton>
            </Pill>
          }
          title={
            <span className="text-secondary-foreground">
              <span>Better than ever.</span>
            </span>
          }
          subtitle={
            <span>
              Makerkit gives you a production-ready boilerplate to build your
              SaaS faster than ever before with the next-gen SaaS Starter Kit.
              Get started in minutes.
            </span>
          }
          cta={<MainCallToActionButton />}
          image={
            <Image
              priority
              className={
                'dark:border-primary/10 w-full rounded-lg border border-gray-200'
              }
              width={3558}
              height={2222}
              src={`/images/dashboard.webp`}
              alt={`App Image`}
            />
          }
        />
      </div>

      <div className={'container mx-auto'}>
        <div className={'py-4 xl:py-8'}>
          <FeatureShowcase
            heading={
              <>
                <b className="font-medium tracking-tight dark:text-white">
                  The ultimate SaaS Starter Kit
                </b>
                .{' '}
                <span className="text-secondary-foreground/70 block font-normal tracking-tight">
                  Unleash your creativity and build your SaaS faster than ever
                  with Makerkit.
                </span>
              </>
            }
            icon={
              <FeatureShowcaseIconContainer>
                <LayoutDashboard className="h-4 w-4" />
                <span>All-in-one solution</span>
              </FeatureShowcaseIconContainer>
            }
          >
            <FeatureGrid>
              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={'Beautiful Dashboard'}
                description={`Makerkit provides a beautiful dashboard to manage your SaaS business.`}
              ></FeatureCard>

              <FeatureCard
                className={'relative col-span-1 w-full overflow-hidden'}
                label={'Authentication'}
                description={`Makerkit provides a variety of providers to allow your users to sign in.`}
              ></FeatureCard>

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={'Multi Tenancy'}
                description={`Multi tenant memberships for your SaaS business.`}
              />

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={'Billing'}
                description={`Makerkit supports multiple payment gateways to charge your customers.`}
              />

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={'Plugins'}
                description={`Extend your SaaS with plugins that you can install using the CLI.`}
              />

              <FeatureCard
                className={'relative col-span-1 overflow-hidden'}
                label={'Documentation'}
                description={`Makerkit provides a comprehensive documentation to help you get started.`}
              />
            </FeatureGrid>
          </FeatureShowcase>
        </div>
      </div>

      <div className={'container mx-auto'}>
        <EcosystemShowcase
          heading="The ultimate SaaS Starter Kit for founders."
          description="Unleash your creativity and build your SaaS faster than ever with Makerkit. Get started in minutes and ship your SaaS in no time."
        >
          <Image
            className="rounded-md"
            src={'/images/sign-in.webp'}
            alt="Sign in"
            width={1000}
            height={1000}
          />
        </EcosystemShowcase>
      </div>

      <div className={'container mx-auto'}>
        <div
          className={
            'flex flex-col items-center justify-center space-y-12 py-4 xl:py-8'
          }
        >
          <SecondaryHero
            pill={<Pill label="Start for free">No credit card required.</Pill>}
            heading="Fair pricing for all types of businesses"
            subheading="Get started on our free plan and upgrade when you are ready."
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
    </div>
  );
}

export default withI18n(Home);

function MainCallToActionButton() {
  return (
    <div className={'flex space-x-2.5'}>
      <CtaButton className="h-10 text-sm">
        <Link href={getAppUrl(pathsConfig.auth.signUp)} prefetch={false}>
          <span className={'flex items-center space-x-0.5'}>
            <span>
              <Trans i18nKey={'common:getStarted'} />
            </span>

            <ArrowRightIcon
              className={
                'animate-in fade-in slide-in-from-left-8 h-4' +
                ' zoom-in fill-mode-both delay-1000 duration-1000'
              }
            />
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'link'} className="h-10 text-sm">
        <Link href={'/pricing'}>
          <Trans i18nKey={'common:pricing'} />
        </Link>
      </CtaButton>
    </div>
  );
}
