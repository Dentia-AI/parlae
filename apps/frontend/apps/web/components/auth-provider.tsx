'use client';

import { useEffect, useRef } from 'react';

import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';

import { useMonitoring } from '@kit/monitoring/hooks';
import { useAppEvents } from '@kit/shared/events';

type AuthProviderProps = React.PropsWithChildren<{ session?: Session | null }>;

export function AuthProvider({ session, children }: AuthProviderProps) {
  return (
    <SessionProvider session={session}>
      <AuthEventsBridge>{children}</AuthEventsBridge>
    </SessionProvider>
  );
}

function AuthEventsBridge({ children }: React.PropsWithChildren) {
  const { data: session, status } = useSession();
  const { emit } = useAppEvents();
  const monitoring = useMonitoring();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
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
  }, [emit, monitoring, session?.user?.email, session?.user?.id, status]);

  return <>{children}</>;
}
