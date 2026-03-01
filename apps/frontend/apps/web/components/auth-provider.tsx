'use client';

import { Component, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';

import { useMonitoring } from '@kit/monitoring/hooks';
import { useAppEvents } from '@kit/shared/events';

type AuthProviderProps = React.PropsWithChildren<{ session?: Session | null }>;

/**
 * Wraps children with NextAuth SessionProvider + error recovery.
 *
 * The error boundary sits ABOVE SessionProvider so it can catch errors
 * thrown during SessionProvider initialization (e.g. stale JWT on hydration).
 *
 * We intentionally avoid passing the server-rendered session when the page
 * loads after a period of inactivity because the JWT may be expired. A stale
 * session prop causes a hydration mismatch that triggers React #310 on
 * next-auth v5 beta + React 19. Letting SessionProvider fetch the session
 * client-side avoids this entirely.
 */
export function AuthProvider({ session, children }: AuthProviderProps) {
  return (
    <AuthErrorBoundary>
      <SafeSessionProvider serverSession={session}>
        <AuthEventsBridge>{children}</AuthEventsBridge>
      </SafeSessionProvider>
    </AuthErrorBoundary>
  );
}

/**
 * Wraps SessionProvider and only passes the server session on the initial
 * mount. On subsequent navigations (or when the tab regains focus after
 * inactivity) SessionProvider fetches a fresh session client-side.
 *
 * This avoids the hydration mismatch that triggers React #310 when the
 * server-rendered session is null but the client still holds a stale cookie.
 */
function SafeSessionProvider({
  serverSession,
  children,
}: {
  serverSession?: Session | null;
  children: ReactNode;
}) {
  const [initialSession] = useState(() => serverSession ?? undefined);

  return (
    <SessionProvider
      session={initialSession}
      refetchOnWindowFocus={true}
      refetchWhenOffline={false}
    >
      {children}
    </SessionProvider>
  );
}

/**
 * Catches transient errors that can occur during OAuth redirects or when
 * the session state is stale (e.g. React #310 hooks errors from
 * next-auth v5 beta / React 19 interactions).
 *
 * Sits ABOVE SessionProvider so it can also catch SessionProvider crashes.
 *
 * Recovery strategy:
 * 1. Retry rendering up to MAX_RETRIES times with increasing delays
 * 2. On persistent failure, do a hard refresh (once per 10 s) to let
 *    the server produce a clean render with a fresh session
 */
class AuthErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; retryCount: number; caughtError: Error | null }
> {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [200, 600, 1200];
  private static readonly RELOAD_KEY = 'auth-error-reload';

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, retryCount: 0, caughtError: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, caughtError: error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      JSON.stringify({
        message: '[AuthErrorBoundary] Caught transient auth error',
        error: error.message,
        retry: this.state.retryCount,
        stack: error.stack?.slice(0, 500),
        componentStack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  componentDidUpdate(_: unknown, prevState: { retryCount: number }) {
    if (!this.state.hasError || this.state.retryCount !== prevState.retryCount) {
      return;
    }

    if (this.state.retryCount < AuthErrorBoundary.MAX_RETRIES) {
      const delay = AuthErrorBoundary.RETRY_DELAYS[this.state.retryCount] ?? 500;

      setTimeout(() => {
        this.setState((s) => ({
          hasError: false,
          retryCount: s.retryCount + 1,
          caughtError: null,
        }));
      }, delay);
    } else if (typeof window !== 'undefined') {
      const lastReload = sessionStorage.getItem(AuthErrorBoundary.RELOAD_KEY);
      const now = Date.now();

      if (!lastReload || now - Number(lastReload) > 10_000) {
        sessionStorage.setItem(AuthErrorBoundary.RELOAD_KEY, String(now));

        // Clear the potentially corrupted session cookie before reloading
        // so the server gets a clean request and doesn't re-render stale data.
        fetch('/api/auth/session', { method: 'GET' })
          .finally(() => window.location.reload());
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="bg-background fixed top-0 left-0 z-[100] flex h-screen w-screen items-center justify-center"
          aria-busy="true"
        >
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        </div>
      );
    }

    return this.props.children;
  }
}

function AuthEventsBridge({ children }: React.PropsWithChildren) {
  const { data: session, status } = useSession();
  const { emit } = useAppEvents();
  const monitoring = useMonitoring();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    try {
      const userId = session?.user?.id as string | undefined;
      const email = session?.user?.email ?? undefined;

      if (status === 'authenticated' && userId) {
        if (lastUserId.current !== userId) {
          emit({
            type: 'user.signedIn',
            payload: { userId },
          });

          monitoring.identifyUser({
            id: userId,
            ...(email ? { email } : {}),
          });
        } else {
          emit({
            type: 'user.updated',
            payload: { userId, email: email ?? '' },
          });

          monitoring.identifyUser({
            id: userId,
            ...(email ? { email } : {}),
          });
        }

        lastUserId.current = userId;
        return;
      }

      if (status === 'unauthenticated' && lastUserId.current) {
        lastUserId.current = null;
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          message: '[AuthEventsBridge] Effect error (non-fatal)',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }, [emit, monitoring, session?.user?.email, session?.user?.id, status]);

  return <>{children}</>;
}
