'use client';

import { useEffect, useRef, useState } from 'react';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 700;
const CHANNEL_NAME = 'parlae-auth';
const MESSAGE_TYPE = 'parlae-auth-complete';

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    navigator.userAgent,
  );
}

function openCenteredPopup(url: string): Window | null {
  const left = Math.round(
    window.screenX + (window.outerWidth - POPUP_WIDTH) / 2,
  );
  const top = Math.round(
    window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2,
  );

  return window.open(
    url,
    'parlae-auth-popup',
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
  );
}

interface PopupAuthOptions {
  identityProvider?: string;
  screenHint?: string;
  callbackUrl?: string;
}

// popup.closed is unreliable for cross-origin popups. Google sets
// Cross-Origin-Opener-Policy: same-origin which severs the opener
// reference and causes popup.closed to permanently return true once
// the popup leaves our origin. Polling popup.closed is therefore not
// used. Auth completion is detected exclusively via BroadcastChannel
// (sent by PopupAuthCloser or the popup-complete page). The overlay
// provides a Cancel button for the user-closed-popup case.

export function usePopupAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const callbackUrlRef = useRef<string>('/home');
  const completedRef = useRef(false);
  const authenticatingRef = useRef(false);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    function handleAuthComplete() {
      if (completedRef.current) return;
      if (!authenticatingRef.current) return;
      completedRef.current = true;

      try {
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
      } catch {
        // cross-origin close blocked
      }
      popupRef.current = null;
      authenticatingRef.current = false;
      setIsAuthenticating(false);
      routerRef.current.push(callbackUrlRef.current);
    }

    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === MESSAGE_TYPE) handleAuthComplete();
      };
    } catch {
      // BroadcastChannel unsupported
    }

    function handleWindowMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== MESSAGE_TYPE) return;
      handleAuthComplete();
    }
    window.addEventListener('message', handleWindowMessage);

    return () => {
      channel?.close();
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startPopupAuth = (options: PopupAuthOptions) => {
    const { identityProvider, screenHint, callbackUrl } = options;
    callbackUrlRef.current = callbackUrl || '/home';
    completedRef.current = false;

    if (isMobile()) {
      const authParams: Record<string, string> = {};
      if (identityProvider) authParams.identity_provider = identityProvider;
      if (screenHint) authParams.screen_hint = screenHint;
      void signIn('cognito', { callbackUrl }, authParams);
      return;
    }

    const params = new URLSearchParams();
    if (identityProvider) params.set('identity_provider', identityProvider);
    if (screenHint) params.set('screen_hint', screenHint);

    const popupUrl = `/auth/popup-sign-in?${params.toString()}`;
    const popup = openCenteredPopup(popupUrl);

    if (!popup || popup.closed) {
      const authParams: Record<string, string> = {};
      if (identityProvider) authParams.identity_provider = identityProvider;
      if (screenHint) authParams.screen_hint = screenHint;
      void signIn('cognito', { callbackUrl }, authParams);
      return;
    }

    popupRef.current = popup;
    authenticatingRef.current = true;
    setIsAuthenticating(true);
  };

  const cancelAuth = () => {
    try {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    } catch {
      // cross-origin close blocked
    }
    popupRef.current = null;
    authenticatingRef.current = false;
    completedRef.current = false;
    setIsAuthenticating(false);
  };

  return { startPopupAuth, cancelAuth, isAuthenticating };
}
