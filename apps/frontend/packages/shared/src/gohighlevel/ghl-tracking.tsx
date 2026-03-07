'use client';

import { useEffect, useRef } from 'react';

import Script from 'next/script';

const GHL_IDENTIFY_STORAGE_KEY = 'ghl-identified-email';
const IDENTIFY_DELAY_MS = 4000;

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
    <>
      <Script
        id="ghl-tracking-script"
        src={`https://${trackingDomain}/js/external-tracking.js`}
        data-tracking-id={trackingId}
        data-debug="true"
        strategy="afterInteractive"
      />
      <GHLIdentify />
    </>
  );
}

/**
 * Bridges the authenticated user session with GHL external tracking.
 *
 * GHL only links anonymous page-view data to a contact when it observes
 * a native HTML form submission that contains an email field. Since the
 * app uses React-managed forms (fetch/AJAX), the tracking script never
 * sees a real submission.
 *
 * This component solves that by programmatically submitting a hidden
 * form (targeted at a hidden iframe to avoid navigation) once the user
 * is authenticated. The GHL script's submit-event listener captures the
 * email, identifies the browser, and retroactively attributes all prior
 * anonymous page views to the contact.
 *
 * Reads the session directly from the NextAuth session endpoint instead
 * of useSession() to avoid requiring a SessionProvider ancestor — this
 * component renders outside the providers tree in the root layout.
 *
 * Identification fires once per email per browser (persisted in localStorage).
 */
function GHLIdentify() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;

    const timer = setTimeout(async () => {
      if (firedRef.current) return;

      let email: string | undefined;

      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok) return;
        const data = await res.json();
        email = data?.user?.email;
      } catch {
        return;
      }

      if (!email) return;

      try {
        if (localStorage.getItem(GHL_IDENTIFY_STORAGE_KEY) === email) return;
      } catch {
        // localStorage unavailable — continue anyway
      }

      firedRef.current = true;

      const iframe = document.createElement('iframe');
      iframe.name = 'ghl-id-frame';
      iframe.style.cssText =
        'position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.name = 'ghl-identify';
      form.method = 'POST';
      form.target = 'ghl-id-frame';
      form.action = 'about:blank';
      // GHL tracking ignores fields with display:none. Position off-screen
      // so the inputs are technically "visible" to the tracking script.
      form.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';

      const input = document.createElement('input');
      input.type = 'email';
      input.name = 'email';
      input.value = email;
      form.appendChild(input);

      const btn = document.createElement('button');
      btn.type = 'submit';
      form.appendChild(btn);

      document.body.appendChild(form);

      // requestSubmit() fires the 'submit' event (which the GHL tracking
      // script intercepts). form.submit() does NOT fire the event.
      try {
        form.requestSubmit();
      } catch {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      }

      try {
        localStorage.setItem(GHL_IDENTIFY_STORAGE_KEY, email);
      } catch {
        // localStorage unavailable — next visit will re-identify (harmless)
      }

      console.log('[GHL Identify] Submitted identify form for:', email);

      setTimeout(() => {
        form.remove();
        iframe.remove();
      }, 2000);
    }, IDENTIFY_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
