'use client';

import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Separator } from '@kit/ui/separator';
import { 
  PhoneCall, 
  PhoneForwarded, 
  Network,
  Settings,
  CheckCircle2,
  AlertCircle,
  Copy
} from 'lucide-react';
import Link from 'next/link';

async function PhoneSettingsContent() {
  // TODO: Fetch actual phone settings from database
  const phoneSettings = {
    method: 'forwarded' as const, // or 'ported' | 'sip'
    phoneNumber: '+1 (555) 123-4567',
    twilioNumber: '+1 (647) 555-9999',
    status: 'active',
    setupDate: '2024-02-07',
  };

  const methodInfo = {
    ported: {
      name: 'Ported Number',
      icon: PhoneCall,
      description: 'Your number is fully transferred to our system',
    },
    forwarded: {
      name: 'Call Forwarding',
      icon: PhoneForwarded,
      description: 'Calls are forwarded from your existing number',
    },
    sip: {
      name: 'SIP Trunk',
      icon: Network,
      description: 'Connected via your PBX system',
    },
  };

  const currentMethod = methodInfo[phoneSettings.method];
  const Icon = currentMethod.icon;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Phone Integration</h1>
        <p className="text-muted-foreground mt-2">
          Manage how your phone number connects to your AI receptionist
        </p>
      </div>

      {/* Current Setup */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>{currentMethod.name}</CardTitle>
                <CardDescription>{currentMethod.description}</CardDescription>
              </div>
            </div>
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phone Numbers */}
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Your Clinic Number</div>
              <div className="text-2xl font-bold font-mono">{phoneSettings.phoneNumber}</div>
            </div>

            {phoneSettings.method === 'forwarded' && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Forwarding To</div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-mono">{phoneSettings.twilioNumber}</div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(phoneSettings.twilioNumber);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Setup Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            Setup completed on {phoneSettings.setupDate}
          </div>
        </CardContent>
      </Card>

      {/* Change Method */}
      <Card>
        <CardHeader>
          <CardTitle>Change Integration Method</CardTitle>
          <CardDescription>
            Switch to a different phone integration method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Changing your integration method will require reconfiguring your phone setup. 
              Your AI receptionist will be temporarily unavailable during the transition.
            </AlertDescription>
          </Alert>

          <Link href="/home/agent/setup/phone">
            <Button variant="outline" className="w-full">
              Change Integration Method
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Method-Specific Instructions */}
      {phoneSettings.method === 'forwarded' && (
        <Card>
          <CardHeader>
            <CardTitle>Call Forwarding Instructions</CardTitle>
            <CardDescription>
              How to enable or disable call forwarding
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">To Enable Forwarding:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Call your phone carrier</li>
                <li>Request call forwarding to {phoneSettings.twilioNumber}</li>
                <li>Test by calling {phoneSettings.phoneNumber}</li>
              </ol>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium">To Disable Forwarding:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Call your phone carrier</li>
                <li>Request to disable call forwarding</li>
                <li>Calls will go directly to your clinic again</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Support */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Having issues with your phone integration?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>Contact our support team:</p>
            <div className="space-y-1">
              <div>📧 Email: support@yourcompany.com</div>
              <div>📞 Phone: 1-800-SUPPORT</div>
              <div>💬 Live Chat: Available Mon-Fri 9AM-5PM</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PhoneIntegrationSettingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PhoneSettingsContent />
    </Suspense>
  );
}
