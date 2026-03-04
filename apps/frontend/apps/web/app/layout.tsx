import { headers } from 'next/headers';

import { Toaster } from '@kit/ui/sonner';

import { RootProviders } from '~/components/root-providers';
import { auth } from '@kit/shared/auth';
import { getFontsClassName } from '~/lib/fonts';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { generateRootMetadata } from '~/lib/root-metadata';
import { getRootTheme } from '~/lib/root-theme';
import { GHLChatWidget, GHLTracking } from '@kit/shared/gohighlevel';
import { ClarityAnalytics } from '@kit/shared/analytics';

import '../styles/globals.css';

import Script from 'next/script';

// Trigger CI/CD build - 2026-02-14
export const generateMetadata = () => {
  return generateRootMetadata();
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { language } = await createI18nServerInstance();
  const theme = await getRootTheme();
  const className = getFontsClassName(theme);
  const nonce = await getCspNonce();

  let session = null;
  try {
    session = await auth();
  } catch {
    // Stale or corrupted session cookie — let SessionProvider handle it
    // client-side instead of crashing the root layout.
  }

  return (
    <html lang={language} className={`${className} ${theme === 'dark' ? 'dark' : ''}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <style
          dangerouslySetInnerHTML={{
            __html: [
              'html{background-color:hsl(0,0%,100%);color-scheme:light}',
              'html.dark,html.dark body{background-color:hsl(0,0%,9%)!important;color-scheme:dark}',
              '@media(prefers-color-scheme:dark){html:not(.light){background-color:hsl(0,0%,9%);color-scheme:dark}}',
            ].join(''),
          }}
          nonce={nonce}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || '${theme}';
                } catch(e) {
                  var theme = '${theme}';
                }
                var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.backgroundColor = 'hsl(0,0%,9%)';
                  document.documentElement.style.colorScheme = 'dark';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.backgroundColor = 'hsl(0,0%,100%)';
                  document.documentElement.style.colorScheme = 'light';
                }
                try {
                  document.cookie = 'theme=' + theme + ';path=/;max-age=31536000;SameSite=Lax';
                } catch(e) {}

                window.NEXTAUTH_URL = window.location.origin;
              })();
            `,
          }}
          nonce={nonce}
        />
        {/* Lightweight boot logger — captures errors and warnings before
            React hydrates. Stored in window.__BOOT_LOG__ so the console-
            capture extension (or manual inspection) can read them. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var B = window.__BOOT_LOG__ = { t0: Date.now(), entries: [] };
                function push(lvl, args) {
                  B.entries.push({
                    ms: Date.now() - B.t0,
                    lvl: lvl,
                    msg: Array.prototype.slice.call(args).map(function(a) {
                      return a instanceof Error ? a.name + ': ' + a.message + '\\n' + (a.stack || '') : String(a);
                    }).join(' ')
                  });
                }
                var oe = console.error, ow = console.warn;
                console.error = function() { push('ERR', arguments); oe.apply(console, arguments); };
                console.warn  = function() { push('WRN', arguments); ow.apply(console, arguments); };
                window.addEventListener('error', function(e) {
                  push('UE', [e.message + ' at ' + (e.filename||'?') + ':' + (e.lineno||0)]);
                });
                window.addEventListener('unhandledrejection', function(e) {
                  push('UR', [e.reason]);
                });
              })();
            `,
          }}
          nonce={nonce}
        />
      </head>
      <body>
        <RootProviders
          theme={theme}
          lang={language}
          nonce={nonce}
          session={session}
        >
          {children}
        </RootProviders>

        <Toaster richColors={true} theme={theme} position="top-center" />
        <GHLChatWidget />
        <GHLTracking />
        <ClarityAnalytics />
      </body>
    </html>
  );
}

async function getCspNonce() {
  const headersStore = await headers();

  return headersStore.get('x-nonce') ?? undefined;
}
