'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent } from '@kit/ui/card';
import { Loader2, ArrowLeft, Copy, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { setupSipTrunkAction } from '../_lib/phone-actions';

interface SipTrunkSetupProps {
  accountId: string;
  businessName: string;
  onBack: () => void;
  onComplete: () => void;
  onSetupStateChange?: (isComplete: boolean) => void;
}

export function SipTrunkSetup({ 
  accountId, 
  businessName, 
  onBack, 
  onComplete,
  onSetupStateChange
}: SipTrunkSetupProps) {
  const [pending, startTransition] = useTransition();
  const [pbxType, setPbxType] = useState('');
  const [clinicNumber, setClinicNumber] = useState('');
  const [sipCredentials, setSipCredentials] = useState<{
    sipUrl: string;
    username: string;
    password: string;
  } | null>(null);

  // Notify parent of setup state changes
  useEffect(() => {
    onSetupStateChange?.(!!sipCredentials);
  }, [sipCredentials, onSetupStateChange]);

  const handleProvision = () => {
    if (!pbxType || !clinicNumber) {
      toast.error('Please fill in all fields');
      return;
    }

    startTransition(async () => {
      try {
        const result = await setupSipTrunkAction({
          accountId,
          clinicNumber,
          pbxType,
          businessName,
        });

        if (result.success && result.sipCredentials) {
          setSipCredentials(result.sipCredentials);
          sessionStorage.setItem('phoneIntegrationMethod', 'sip');
          sessionStorage.setItem('phoneNumber', clinicNumber);
          toast.success('SIP trunk credentials generated!');
        } else {
          toast.error(result.error || 'Failed to setup SIP trunk');
        }
      } catch (error) {
        toast.error('An error occurred');
        console.error(error);
      }
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>SIP Trunking:</strong> Connect your existing PBX system to route calls 
          through our AI receptionist. This requires technical configuration of your PBX.
        </AlertDescription>
      </Alert>

      {!sipCredentials ? (
        /* Step 1: Gather Information */
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pbxType">
              PBX System Type <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pbxType"
              type="text"
              placeholder="e.g., Asterisk, FreePBX, 3CX, RingCentral"
              value={pbxType}
              onChange={(e) => setPbxType(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              The phone system software you currently use
            </p>
          </div>

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <strong>We support:</strong> Asterisk, FreePBX, 3CX, Avaya, Cisco, RingCentral, 
              and most SIP-compatible PBX systems
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleProvision}
            disabled={!pbxType || !clinicNumber || pending}
            className="w-full"
          >
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generate SIP Credentials
          </Button>
        </div>
      ) : (
        /* Step 2: Show Credentials & Instructions */
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>SIP Trunk Ready!</strong> Use the credentials below to configure your PBX.
            </AlertDescription>
          </Alert>

          {/* SIP Credentials Card */}
          <Card className="border-primary">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">SIP URL</div>
                    <div className="font-mono text-sm break-all">{sipCredentials.sipUrl}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(sipCredentials.sipUrl, 'SIP URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">Username</div>
                    <div className="font-mono text-sm">{sipCredentials.username}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(sipCredentials.username, 'Username')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">Password</div>
                    <div className="font-mono text-sm">{sipCredentials.password}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(sipCredentials.password, 'Password')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuration Instructions */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Configuration Steps:</strong>
              <ol className="list-decimal list-inside mt-3 space-y-2 text-sm">
                <li>Log into your PBX system ({pbxType})</li>
                <li>Navigate to "SIP Trunks" or "Trunking" settings</li>
                <li>Create a new SIP trunk with the credentials above</li>
                <li>Configure inbound routing:
                  <ul className="list-disc list-inside ml-6 mt-1">
                    <li>Route calls from {clinicNumber} to this trunk</li>
                    <li>Set dial plan to forward to AI during specified hours</li>
                  </ul>
                </li>
                <li>Test by calling {clinicNumber}</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* PBX-Specific Guides */}
          <div className="space-y-2">
            <Label>Setup Guides for Popular PBX Systems</Label>
            <div className="grid gap-2">
              <a 
                href="https://wiki.asterisk.org/wiki/display/AST/Configuring+SIP+Trunks"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Asterisk / FreePBX Setup Guide
              </a>
              <a 
                href="https://www.3cx.com/docs/manual/sip-trunks/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                3CX Setup Guide
              </a>
              <a 
                href="https://support.ringcentral.com/article-v2/11472.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                RingCentral Setup Guide
              </a>
            </div>
          </div>

          {/* Need Help Alert */}
          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Need technical assistance?</strong> Contact your IT administrator or 
              our support team at support@yourcompany.com for help configuring your PBX.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
