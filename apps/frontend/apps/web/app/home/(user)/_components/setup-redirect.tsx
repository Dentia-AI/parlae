'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { GlobalLoader } from '@kit/ui/global-loader';

/**
 * Client-side redirect to the setup wizard.
 *
 * Using a server-side `redirect()` from a page component causes React
 * error #310 ("Suspense boundary received an update before it finished
 * hydrating") because Next.js's client-side router processes the redirect
 * while internal Suspense boundaries are still hydrating. By deferring
 * the navigation to a `useEffect`, the redirect runs after hydration
 * completes and avoids the race condition entirely.
 */
export function SetupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/home/agent/setup');
  }, [router]);

  return <GlobalLoader fullPage />;
}
