import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { AppLogo } from '~/components/app-logo';

function AuthLayout({ children }: React.PropsWithChildren) {
  return (
    <div className="grid min-h-screen bg-background md:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-muted/30 md:block">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.35),_transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="flex items-center gap-2 text-sm font-medium text-primary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to marketing site
            </Link>
          </div>

          <div className="space-y-6">
            <AppLogo className="h-12 w-auto text-white" />
            <div className="space-y-4 text-white">
              <h1 className="text-4xl font-semibold leading-tight lg:text-5xl">Only ads you need</h1>
              <p className="text-lg text-white/80">
                Manage billing, upload creative assets, and collaborate with your team from a single dashboard that’s
                powered entirely by AWS.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-6 text-white/75">
            <div>
              <dt className="text-sm uppercase tracking-wide">99.9% uptime</dt>
              <dd className="text-2xl font-semibold text-white">AWS Aurora + Cognito</dd>
            </div>
            <div>
              <dt className="text-sm uppercase tracking-wide">Usage based billing</dt>
              <dd className="text-2xl font-semibold text-white">Stripe metered plans</dd>
            </div>
          </dl>
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

export default AuthLayout;
