'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Loader2,
  Phone,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  PhoneForwarded,
  Shield,
  Info,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { setupForwardedNumberAction } from '../_lib/phone-actions';

interface ForwardedNumberSetupProps {
  accountId: string;
  businessName: string;
  onBack: () => void;
  onComplete: () => void;
  onSetupStateChange?: (isComplete: boolean) => void;
}

export function ForwardedNumberSetup({
  accountId,
  businessName,
  onBack,
  onComplete,
  onSetupStateChange,
}: ForwardedNumberSetupProps) {
  const [pending, startTransition] = useTransition();
  const [clinicNumber, setClinicNumber] = useState('');
  const [staffDirectNumber, setStaffDirectNumber] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [showCarrierGuide, setShowCarrierGuide] = useState(false);

  // Load saved state from sessionStorage on mount
  useEffect(() => {
    const savedNumber = sessionStorage.getItem('phoneNumber');
    const savedMethod = sessionStorage.getItem('phoneIntegrationMethod');
    const savedSettings = sessionStorage.getItem('phoneIntegrationSettings');
    if (savedNumber && savedMethod === 'forwarded') {
      setClinicNumber(savedNumber);
      setSetupComplete(true);
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed.staffDirectNumber) {
            setStaffDirectNumber(parsed.staffDirectNumber);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Notify parent of setup state changes
  useEffect(() => {
    onSetupStateChange?.(setupComplete);
  }, [setupComplete, onSetupStateChange]);

  const provisionTwilioNumber = () => {
    setIsProvisioning(true);

    startTransition(async () => {
      try {
        const result = await setupForwardedNumberAction({
          accountId,
          clinicNumber,
          staffDirectNumber: staffDirectNumber || undefined,
          businessName,
        });

        if (result.success) {
          setSetupComplete(true);
          sessionStorage.setItem('phoneIntegrationMethod', 'forwarded');
          sessionStorage.setItem('phoneNumber', clinicNumber);
          sessionStorage.setItem(
            'phoneIntegrationSettings',
            JSON.stringify({
              clinicNumber,
              staffDirectNumber: staffDirectNumber || undefined,
            }),
          );
          toast.success(result.message || 'Configuration saved successfully!');
        } else {
          toast.error(result.error || 'Failed to save configuration');
        }
      } catch (error) {
        toast.error('An error occurred');
        console.error(error);
      } finally {
        setIsProvisioning(false);
      }
    });
  };

  const handleComplete = () => {
    if (!setupComplete) {
      toast.error('Please complete the setup first');
      return;
    }
    onComplete();
  };

  return (
    <div className="space-y-6">
      <Alert>
        <PhoneForwarded className="h-4 w-4" />
        <AlertDescription>
          <strong>Call Forwarding Setup:</strong> The fastest way to get started.
          Keep your existing number and forward calls to Parlae when you want AI
          to answer. Patient caller ID is preserved for automatic lookups.
        </AlertDescription>
      </Alert>

      {/* Step 1: Enter Clinic Number */}
      {!setupComplete && (
        <div className="space-y-5">
          {/* Main clinic number */}
          <div className="space-y-2">
            <Label htmlFor="clinicNumber">
              Clinic&apos;s Main Phone Number{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clinicNumber"
              type="tel"
              placeholder="+1 (416) 555-1234"
              value={clinicNumber}
              onChange={(e) => setClinicNumber(e.target.value)}
              disabled={isProvisioning}
            />
            <p className="text-sm text-muted-foreground">
              The number patients currently call to reach your clinic. You will
              set up forwarding from this number after deployment.
            </p>
          </div>

          {/* Staff direct number (optional) */}
          <div className="space-y-2">
            <Label htmlFor="staffDirectNumber">
              Staff Direct Line{' '}
              <span className="text-muted-foreground text-xs font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="staffDirectNumber"
              type="tel"
              placeholder="+1 (416) 555-5678"
              value={staffDirectNumber}
              onChange={(e) => setStaffDirectNumber(e.target.value)}
              disabled={isProvisioning}
            />
            <p className="text-sm text-muted-foreground">
              A direct office number, cell phone, or back line where staff can
              be reached. Used for <strong>emergency transfers</strong> — when
              the AI detects an urgent situation, it will transfer the caller
              directly to this number so a human can help.
            </p>
          </div>

          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
              <strong>Why a separate staff line?</strong> If your main number
              has unconditional forwarding to us and the AI tries to transfer an
              emergency call back to that same number, it would loop. A separate
              direct line avoids this. If you use no-answer/busy forwarding
              instead, the main number works fine.
            </AlertDescription>
          </Alert>

          <Button
            onClick={provisionTwilioNumber}
            disabled={!clinicNumber || isProvisioning}
            className="w-full"
          >
            {isProvisioning && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save Configuration
          </Button>
        </div>
      )}

      {/* Step 2: Configuration Saved */}
      {setupComplete && (
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              <strong>Configuration Saved!</strong> Your forwarding setup has
              been configured.
            </AlertDescription>
          </Alert>

          {/* Clinic Number Card */}
          <Card className="border-primary">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Clinic main number:
                  </div>
                  <div className="text-2xl font-bold font-mono">
                    {clinicNumber}
                  </div>
                </div>
                {staffDirectNumber && (
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Staff direct line (for emergency transfers):
                    </div>
                    <div className="text-lg font-semibold font-mono">
                      {staffDirectNumber}
                    </div>
                  </div>
                )}
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <strong>Next Steps:</strong> A Twilio forwarding number will
                    be provisioned when you complete payment and deploy your AI
                    receptionist in the review step.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* What Happens Next */}
          <Alert>
            <Phone className="h-4 w-4" />
            <AlertDescription>
              <strong>After deployment:</strong>
              <ol className="list-decimal list-inside mt-3 space-y-2 text-sm">
                <li>
                  We&apos;ll provision a Twilio number and share it with you
                </li>
                <li>
                  Set up call forwarding on your carrier from{' '}
                  <strong className="font-mono">{clinicNumber}</strong> to the
                  Twilio number
                </li>
                <li>
                  We recommend <strong>no-answer + busy forwarding</strong> so
                  your staff answers during hours and AI handles the rest
                </li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Carrier Setup Guide (collapsible) */}
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setShowCarrierGuide(!showCarrierGuide)}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  How to Set Up Forwarding on Your Carrier
                </span>
                {showCarrierGuide ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
            {showCarrierGuide && (
              <CardContent className="pt-0 space-y-5 text-sm">
                {/* Recommended setup */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <h4 className="font-semibold mb-2">
                    Recommended: No-Answer + Busy Forwarding
                  </h4>
                  <p className="text-muted-foreground mb-2">
                    This combo gives you the best experience. Staff answers
                    during hours. If they&apos;re busy or don&apos;t pick up,
                    calls automatically go to the AI. After hours, nobody
                    answers, so AI handles it.
                  </p>
                  <p className="text-muted-foreground">
                    Set up <strong>both</strong> types below for complete
                    coverage.
                  </p>
                </div>

                {/* Canadian carriers */}
                <div>
                  <h4 className="font-semibold mb-2">
                    Canadian Carriers (Bell, Rogers, Telus, Fido, Koodo, Virgin)
                  </h4>
                  <div className="space-y-3">
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                        No-Answer Forwarding
                      </div>
                      <p className="text-muted-foreground">
                        Forwards after ~15-25 seconds if nobody answers
                      </p>
                      <div className="mt-2 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*92</strong> + Twilio number
                        <br />
                        Disable: <strong>*93</strong>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                        Busy Forwarding
                      </div>
                      <p className="text-muted-foreground">
                        Forwards when all lines are occupied
                      </p>
                      <div className="mt-2 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*90</strong> + Twilio number
                        <br />
                        Disable: <strong>*91</strong>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                        All Calls (Unconditional)
                      </div>
                      <p className="text-muted-foreground">
                        All calls go straight to AI — use when you want AI to
                        handle everything
                      </p>
                      <div className="mt-2 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*72</strong> + Twilio number
                        <br />
                        Disable: <strong>*73</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* US carriers */}
                <div>
                  <h4 className="font-semibold mb-2">
                    US Carriers (AT&amp;T, Verizon, T-Mobile)
                  </h4>
                  <div className="space-y-3">
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                        No-Answer Forwarding
                      </div>
                      <div className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*61*</strong>Twilio number
                        <strong>#</strong>
                        <br />
                        Disable: <strong>#61#</strong>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                        Busy Forwarding
                      </div>
                      <div className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*67*</strong>Twilio number
                        <strong>#</strong>
                        <br />
                        Disable: <strong>#67#</strong>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                        All Calls (Unconditional)
                      </div>
                      <div className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*21*</strong>Twilio number
                        <strong>#</strong>
                        <br />
                        Disable: <strong>#21#</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* VoIP */}
                <div>
                  <h4 className="font-semibold mb-2">
                    VoIP / PBX Systems (RingCentral, 8x8, Vonage, Grasshopper)
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Log into your VoIP admin portal</li>
                    <li>
                      Navigate to <strong>Call Routing</strong> or{' '}
                      <strong>Call Forwarding</strong>
                    </li>
                    <li>Add the Twilio number as a forwarding destination</li>
                    <li>
                      Set rules: no-answer (after X rings) and busy forwarding
                    </li>
                    <li>Save and test with a call</li>
                  </ol>
                </div>

                {/* Landline */}
                <div>
                  <h4 className="font-semibold mb-2">Traditional Landline</h4>
                  <p className="text-muted-foreground">
                    Contact your phone provider and request{' '}
                    <strong>no-answer</strong> and{' '}
                    <strong>busy call forwarding</strong> to the Twilio number.
                    Most carriers support this for $3-5/month.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
