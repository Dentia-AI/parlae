'use client';

import { useEffect, useRef } from 'react';

import { Loader2 } from 'lucide-react';

import { notifyParentAndClose } from '~/components/auth/popup-auth-closer';

export default function PopupCompletePage() {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    notifyParentAndClose();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Sign-in complete. Closing...</p>
    </div>
  );
}
