import { Trans } from '@kit/ui/trans';

import { withI18n } from '~/lib/i18n/with-i18n';
import { AppLogo } from '~/components/app-logo';

function AuthLayout({ children }: React.PropsWithChildren) {
  return (
    <div className="grid min-h-screen bg-background md:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-muted/30 md:block">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.35),_transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AppLogo className="h-10 w-auto" />
          </div>

          <div className="space-y-6">
            <AppLogo className="h-16 w-auto text-white" />
            <div className="space-y-4 text-white">
              <h1 className="text-4xl font-semibold leading-tight lg:text-5xl">
                <Trans i18nKey={'auth:layoutHeading'} defaults={'Welcome to Parlae'} />
              </h1>
              <p className="text-lg text-white/80">
                <Trans
                  i18nKey={'auth:layoutDescription'}
                  defaults={
                    'Get started with your AI agent for your healthcare team. Transform patient engagement and step into an exciting future of intelligent practice management.'
                  }
                />
              </p>
            </div>
          </div>

          <div className="space-y-4 text-white/75">
            <p className="text-sm">
              <Trans
                i18nKey={'auth:layoutTagline'}
                defaults={
                  'Empower your practice with AI-driven conversations that enhance patient care and streamline team collaboration.'
                }
              />
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="mx-auto w-full max-w-md space-y-10">
          <div className="flex items-center justify-center md:hidden">
            <AppLogo className="h-10 w-auto" />
          </div>

          <div className="w-full rounded-3xl border border-border/60 bg-card/90 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export default withI18n(AuthLayout);
