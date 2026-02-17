'use client';

import { useEffect } from 'react';

/**
 * GoHighLevel External Tracking Script Component
 *
 * Loads the GHL external tracking script that records page views,
 * form submissions, and user activity — tied to contacts in your GHL CRM.
 *
 * This uses the current GHL external tracking format:
 * ```html
 * <script
 *   src="https://{tracking-domain}/js/external-tracking.js"
 *   data-tracking-id="tk_xxxxx">
 * </script>
 * ```
 *
 * Get the tracking code from GHL: Settings → External Tracking → Copy Script
 *
 * Required env vars:
 * - NEXT_PUBLIC_GHL_TRACKING_DOMAIN — e.g. "link.yourdomain.com"
 * - NEXT_PUBLIC_GHL_TRACKING_ID — e.g. "tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * Only loads in production to avoid console errors during development.
 *
 * @example
 * ```tsx
 * import { GHLTracking } from '@kit/shared/gohighlevel';
 *
 * export function Layout({ children }) {
 *   return (
 *     <>
 *       {children}
 *       <GHLTracking />
 *     </>
 *   );
 * }
 * ```
 */
export function GHLTracking() {
  const trackingDomain = process.env.NEXT_PUBLIC_GHL_TRACKING_DOMAIN;
  const trackingId = process.env.NEXT_PUBLIC_GHL_TRACKING_ID;
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (isDev) {
      return;
    }

    if (!trackingDomain || !trackingId) {
      return;
    }

    const existingScript = document.getElementById('ghl-tracking-script');
    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'ghl-tracking-script';
    script.src = `https://${trackingDomain}/js/external-tracking.js`;
    script.async = true;
    script.setAttribute('data-tracking-id', trackingId);

    script.onerror = () => {
      console.warn('[GHL Tracking] Failed to load tracking script');
    };

    document.body.appendChild(script);

    return () => {
      const scriptToRemove = document.getElementById('ghl-tracking-script');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [trackingDomain, trackingId, isDev]);

  return null;
}
