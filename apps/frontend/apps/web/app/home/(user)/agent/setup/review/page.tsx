'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Separator } from '@kit/ui/separator';
import { Loader2, Mic, FileText, Link, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { deployReceptionistAction } from '../_lib/actions';

export default function ReviewPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deployed, setDeployed] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string>('');

  const [config, setConfig] = useState<{
    accountId?: string;
    businessName?: string;
    voice?: any;
    files?: any[];
  }>({});

  useEffect(() => {
    // Load configuration from session storage
    const voice = sessionStorage.getItem('selectedVoice');
    const files = sessionStorage.getItem('knowledgeBaseFiles');
    const accountId = sessionStorage.getItem('accountId');
    const businessName = sessionStorage.getItem('businessName');

    if (!voice || !accountId || !businessName) {
      toast.error('Configuration not found. Please start from step 1.');
      router.push('/home/agent/setup');
      return;
    }

    setConfig({
      accountId,
      businessName,
      voice: voice ? JSON.parse(voice) : null,
      files: files ? JSON.parse(files) : [],
    });
  }, [router]);

  const handleDeploy = () => {
    if (!config.voice) {
      toast.error('Voice configuration is missing. Please go back to step 1.');
      return;
    }

    startTransition(async () => {
      try {
        // Backend will automatically use an existing Twilio number
        const result = await deployReceptionistAction({
          voice: config.voice,
          files: config.files || [],
        });

        if (result.success) {
          setDeployed(true);
          setPhoneNumber(result.phoneNumber || 'Provisioned');
          toast.success('AI Receptionist deployed successfully!');
          
          // Clear session storage
          sessionStorage.removeItem('selectedVoice');
          sessionStorage.removeItem('knowledgeBaseFiles');
          sessionStorage.removeItem('accountId');
          sessionStorage.removeItem('businessName');
        } else {
          toast.error(result.error || 'Failed to deploy receptionist');
        }
      } catch (error) {
        toast.error('An error occurred during deployment');
        console.error(error);
      }
    });
  };

  const handleGoToDashboard = () => {
    router.push('/home/agent');
  };

  if (deployed) {
    return (
      <div className="container max-w-4xl py-8">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-4">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-900">
                  Your AI Receptionist is Live!
                </h2>
                <p className="text-green-700 mt-2">
                  Your AI receptionist has been configured and is ready to answer calls
                </p>
                {phoneNumber && (
                  <p className="text-sm text-green-600 mt-2">
                    Internal phone number: {phoneNumber}
                  </p>
                )}
              </div>
              <div className="pt-4">
                <Button onClick={handleGoToDashboard} size="lg">
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Review & Launch</h1>
        <p className="text-muted-foreground mt-2">
          Review your configuration and launch your AI receptionist
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <Stepper
          steps={['Voice Selection', 'Knowledge Base', 'Integrations', 'Phone Integration', 'Review & Launch']}
          currentStep={4}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 4: Review & Launch</CardTitle>
          <CardDescription>
            Review your configuration before going live
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Voice */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Voice Assistant</h3>
            </div>
            {config.voice ? (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{config.voice.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {config.voice.gender} • {config.voice.accent} • {config.voice.provider}
                      </p>
                      <p className="text-sm mt-1">{config.voice.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/home/agent/setup`)}
                    >
                      Change
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No voice selected. Please go back to step 1.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Knowledge Base */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Knowledge Base</h3>
            </div>
            {config.files && config.files.length > 0 ? (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      {config.files.length} file{config.files.length !== 1 ? 's' : ''} uploaded
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/home/agent/setup/knowledge`)}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {config.files.slice(0, 3).map((file: any) => (
                      <p key={file.id} className="text-sm text-muted-foreground">
                        • {file.name}
                      </p>
                    ))}
                    {config.files.length > 3 && (
                      <p className="text-sm text-muted-foreground">
                        • and {config.files.length - 3} more...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    No files uploaded. You can add files later from settings.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Integrations */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Integrations</h3>
            </div>
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  No integrations configured. You can add integrations later from settings.
                </p>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <AlertDescription>
              <strong>Ready to launch?</strong> Your AI receptionist will be configured with a phone number automatically. 
              You can update settings later from the dashboard.
            </AlertDescription>
          </Alert>

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => router.push(`/home/agent/setup/phone`)}
              disabled={pending}
            >
              Back
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={pending || !config.voice}
              size="lg"
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deploy AI Receptionist
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
