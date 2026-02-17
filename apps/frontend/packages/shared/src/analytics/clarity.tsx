'use client';

import { useEffect } from 'react';

/**
 * Microsoft Clarity Component
 *
 * Loads the Clarity analytics script for heatmaps, session recordings,
 * and scroll depth tracking. 100% free with no usage caps.
 *
 * Requires NEXT_PUBLIC_CLARITY_PROJECT_ID to be set.
 *
 * To get your project ID:
 * 1. Go to https://clarity.microsoft.com
 * 2. Create a new project (or open existing)
 * 3. Go to Settings > Setup > copy the project ID
 *
 * @example
 * ```tsx
 * import { ClarityAnalytics } from '@kit/shared/analytics';
 *
 * export function Layout({ children }) {
 *   return (
 *     <>
 *       {children}
 *       <ClarityAnalytics />
 *     </>
 *   );
 * }
 * ```
 */
export function ClarityAnalytics() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

  useEffect(() => {
    if (!projectId) {
      return;
    }

    // Don't load in development by default
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_CLARITY_DEV) {
      return;
    }

    const existingScript = document.getElementById('clarity-script');
    if (existingScript) {
      return;
    }

    // Clarity initialization snippet (async, non-blocking)
    const script = document.createElement('script');
    script.id = 'clarity-script';
    script.type = 'text/javascript';
    script.innerHTML = `
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${projectId}");
    `;

    document.head.appendChild(script);

    return () => {
      const scriptToRemove = document.getElementById('clarity-script');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [projectId]);

  return null;
}
