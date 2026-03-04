'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 700;
const POLL_INTERVAL_MS = 500;
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

export function usePopupAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackUrlRef = useRef<string>('/home');
  const router = useRouter();

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    popupRef.current = null;
    setIsAuthenticating(false);
  }, []);

  useEffect(() => {
    function onAuthComplete() {
      cleanup();
      router.push(callbackUrlRef.current);
    }

    // BroadcastChannel: works even when window.opener is severed
    // by cross-origin OAuth redirects (App → Cognito → Google → App).
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === MESSAGE_TYPE) onAuthComplete();
      };
    } catch {
      // BroadcastChannel unsupported
    }

    // Fallback: window.postMessage (works when opener is preserved)
    function handleWindowMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== MESSAGE_TYPE) return;
      onAuthComplete();
    }
    window.addEventListener('message', handleWindowMessage);

    return () => {
      channel?.close();
      window.removeEventListener('message', handleWindowMessage);
      cleanup();
    };
  }, [cleanup, router]);

  const startPopupAuth = useCallback(
    (options: PopupAuthOptions) => {
      const { identityProvider, screenHint, callbackUrl } = options;
      callbackUrlRef.current = callbackUrl || '/home';

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
      setIsAuthenticating(true);

      pollRef.current = setInterval(() => {
        if (popupRef.current?.closed) {
          cleanup();
        }
      }, POLL_INTERVAL_MS);
    },
    [cleanup],
  );

  return { startPopupAuth, isAuthenticating };
}
