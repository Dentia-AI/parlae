'use client';

import { Suspense, useMemo } from 'react';

import { ThemeProvider } from 'next-themes';

import type { Session } from 'next-auth';

import { I18nProvider } from '@kit/i18n/provider';
import { CspNonceProvider } from '@kit/ui/csp-nonce-provider';
import { MonitoringProvider } from '@kit/monitoring/components';
import { AppEventsProvider } from '@kit/shared/events';
import { If } from '@kit/ui/if';
import { VersionUpdater } from '@kit/ui/version-updater';

import { AuthProvider } from '~/components/auth-provider';
import { PopupAuthCloser } from '~/components/auth/popup-auth-closer';
import appConfig from '~/config/app.config';
import featuresFlagConfig from '~/config/feature-flags.config';
import { i18nResolver } from '~/lib/i18n/i18n.resolver';
import { getI18nSettings } from '~/lib/i18n/i18n.settings';

import { ReactQueryProvider } from './react-query-provider';

type RootProvidersProps = React.PropsWithChildren<{
  lang?: string;
  theme?: string;
  nonce?: string;
  session?: Session | null;
}>;

export function RootProviders({
  lang,
  theme = appConfig.theme,
  nonce,
  session,
  children,
}: RootProvidersProps) {
  const i18nSettings = useMemo(() => getI18nSettings(lang), [lang]);

  // AuthProvider and ThemeProvider are intentionally OUTSIDE the Suspense
  // boundary. SessionProvider (inside AuthProvider) fetches the session
  // client-side on mount, which triggers a state update. If that update
  // arrives while the Suspense boundary is still hydrating (waiting for
  // i18n), React throws error #310 ("Suspense boundary received an update
  // before it finished hydrating") and falls back to client rendering,
  // replacing the server-rendered HTML with the fallback — causing a white
  // flash. Keeping stateful providers outside prevents this.
  return (
    <CspNonceProvider nonce={nonce}>
      <MonitoringProvider>
        <AppEventsProvider>
          <ReactQueryProvider>
            <PopupAuthCloser />
            <AuthProvider session={session}>
              <ThemeProvider
                attribute="class"
                enableSystem
                disableTransitionOnChange
                defaultTheme={theme}
                enableColorScheme={false}
                storageKey="theme"
                nonce={nonce}
              >
                <Suspense fallback={<I18nHydrationFallback />}>
                  <I18nProvider
                    settings={i18nSettings}
                    resolver={i18nResolver}
                  >
                    {children}

                    <If condition={featuresFlagConfig.enableVersionUpdater}>
                      <VersionUpdater />
                    </If>
                  </I18nProvider>
                </Suspense>
              </ThemeProvider>
            </AuthProvider>
          </ReactQueryProvider>
        </AppEventsProvider>
      </MonitoringProvider>
    </CspNonceProvider>
  );
}

function I18nHydrationFallback() {
  return (
    <div
      className="bg-background fixed inset-0 z-50 flex items-center justify-center"
      aria-busy="true"
    >
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
    </div>
  );
}
