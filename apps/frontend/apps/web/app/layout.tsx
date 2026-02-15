import { headers } from 'next/headers';

import { Toaster } from '@kit/ui/sonner';

import { RootProviders } from '~/components/root-providers';
import { auth } from '@kit/shared/auth';
import { getFontsClassName } from '~/lib/fonts';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { generateRootMetadata } from '~/lib/root-metadata';
import { getRootTheme } from '~/lib/root-theme';
import { GHLChatWidget } from '@kit/shared/gohighlevel';

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
  const session = await auth();

  return (
    <html lang={language} className={`${className} ${theme === 'dark' ? 'dark' : ''}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = document.cookie.match(/theme=([^;]+)/)?.[1] || '${theme}';
                if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }

                // Set NextAuth base URL for client
                window.NEXTAUTH_URL = window.location.origin;
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
      </body>
    </html>
  );
}

async function getCspNonce() {
  const headersStore = await headers();

  return headersStore.get('x-nonce') ?? undefined;
}
