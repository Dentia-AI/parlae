'use client';

import { useEffect, useRef } from 'react';
import { Suspense } from 'react';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

import { Loader2 } from 'lucide-react';

const POPUP_FLAG = 'parlae-popup-auth';

function PopupSignInInner() {
  const searchParams = useSearchParams();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    // Tag this tab as a popup auth tab. sessionStorage persists across
    // same-origin navigations within the tab, so even if the callbackUrl
    // cookie is lost during cross-origin OAuth redirects and the popup
    // lands on /home instead of /auth/popup-complete, the RootProviders
    // PopupAuthCloser component will detect the flag and close the popup.
    sessionStorage.setItem(POPUP_FLAG, 'true');

    const identityProvider = searchParams.get('identity_provider');
    const screenHint = searchParams.get('screen_hint');
    const authParams: Record<string, string> = {};

    if (identityProvider) authParams.identity_provider = identityProvider;
    if (screenHint) authParams.screen_hint = screenHint;

    void signIn('cognito', { callbackUrl: '/auth/popup-complete' }, authParams);
  }, [searchParams]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
    </div>
  );
}

export default function PopupSignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PopupSignInInner />
    </Suspense>
  );
}
