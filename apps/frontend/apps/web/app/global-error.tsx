'use client';

import { useEffect, useRef } from 'react';

/**
 * Global error boundary — catches errors in the root layout that the
 * per-segment `error.tsx` cannot handle (e.g. provider initialization
 * failures during OAuth redirects).
 *
 * Instead of showing a scary white error page, this attempts a single
 * automatic reload (with a 10 s cooldown) so transient session/hydration
 * errors resolve silently. If the reload doesn't fix it, the user sees
 * a friendly recovery UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const attemptedReload = useRef(false);

  useEffect(() => {
    console.error(
      '[GlobalError] Root layout error caught:',
      error?.message,
      error?.stack,
    );

    if (attemptedReload.current) return;
    attemptedReload.current = true;

    // Auto-reload once to recover from transient session/hydration errors.
    // Cooldown prevents infinite reload loops.
    const RELOAD_KEY = 'global-error-reload';
    const lastReload = sessionStorage.getItem(RELOAD_KEY);
    const now = Date.now();

    if (!lastReload || now - Number(lastReload) > 10_000) {
      sessionStorage.setItem(RELOAD_KEY, String(now));
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <style
          dangerouslySetInnerHTML={{
            __html: [
              'html{background-color:hsl(0,0%,100%);color-scheme:light}',
              'html.dark,html.dark body{background-color:hsl(0,0%,9%)!important;color-scheme:dark;color:hsl(0,0%,98%)}',
              '@media(prefers-color-scheme:dark){html:not(.light){background-color:hsl(0,0%,9%);color-scheme:dark;color:hsl(0,0%,98%)}}',
            ].join(''),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              var theme = document.cookie.match(/theme=([^;]+)/)?.[1] || 'system';
              var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (isDark) {
                document.documentElement.classList.add('dark');
                document.documentElement.style.backgroundColor = 'hsl(0,0%,9%)';
                document.documentElement.style.colorScheme = 'dark';
              } else {
                document.documentElement.style.backgroundColor = 'hsl(0,0%,100%)';
                document.documentElement.style.colorScheme = 'light';
              }
            })();`,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}
        className="bg-background text-foreground"
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Something went wrong
        </h2>
        <p style={{ opacity: 0.6, marginBottom: '1.5rem', maxWidth: '28rem' }}>
          A temporary error occurred while loading the page. This sometimes
          happens during sign-in — please try again.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              border: '1px solid currentColor',
              opacity: 0.3,
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => {
              window.location.href = '/home';
            }}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: 'currentColor',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.875rem',
              filter: 'invert(1)',
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </body>
    </html>
  );
}
