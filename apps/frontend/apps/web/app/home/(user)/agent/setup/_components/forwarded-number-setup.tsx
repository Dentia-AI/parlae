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

        if (result.success && result.twilioNumber) {
          setTwilioNumber(result.twilioNumber);
          setSetupComplete(true);
          sessionStorage.setItem('phoneIntegrationMethod', 'forwarded');
          sessionStorage.setItem('phoneNumber', clinicNumber);
          sessionStorage.setItem('twilioForwardNumber', result.twilioNumber);
          toast.success('Forwarding number provisioned!');
        } else {
          toast.error(result.error || 'Failed to provision number');
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
            Get Forwarding Number
          </Button>
        </div>
      )}

      {/* Step 2: Show Forwarding Instructions */}
      {setupComplete && twilioNumber && (
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Success!</strong> Your forwarding number is ready. Follow the steps below to complete setup.
            </AlertDescription>
          </Alert>

          {/* Forwarding Number Card */}
          <Card className="border-primary">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Forward calls to:</div>
                    <div className="text-2xl font-bold font-mono">{twilioNumber}</div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyNumber(twilioNumber)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Setup Instructions */}
          <Alert>
            <Phone className="h-4 w-4" />
            <AlertDescription>
              <strong>Setup Instructions:</strong>
              <ol className="list-decimal list-inside mt-3 space-y-2 text-sm">
                <li>Contact your phone carrier (the company that provides {clinicNumber})</li>
                <li>Tell them you want to set up <strong>call forwarding</strong></li>
                <li>Provide them with the forwarding number: <strong className="font-mono">{twilioNumber}</strong></li>
                <li>Choose when to forward:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li><strong>Always Forward:</strong> All calls go to AI (recommended for testing)</li>
                    <li><strong>Forward When Busy:</strong> AI handles overflow calls</li>
                    <li><strong>Forward No Answer:</strong> AI answers if no one picks up</li>
                  </ul>
                </li>
                <li>Test by calling {clinicNumber} - the AI should answer!</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Common Carriers Quick Links */}
          <div className="space-y-2">
            <Label>Quick Setup Links (Common Carriers)</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <a 
                href="https://www.att.com/support/article/wireless/KM1008728" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                → AT&T Call Forwarding
              </a>
              <a 
                href="https://www.verizon.com/support/call-forwarding-faqs" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                → Verizon Call Forwarding
              </a>
              <a 
                href="https://www.t-mobile.com/support/plans-features/call-forwarding" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                → T-Mobile Call Forwarding
              </a>
              <a 
                href="https://www.sprint.com/en/support/solutions/services/faqs-about-call-forwarding.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                → Sprint Call Forwarding
              </a>
            </div>
          </div>

          {/* Test Call Reminder */}
          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Important:</strong> After setting up forwarding with your carrier, 
              test it by calling {clinicNumber} from another phone. You should hear your 
              AI receptionist answer!
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
