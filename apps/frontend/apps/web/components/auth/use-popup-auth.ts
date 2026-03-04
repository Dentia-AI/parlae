'use client';

import { useEffect, useRef, useState } from 'react';

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

let mountCount = 0;

export function usePopupAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackUrlRef = useRef<string>('/home');
  const completedRef = useRef(false);
  const authenticatingRef = useRef(false);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const instanceRef = useRef(++mountCount);

  const tag = `[PopupAuth#${instanceRef.current}]`;

  useEffect(() => {
    console.log(`${tag} useEffect MOUNT — setting up listeners`);

    function handleAuthComplete() {
      console.log(
        `${tag} handleAuthComplete — completed=${completedRef.current} authenticating=${authenticatingRef.current}`,
      );
      if (completedRef.current) return;
      if (!authenticatingRef.current) return;
      completedRef.current = true;

      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      try {
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
      } catch {
        // cross-origin close blocked
      }
      popupRef.current = null;
      authenticatingRef.current = false;
      console.log(`${tag} handleAuthComplete — setting isAuthenticating=false, navigating`);
      setIsAuthenticating(false);
      routerRef.current.push(callbackUrlRef.current);
    }

    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        console.log(`${tag} BroadcastChannel message received`, event.data);
        if (event.data?.type === MESSAGE_TYPE) handleAuthComplete();
      };
    } catch {
      // BroadcastChannel unsupported
    }

    function handleWindowMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== MESSAGE_TYPE) return;
      console.log(`${tag} window.postMessage received`, event.data);
      handleAuthComplete();
    }
    window.addEventListener('message', handleWindowMessage);

    return () => {
      console.log(`${tag} useEffect CLEANUP — tearing down listeners`);
      channel?.close();
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startPopupAuth = (options: PopupAuthOptions) => {
    const { identityProvider, screenHint, callbackUrl } = options;
    callbackUrlRef.current = callbackUrl || '/home';
    completedRef.current = false;
    console.log(`${tag} startPopupAuth called — identityProvider=${identityProvider}`);

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
      console.log(`${tag} popup blocked, falling back to redirect`);
      const authParams: Record<string, string> = {};
      if (identityProvider) authParams.identity_provider = identityProvider;
      if (screenHint) authParams.screen_hint = screenHint;
      void signIn('cognito', { callbackUrl }, authParams);
      return;
    }

    popupRef.current = popup;
    authenticatingRef.current = true;
    setIsAuthenticating(true);
    console.log(`${tag} popup opened — starting poll`);

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      const hasRef = !!popupRef.current;
      let closed: boolean | undefined;
      try {
        closed = popupRef.current?.closed;
      } catch {
        // cross-origin access to .closed can sometimes fail
        return;
      }

      if (!hasRef || closed) {
        console.log(
          `${tag} poll: popup gone — hasRef=${hasRef} closed=${closed} — clearing overlay`,
        );
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        popupRef.current = null;
        authenticatingRef.current = false;
        setIsAuthenticating(false);
        completedRef.current = false;
      }
    }, POLL_INTERVAL_MS);
  };

  return { startPopupAuth, isAuthenticating };
}
