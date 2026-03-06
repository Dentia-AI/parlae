'use client';

import Script from 'next/script';

/**
 * GoHighLevel External Tracking Script Component
 *
 * Loads the GHL external tracking script that records page views,
 * form submissions, and user activity — tied to contacts in your GHL CRM.
 *
 * Uses Next.js Script component with afterInteractive strategy so the
 * tracking tag renders as a real <script> element (same as pasting the
 * snippet from GHL directly into HTML). Dynamic createElement injection
 * can break tracking scripts that rely on document.currentScript or
 * synchronous attribute reads during initialisation.
 *
 * Get the tracking code from GHL: Settings → External Tracking → Copy Script
 *
 * Required env vars:
 * - NEXT_PUBLIC_GHL_TRACKING_DOMAIN — e.g. "link.yourdomain.com"
 * - NEXT_PUBLIC_GHL_TRACKING_ID — e.g. "tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * Only loads in production to avoid console errors during development.
 */
export function GHLTracking() {
  const trackingDomain = process.env.NEXT_PUBLIC_GHL_TRACKING_DOMAIN;
  const trackingId = process.env.NEXT_PUBLIC_GHL_TRACKING_ID;

  if (process.env.NODE_ENV === 'development') {
    return null;
  }

  if (!trackingDomain || !trackingId) {
    return null;
  }

  return (
    <Script
      id="ghl-tracking-script"
      src={`https://${trackingDomain}/js/external-tracking.js`}
      data-tracking-id={trackingId}
      strategy="afterInteractive"
    />
  );
}
