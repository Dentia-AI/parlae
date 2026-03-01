'use client';

import { Component, useEffect, useRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';

import { useMonitoring } from '@kit/monitoring/hooks';
import { useAppEvents } from '@kit/shared/events';

type AuthProviderProps = React.PropsWithChildren<{ session?: Session | null }>;

export function AuthProvider({ session, children }: AuthProviderProps) {
  return (
    <SessionProvider session={session}>
      <AuthErrorBoundary>
        <AuthEventsBridge>{children}</AuthEventsBridge>
      </AuthErrorBoundary>
    </SessionProvider>
  );
}

/**
 * Catches transient errors that can occur during OAuth redirects when
 * the session state is still settling (e.g. React #310 hooks errors
 * from next-auth/React 19 interactions). Retries up to 2 times with
 * increasing delays; on persistent failure does a hard refresh to let
 * the server produce a clean render.
 */
class AuthErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; retryCount: number; caughtError: Error | null }
> {
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAYS = [300, 800];
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
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError && this.state.retryCount >= AuthErrorBoundary.MAX_RETRIES) {
      return (
        <div
          className="bg-background fixed top-0 left-0 z-[100] flex h-screen w-screen items-center justify-center"
          aria-busy="true"
        >
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        </div>
      );
    }

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
