'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, X } from 'lucide-react';
import { CallForwardingInstructions } from './call-forwarding-instructions';

interface DeployedBannerProps {
  phoneNumber: string;
  clinicNumber?: string;
  integrationMethod?: string;
}

export function DeployedBanner({ phoneNumber, clinicNumber, integrationMethod }: DeployedBannerProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const isForwarded = integrationMethod === 'forwarded';

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    router.replace('/home/agent', { scroll: false });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Success banner */}
      <div className="relative rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-5 py-4">
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
              {isForwarded && (
                <span className="block mt-1 font-medium">
                  Complete the call forwarding setup below to start receiving calls.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Forwarding instructions shown prominently after deployment */}
      {isForwarded && (
        <CallForwardingInstructions
          twilioNumber={phoneNumber}
          clinicNumber={clinicNumber}
          defaultExpanded={true}
        />
      )}
    </div>
  );
}
