'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, Phone, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@kit/ui/card';
import { Button } from '@kit/ui/button';

const DEPLOY_STEPS = [
  { label: 'Provisioning phone number', durationMs: 18_000 },
  { label: 'Building AI assistants', durationMs: 30_000 },
  { label: 'Training knowledge base', durationMs: 28_000 },
  { label: 'Configuring call routing', durationMs: 26_000 },
  { label: 'Setting up integrations', durationMs: 24_000 },
  { label: 'Running final checks', durationMs: 22_000 },
  { label: 'Going live!', durationMs: 12_000 },
];

const TOTAL_DURATION_MS = DEPLOY_STEPS.reduce((sum, s) => sum + s.durationMs, 0);

const TIPS = [
  'Your AI receptionist can handle multiple calls at the same time.',
  'Callers can book, reschedule, and cancel appointments by phone.',
  'The knowledge base helps your AI answer questions about your practice.',
  'Call recordings and transcripts are available in your dashboard.',
  'You can change the voice or phone number any time after setup.',
];

const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

interface DeployingAnimationProps {
  startedAt?: string | null;
  deploymentError?: string | null;
}

export function DeployingAnimation({ startedAt, deploymentError }: DeployingAnimationProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [status, setStatus] = useState<'deploying' | 'completed' | 'failed'>(
    deploymentError ? 'failed' : 'deploying',
  );
  const [errorMessage, setErrorMessage] = useState(deploymentError || '');
  const startTimeRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/deploy-status');
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'completed') {
        setStatus('completed');
        setProgress(100);
        setActiveStep(DEPLOY_STEPS.length);
      } else if (data.status === 'failed') {
        setStatus('failed');
        setErrorMessage(data.error || 'Deployment failed. Please try again.');
      } else if (data.status === 'in_progress') {
        // Check for stale deployment
        const started = data.startedAt ? new Date(data.startedAt).getTime() : startTimeRef.current;
        if (Date.now() - started > STALE_TIMEOUT_MS) {
          setStatus('failed');
          setErrorMessage('Deployment is taking longer than expected. Please contact support.');
        }
      }
    } catch {
      // Network error — ignore, will retry
    }
  }, []);

  // Poll every 10 seconds
  useEffect(() => {
    if (status !== 'deploying') return;
    pollRef.current = setInterval(pollStatus, 10_000);
    // Initial poll after 5s
    const initialPoll = setTimeout(pollStatus, 5_000);
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(initialPoll);
    };
  }, [status, pollStatus]);

  // Simulated step progression based on elapsed time
  useEffect(() => {
    if (status !== 'deploying') return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / TOTAL_DURATION_MS) * 95, 95); // Cap at 95% until real completion
      setProgress(pct);

      let accumulated = 0;
      for (let i = 0; i < DEPLOY_STEPS.length; i++) {
        accumulated += DEPLOY_STEPS[i]!.durationMs;
        if (elapsed < accumulated) {
          setActiveStep(i);
          break;
        }
        if (i === DEPLOY_STEPS.length - 1) {
          setActiveStep(DEPLOY_STEPS.length - 1);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [status]);

  // Rotate tips every 12 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 12_000);
    return () => clearInterval(interval);
  }, []);

  // On completion, redirect after a short celebration
  useEffect(() => {
    if (status !== 'completed') return;
    const timer = setTimeout(() => {
      router.replace('/home/agent?deployed=true');
    }, 3000);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (status === 'failed') {
    return (
      <div className="container max-w-2xl py-16 flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full border-destructive/30">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-5">
            <div className="rounded-full bg-destructive/10 p-5">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Setup encountered an issue</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {errorMessage || 'Something went wrong during deployment. Please try again.'}
              </p>
            </div>
            <Button
              onClick={() => router.push('/home/agent/setup/review')}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-16 flex flex-col items-center justify-center min-h-[60vh]">
      <Card className="w-full overflow-hidden">
        {/* Gradient glow bar at top */}
        <div className="h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60 animate-pulse" />

        <CardContent className="pt-10 pb-10 flex flex-col items-center text-center space-y-8">
          {/* Animated icon */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="relative rounded-full bg-primary/10 p-6 ring-2 ring-primary/20">
              {status === 'completed' ? (
                <CheckCircle2 className="h-12 w-12 text-green-500 animate-in zoom-in duration-300" />
              ) : (
                <Phone className="h-12 w-12 text-primary animate-pulse" />
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            {status === 'completed' ? (
              <>
                <h2 className="text-2xl font-bold text-green-600 animate-in fade-in duration-500">
                  Your AI Receptionist is Live!
                </h2>
                <p className="text-sm text-muted-foreground">
                  Redirecting to your dashboard...
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold">
                  Setting Up Your AI Receptionist
                </h2>
                <p className="text-sm text-muted-foreground">
                  This usually takes 2–3 minutes. Sit tight!
                </p>
              </>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md space-y-2">
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
              {status === 'deploying' && (
                <div
                  className="absolute inset-y-0 rounded-full w-16 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              {Math.round(progress)}%
            </p>
          </div>

          {/* Step list */}
          <div className="w-full max-w-sm space-y-3 text-left">
            {DEPLOY_STEPS.map((step, i) => {
              const isComplete = status === 'completed' || i < activeStep;
              const isActive = status === 'deploying' && i === activeStep;
              const isPending = status === 'deploying' && i > activeStep;

              return (
                <div
                  key={step.label}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    isPending ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 animate-in zoom-in duration-200" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 text-primary flex-shrink-0 animate-spin" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm ${
                      isComplete
                        ? 'text-green-700 dark:text-green-400 font-medium'
                        : isActive
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rotating tips */}
          {status === 'deploying' && (
            <div className="w-full max-w-md mt-4 rounded-lg bg-muted/50 px-4 py-3 min-h-[3.5rem] flex items-center justify-center">
              <p
                key={tipIndex}
                className="text-xs text-muted-foreground text-center animate-in fade-in slide-in-from-bottom-1 duration-500"
              >
                <span className="font-medium text-foreground">Did you know?</span>{' '}
                {TIPS[tipIndex]}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSS for shimmer effect */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
