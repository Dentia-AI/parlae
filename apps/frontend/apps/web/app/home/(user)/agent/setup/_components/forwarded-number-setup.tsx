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

type ForwardingType = 'all' | 'conditional';

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
  const [forwardingType, setForwardingType] = useState<ForwardingType>('all');
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
          if (parsed.forwardingType) {
            setForwardingType(parsed.forwardingType);
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
          forwardingType,
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
              forwardingType,
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

          {/* Forwarding type selector */}
          <div className="space-y-3">
            <Label>Forwarding Type</Label>
            <div className="grid gap-3">
              {/* All Calls - Recommended */}
              <label
                className={`relative flex cursor-pointer rounded-lg border p-4 transition-colors ${
                  forwardingType === 'all'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="forwardingType"
                  value="all"
                  checked={forwardingType === 'all'}
                  onChange={() => setForwardingType('all')}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <PhoneForwarded className="h-4 w-4 text-primary" />
                    <span className="font-medium">Forward All Calls</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every incoming call goes to the AI receptionist. Best for
                    clinics that want full AI coverage. You&apos;ll provide a
                    dedicated human line for emergencies and transfer requests.
                  </p>
                </div>
              </label>

              {/* Conditional */}
              <label
                className={`relative flex cursor-pointer rounded-lg border p-4 transition-colors ${
                  forwardingType === 'conditional'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="forwardingType"
                  value="conditional"
                  checked={forwardingType === 'conditional'}
                  onChange={() => setForwardingType('conditional')}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span className="font-medium">
                      No-Answer &amp; Busy Only
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Staff answers during office hours. AI only picks up when
                    nobody answers or lines are busy. Good for gradual
                    adoption.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Human line — required for "all calls", optional for conditional */}
          <div className="space-y-2">
            <Label htmlFor="staffDirectNumber">
              Dedicated Human Line{' '}
              {forwardingType === 'all' ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground text-xs font-normal">
                  (optional)
                </span>
              )}
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
              {forwardingType === 'all' ? (
                <>
                  A direct number where a human can always be reached (office
                  back line, cell phone, etc.). When a caller asks to speak
                  with a human or there&apos;s an emergency, the AI will
                  transfer the call here.{' '}
                  <strong>
                    This must be different from your main number
                  </strong>{' '}
                  since all calls on that number are forwarded to AI.
                </>
              ) : (
                <>
                  A direct office number, cell phone, or back line. Used for{' '}
                  <strong>emergency transfers</strong> and when a caller asks to
                  speak with a human. If not provided, transfers will go to your
                  main clinic number.
                </>
              )}
            </p>
          </div>

          {forwardingType === 'all' && !staffDirectNumber && clinicNumber && (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                <strong>A dedicated human line is required</strong> when
                forwarding all calls. Since your main number forwards
                everything to AI, the AI needs a separate number to transfer
                callers to a real person. This can be a cell phone, back office
                line, or any number staff can answer.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={provisionTwilioNumber}
            disabled={
              !clinicNumber ||
              isProvisioning ||
              (forwardingType === 'all' && !staffDirectNumber)
            }
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
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Clinic main number:
                    </div>
                    <div className="text-2xl font-bold font-mono">
                      {clinicNumber}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSetupComplete(false)}
                  >
                    Edit
                  </Button>
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
                  Calls will be handled by your AI receptionist.{' '}
                  {staffDirectNumber
                    ? 'Emergency and human transfer requests will be routed to your dedicated human line.'
                    : 'Human transfer requests will be routed to your main clinic number.'}
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
                {/* Overview */}
                <div className="rounded-lg border p-4">
                  <h4 className="font-semibold mb-2">
                    Carrier Forwarding Codes
                  </h4>
                  <p className="text-muted-foreground">
                    Use the codes below for your carrier to set up forwarding.
                    Choose <strong>All Calls</strong> for full AI coverage, or{' '}
                    <strong>No-Answer / Busy</strong> if staff should answer
                    first.
                  </p>
                </div>

                {/* Canadian carriers */}
                <div>
                  <h4 className="font-semibold mb-2">
                    Canadian Carriers (Bell, Rogers, Telus, Fido, Koodo, Virgin)
                  </h4>
                  <div className="space-y-3">
                    <div className="rounded-md border p-3">
                      <div className="font-medium mb-1">
                        All Calls (Unconditional)
                      </div>
                      <p className="text-muted-foreground">
                        All calls go straight to AI
                      </p>
                      <div className="mt-2 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*72</strong> + Twilio number
                        <br />
                        Disable: <strong>*73</strong>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-muted-foreground mb-1">
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
                      <div className="font-medium text-muted-foreground mb-1">
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
                  </div>
                </div>

                {/* US carriers */}
                <div>
                  <h4 className="font-semibold mb-2">
                    US Carriers (AT&amp;T, Verizon, T-Mobile)
                  </h4>
                  <div className="space-y-3">
                    <div className="rounded-md border p-3">
                      <div className="font-medium mb-1">
                        All Calls (Unconditional)
                      </div>
                      <div className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*21*</strong>Twilio number
                        <strong>#</strong>
                        <br />
                        Disable: <strong>#21#</strong>
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="font-medium text-muted-foreground mb-1">
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
                      <div className="font-medium text-muted-foreground mb-1">
                        Busy Forwarding
                      </div>
                      <div className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                        Activate: <strong>*67*</strong>Twilio number
                        <strong>#</strong>
                        <br />
                        Disable: <strong>#67#</strong>
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
                      Set to forward all calls, or configure no-answer/busy
                      rules
                    </li>
                    <li>Save and test with a call</li>
                  </ol>
                </div>

                {/* Landline */}
                <div>
                  <h4 className="font-semibold mb-2">Traditional Landline</h4>
                  <p className="text-muted-foreground">
                    Contact your phone provider and request{' '}
                    <strong>all call forwarding</strong> (or no-answer/busy if
                    preferred) to the Twilio number. Most carriers support this
                    for $3-5/month.
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
