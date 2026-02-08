'use client';

import { useState, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Loader2, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { setupPortedNumberAction } from '../_lib/phone-actions';

interface PortedNumberSetupProps {
  accountId: string;
  businessName: string;
  onBack: () => void;
  onComplete: () => void;
}

export function PortedNumberSetup({ 
  accountId, 
  businessName, 
  onBack, 
  onComplete 
}: PortedNumberSetupProps) {
  const [pending, startTransition] = useTransition();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currentCarrier, setCurrentCarrier] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [authorized, setAuthorized] = useState(false);

  const handleSubmit = () => {
    if (!phoneNumber || !currentCarrier || !authorized) {
      toast.error('Please fill in all required fields');
      return;
    }

    startTransition(async () => {
      try {
        const result = await setupPortedNumberAction({
          accountId,
          phoneNumber,
          currentCarrier,
          accountNumber,
          businessName,
        });

        if (result.success) {
          toast.success('Port request submitted! We\'ll notify you when complete.');
          sessionStorage.setItem('phoneIntegrationMethod', 'ported');
          sessionStorage.setItem('phoneNumber', phoneNumber);
          onComplete();
        } else {
          toast.error(result.error || 'Failed to submit port request');
        }
      } catch (error) {
        toast.error('An error occurred');
        console.error(error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Porting Timeline:</strong> The porting process typically takes 7-14 business days. 
          We'll guide you through each step and notify you of progress.
        </AlertDescription>
      </Alert>

      {/* Phone Number */}
      <div className="space-y-2">
        <Label htmlFor="phoneNumber">
          Phone Number to Port <span className="text-destructive">*</span>
        </Label>
        <Input
          id="phoneNumber"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Enter the phone number you want to transfer to our system
        </p>
      </div>

      {/* Current Carrier */}
      <div className="space-y-2">
        <Label htmlFor="carrier">
          Current Phone Carrier <span className="text-destructive">*</span>
        </Label>
        <Input
          id="carrier"
          type="text"
          placeholder="e.g., AT&T, Verizon, T-Mobile"
          value={currentCarrier}
          onChange={(e) => setCurrentCarrier(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          The company that currently provides your phone service
        </p>
      </div>

      {/* Account Number */}
      <div className="space-y-2">
        <Label htmlFor="accountNumber">
          Account Number (Optional)
        </Label>
        <Input
          id="accountNumber"
          type="text"
          placeholder="Your account number with current carrier"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Found on your phone bill. Speeds up the porting process.
        </p>
      </div>

      {/* Authorization */}
      <div className="flex items-start space-x-2">
        <input
          type="checkbox"
          id="authorized"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
          className="mt-1"
        />
        <Label htmlFor="authorized" className="font-normal cursor-pointer">
          I authorize the porting of this phone number and confirm I am an authorized 
          representative of <strong>{businessName}</strong>
        </Label>
      </div>

      {/* What Happens Next */}
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          <strong>What happens next:</strong>
          <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
            <li>We'll submit your port request to Twilio</li>
            <li>You'll receive a Letter of Authorization (LOA) to sign</li>
            <li>We'll need a copy of your recent phone bill</li>
            <li>Current carrier will be notified (7-14 day process)</li>
            <li>Number will be transferred with minimal downtime</li>
            <li>AI receptionist will start answering calls automatically</li>
          </ol>
        </AlertDescription>
      </Alert>

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t">
        <Button variant="outline" onClick={onBack} disabled={pending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={!phoneNumber || !currentCarrier || !authorized || pending}
        >
          {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit Port Request
        </Button>
      </div>
    </div>
  );
}
