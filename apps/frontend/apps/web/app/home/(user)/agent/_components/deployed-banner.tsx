'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, X } from 'lucide-react';

interface DeployedBannerProps {
  phoneNumber: string;
}

export function DeployedBanner({ phoneNumber }: DeployedBannerProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    // Remove the query param from the URL without a full reload
    router.replace('/home/agent', { scroll: false });
  };

  return (
    <div className="relative rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-5 py-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-green-100 dark:bg-green-900 p-2 shrink-0">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="font-semibold text-green-900 dark:text-green-100">
            Your AI Receptionist is Live!
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
            Your AI receptionist has been deployed and is ready to answer calls
            at <code className="font-mono font-medium">{phoneNumber}</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
