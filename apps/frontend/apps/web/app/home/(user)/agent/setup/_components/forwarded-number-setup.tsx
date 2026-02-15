'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent } from '@kit/ui/card';
import { Loader2, ArrowLeft, Phone, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
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
  onSetupStateChange
}: ForwardedNumberSetupProps) {
  const [pending, startTransition] = useTransition();
  const [clinicNumber, setClinicNumber] = useState('');
  const [twilioNumber, setTwilioNumber] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  // Load saved state from sessionStorage on mount
  useEffect(() => {
    const savedNumber = sessionStorage.getItem('phoneNumber');
    const savedMethod = sessionStorage.getItem('phoneIntegrationMethod');
    if (savedNumber && savedMethod === 'forwarded') {
      setClinicNumber(savedNumber);
      setSetupComplete(true);
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
          businessName,
        });

        if (result.success) {
          // Configuration saved successfully - number will be provisioned after payment
          setSetupComplete(true);
          sessionStorage.setItem('phoneIntegrationMethod', 'forwarded');
          sessionStorage.setItem('phoneNumber', clinicNumber);
          sessionStorage.setItem(
            'phoneIntegrationSettings',
            JSON.stringify({ clinicNumber }),
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

  const copyNumber = (number: string) => {
    navigator.clipboard.writeText(number);
    toast.success('Number copied to clipboard!');
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
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Call Forwarding Setup:</strong> This is the fastest way to get started. 
          You'll keep your existing number and forward calls to us when you want AI to answer.
        </AlertDescription>
      </Alert>

      {/* Step 1: Enter Clinic Number */}
      {!setupComplete && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinicNumber">
              Your Clinic's Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clinicNumber"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={clinicNumber}
              onChange={(e) => setClinicNumber(e.target.value)}
              disabled={isProvisioning}
            />
            <p className="text-sm text-muted-foreground">
              The number patients currently call to reach your clinic
            </p>
          </div>

          <Button 
            onClick={provisionTwilioNumber}
            disabled={!clinicNumber || isProvisioning}
            className="w-full"
          >
            {isProvisioning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>
        </div>
      )}

      {/* Step 2: Show Configuration Saved Message */}
      {setupComplete && (
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Configuration Saved!</strong> Your forwarding setup has been configured.
            </AlertDescription>
          </Alert>

          {/* Clinic Number Card */}
          <Card className="border-primary">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Your clinic number:</div>
                  <div className="text-2xl font-bold font-mono">{clinicNumber}</div>
                </div>
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>Next Steps:</strong> A Twilio forwarding number will be provisioned 
                    when you complete payment and deploy your AI receptionist in the review step.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* What Happens Next */}
          <Alert>
            <Phone className="h-4 w-4" />
            <AlertDescription>
              <strong>What happens next:</strong>
              <ol className="list-decimal list-inside mt-3 space-y-2 text-sm">
                <li>Complete the remaining setup steps (knowledge base, integrations)</li>
                <li>Add payment method in the review step</li>
                <li>Click "Deploy" - we'll purchase a Twilio number for you</li>
                <li>You'll receive the forwarding number to set up with your carrier</li>
                <li>Configure call forwarding from {clinicNumber} to the Twilio number</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Info about call forwarding */}
          <div className="space-y-2">
            <Label>About Call Forwarding</Label>
            <p className="text-sm text-muted-foreground">
              After deployment, you'll set up call forwarding with your phone carrier to route 
              calls from <strong className="font-mono">{clinicNumber}</strong> to your new 
              Twilio number. This allows the AI to answer calls while you keep your existing number.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
