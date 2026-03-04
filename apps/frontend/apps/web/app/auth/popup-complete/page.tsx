'use client';

import { useEffect, useRef } from 'react';

import { Loader2 } from 'lucide-react';

const CHANNEL_NAME = 'parlae-auth';
const MESSAGE_TYPE = 'parlae-auth-complete';

export default function PopupCompletePage() {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const message = { type: MESSAGE_TYPE, success: true };

    // BroadcastChannel works same-origin even when window.opener is severed
    // by cross-origin redirects during the OAuth flow.
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    } catch {
      // BroadcastChannel unsupported -- fall through to opener
    }

    if (window.opener) {
      try {
        window.opener.postMessage(message, window.location.origin);
      } catch {
        // opener access blocked
      }
    }

    setTimeout(() => window.close(), 300);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Sign-in complete. Closing...</p>
    </div>
  );
}
