'use client';

import { useMemo } from 'react';

import { ThemeProvider } from 'next-themes';

import type { Session } from 'next-auth';

import { I18nProvider } from '@kit/i18n/provider';
import { CspNonceProvider } from '@kit/ui/csp-nonce-provider';
import { MonitoringProvider } from '@kit/monitoring/components';
import { AppEventsProvider } from '@kit/shared/events';
import { If } from '@kit/ui/if';
import { VersionUpdater } from '@kit/ui/version-updater';

import { AuthProvider } from '~/components/auth-provider';
import appConfig from '~/config/app.config';
import featuresFlagConfig from '~/config/feature-flags.config';
import { i18nResolver } from '~/lib/i18n/i18n.resolver';
import { getI18nSettings } from '~/lib/i18n/i18n.settings';

import { ReactQueryProvider } from './react-query-provider';

type RootProvidersProps = React.PropsWithChildren<{
  // The language to use for the app (optional)
  lang?: string;
  // The theme (light or dark or system) (optional)
  theme?: string;
  // The CSP nonce to pass to scripts (optional)
  nonce?: string;
  // The NextAuth session to hydrate on the client (optional)
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

  return (
    <CspNonceProvider nonce={nonce}>
      <MonitoringProvider>
        <AppEventsProvider>
          <ReactQueryProvider>
            <I18nProvider settings={i18nSettings} resolver={i18nResolver}>
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
                  {children}
                </ThemeProvider>
              </AuthProvider>

              <If condition={featuresFlagConfig.enableVersionUpdater}>
                <VersionUpdater />
              </If>
            </I18nProvider>
          </ReactQueryProvider>
        </AppEventsProvider>
      </MonitoringProvider>
    </CspNonceProvider>
  );
}
