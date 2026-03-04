'use client';

import { useEffect, useRef } from 'react';

const CHANNEL_NAME = 'parlae-auth';
const MESSAGE_TYPE = 'parlae-auth-complete';
const POPUP_FLAG = 'parlae-popup-auth';

/**
 * Sends the auth-complete signal to the parent window via BroadcastChannel
 * (and window.opener as fallback), clears the popup flag, and closes the window.
 *
 * Called from:
 * 1. /auth/popup-complete page (fast path when callbackUrl is preserved)
 * 2. PopupAuthCloser component (fallback when popup lands on /home or elsewhere)
 */
export function notifyParentAndClose() {
  sessionStorage.removeItem(POPUP_FLAG);

  const message = { type: MESSAGE_TYPE, success: true };

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unsupported
  }

  if (window.opener) {
    try {
      window.opener.postMessage(message, window.location.origin);
    } catch {
      // opener access blocked
    }
  }

  setTimeout(() => window.close(), 300);
}

/**
 * Rendered in RootProviders. On mount, checks if this tab was opened as
 * a popup auth tab (via sessionStorage flag). If so, notifies the parent
 * and closes. This is a no-op for the main window.
 *
 * This handles the case where the NextAuth callbackUrl cookie is lost
 * during cross-origin OAuth redirects (App → Cognito → Google → App)
 * and the popup lands on /home instead of /auth/popup-complete.
 */
export function PopupAuthCloser() {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (sessionStorage.getItem(POPUP_FLAG) !== 'true') return;
    handled.current = true;

    notifyParentAndClose();
  }, []);

  return null;
}
