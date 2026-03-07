'use client';

import { useCallback, useEffect, useRef } from 'react';

import Script from 'next/script';

const GHL_IDENTIFY_STORAGE_KEY = 'ghl-identified-email';

/**
 * GoHighLevel External Tracking Script Component
 *
 * Loads the GHL external tracking script that records page views,
 * form submissions, and user activity — tied to contacts in your GHL CRM.
 *
 * Uses Next.js Script component with afterInteractive strategy so the
 * tracking tag renders as a real <script> element (same as pasting the
 * snippet from GHL directly into HTML).
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
 * GHL's tracking script scans the DOM for <form> elements once during
 * initialisation and attaches submit listeners only to those forms.
 * Dynamically created forms are missed entirely.
 *
 * This component renders a real <form> with an email <input> in the JSX
 * so it exists in the DOM before the GHL script runs its scan. Once the
 * user's session is available, the effect fills in the email value and
 * submits the form via requestSubmit(). The GHL script's pre-attached
 * listener captures the email and links the browser session to the
 * contact in the CRM.
 *
 * The form is positioned off-screen (not display:none) because the GHL
 * script ignores hidden fields.
 *
 * Identification fires once per email per browser (persisted in localStorage).
 */
function GHLIdentify() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firedRef = useRef(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    // Prevent the form from actually navigating. The GHL tracking
    // script's listener has already captured the field values by now.
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (firedRef.current) return;

    const identify = async () => {
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

      if (!formRef.current || !inputRef.current) return;

      firedRef.current = true;
      inputRef.current.value = email;

      // requestSubmit() fires the 'submit' event which the GHL tracking
      // script's pre-attached listener intercepts. form.submit() does NOT
      // fire the event.
      try {
        formRef.current.requestSubmit();
      } catch {
        formRef.current.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      }

      try {
        localStorage.setItem(GHL_IDENTIFY_STORAGE_KEY, email);
      } catch {
        // localStorage unavailable — next visit will re-identify (harmless)
      }

      console.log('[GHL Identify] Submitted identify form for:', email);
    };

    // Wait for the GHL tracking script to load and attach its listeners
    // to this form before we fill in the email and submit.
    const timer = setTimeout(identify, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Hidden iframe to absorb the form submission without navigation */}
      <iframe
        name="ghl-id-frame"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          border: 'none',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      {/*
       * The form MUST exist in the DOM before the GHL tracking script
       * initialises so the script finds it during its form scan and
       * attaches a submit listener. Off-screen (not display:none)
       * because GHL ignores hidden fields.
       */}
      <form
        ref={formRef}
        name="ghl-identify"
        method="POST"
        target="ghl-id-frame"
        action="about:blank"
        onSubmit={handleSubmit}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <input ref={inputRef} type="email" name="email" defaultValue="" />
        <button type="submit" />
      </form>
    </>
  );
}
