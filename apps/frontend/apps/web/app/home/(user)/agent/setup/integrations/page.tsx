'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Calendar, Clock, Info } from 'lucide-react';
import { toast } from '@kit/ui/sonner';

export default function IntegrationsPage() {
  const router = useRouter();

  const handleContinue = () => {
    router.push(`/home/agent/setup/phone`);
  };

  const handleSkip = () => {
    sessionStorage.setItem('skipIntegrations', 'true');
    router.push(`/home/agent/setup/phone`);
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect your booking and scheduling software (optional)
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <Stepper
          steps={['Voice Selection', 'Knowledge Base', 'Integrations', 'Phone Integration', 'Review & Launch']}
          currentStep={2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 4: Booking Integration (Optional)</CardTitle>
          <CardDescription>
            Connect your existing scheduling software for automatic booking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This step is optional. You can add integrations later from your settings.
            </AlertDescription>
          </Alert>

          {/* Coming Soon Integrations */}
          <div className="space-y-4">
            <h3 className="font-medium">Coming Soon</h3>
            
            <Card className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <Calendar className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">Calendly Integration</h4>
                    <p className="text-sm text-muted-foreground">
                      Sync appointments with your Calendly account
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">Acuity Scheduling</h4>
                    <p className="text-sm text-muted-foreground">
                      Book appointments directly to Acuity
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <Calendar className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">Google Calendar</h4>
                    <p className="text-sm text-muted-foreground">
                      Sync with your Google Calendar
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Custom API Integration */}
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-2">Custom Integration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Have your own booking API? Contact us to set up a custom integration.
            </p>
            <Button variant="outline" disabled>
              Contact Support
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => router.push(`/home/agent/setup/knowledge`)}
            >
              Back
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSkip}
              >
                Skip for Now
              </Button>
              <Button
                onClick={handleContinue}
              >
                Continue to Review
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
