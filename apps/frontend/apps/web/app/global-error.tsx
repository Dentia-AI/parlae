'use client';

/**
 * Global error boundary — catches errors in the root layout that the
 * per-segment `error.tsx` cannot handle (e.g. provider initialization
 * failures during OAuth redirects).
 *
 * Next.js requires this component to render its own <html> and <body>
 * because the root layout is part of the error tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== 'undefined') {
    console.error(
      '[GlobalError] Root layout error caught:',
      error?.message,
      error?.stack,
    );
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `html.dark,html.dark body{background-color:hsl(0,0%,9%)!important;color-scheme:dark;color:hsl(0,0%,98%)}`,
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
