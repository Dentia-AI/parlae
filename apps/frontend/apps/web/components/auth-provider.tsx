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
 * the session state is still settling. Auto-retries once; if the error
 * persists it re-throws so global-error.tsx can handle it.
 */
class AuthErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; retryCount: number; caughtError: Error | null }
> {
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
        stack: error.stack?.slice(0, 500),
        componentStack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  componentDidUpdate(_: unknown, prevState: { retryCount: number }) {
    if (this.state.hasError && this.state.retryCount === prevState.retryCount) {
      if (this.state.retryCount < 1) {
        setTimeout(() => {
          this.setState((s) => ({
            hasError: false,
            retryCount: s.retryCount + 1,
            caughtError: null,
          }));
        }, 250);
      }
    }
  }

  render() {
    if (this.state.hasError && this.state.retryCount >= 1) {
      throw this.state.caughtError;
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
