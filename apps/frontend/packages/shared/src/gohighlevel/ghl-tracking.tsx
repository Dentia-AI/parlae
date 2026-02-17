'use client';

import { useEffect } from 'react';

/**
 * GoHighLevel Tracking Script Component
 *
 * Loads the GHL tracking pixel that records page visits, form fills,
 * and user activity — tied to contacts in your GHL CRM.
 *
 * This is separate from the chat widget. The tracking script is what
 * enables the "Activity" tab on each GHL contact to show page visits.
 *
 * Requires NEXT_PUBLIC_GHL_LOCATION_ID to be set.
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
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;

  useEffect(() => {
    if (!locationId) {
      return;
    }

    const existingScript = document.getElementById('ghl-tracking-script');
    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'ghl-tracking-script';
    script.src = `https://storage.googleapis.com/msgsndr/scripts/${locationId}.js`;
    script.async = true;

    script.onerror = () => {
      console.error('[GHL Tracking] Failed to load tracking script');
    };

    document.head.appendChild(script);

    return () => {
      const scriptToRemove = document.getElementById('ghl-tracking-script');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [locationId]);

  return null;
}
