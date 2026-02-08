'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { PhoneMethodSelector } from '../_components/phone-method-selector';
import { PortedNumberSetup } from '../_components/ported-number-setup';
import { ForwardedNumberSetup } from '../_components/forwarded-number-setup';
import { SipTrunkSetup } from '../_components/sip-trunk-setup';

type IntegrationMethod = 'ported' | 'forwarded' | 'sip' | null;

function PhoneSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedMethod, setSelectedMethod] = useState<IntegrationMethod>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');

  useEffect(() => {
    // Load from session storage
    const storedMethod = sessionStorage.getItem('phoneIntegrationMethod') as IntegrationMethod;
    const storedAccountId = sessionStorage.getItem('accountId');
    const storedBusinessName = sessionStorage.getItem('businessName');

    if (storedAccountId && storedBusinessName) {
      setAccountId(storedAccountId);
      setBusinessName(storedBusinessName);
    }

    if (storedMethod) {
      setSelectedMethod(storedMethod);
    }
  }, []);

  const handleMethodSelected = (method: IntegrationMethod) => {
    setSelectedMethod(method);
  };

  const handleBack = () => {
    setSelectedMethod(null);
    sessionStorage.removeItem('phoneIntegrationMethod');
  };

  const handleComplete = () => {
    // After phone setup is complete, go to review
    router.push('/home/agent/setup/review');
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Phone Integration</h1>
        <p className="text-muted-foreground mt-2">
          Connect your phone number to your AI receptionist
        </p>
      </div>

      <div className="mb-8">
        <Stepper
          steps={['Voice Selection', 'Knowledge Base', 'Phone Integration', 'Review & Launch']}
          currentStep={2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {!selectedMethod ? 'Step 3: Choose Integration Method' : `Setup: ${selectedMethod}`}
          </CardTitle>
          <CardDescription>
            {!selectedMethod 
              ? 'Select how you want to connect your phone number'
              : 'Complete the setup for your selected method'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedMethod ? (
            <PhoneMethodSelector
              accountId={accountId}
              businessName={businessName}
              onMethodSelected={handleMethodSelected}
            />
          ) : selectedMethod === 'ported' ? (
            <PortedNumberSetup
              accountId={accountId}
              businessName={businessName}
              onBack={handleBack}
              onComplete={handleComplete}
            />
          ) : selectedMethod === 'forwarded' ? (
            <ForwardedNumberSetup
              accountId={accountId}
              businessName={businessName}
              onBack={handleBack}
              onComplete={handleComplete}
            />
          ) : selectedMethod === 'sip' ? (
            <SipTrunkSetup
              accountId={accountId}
              businessName={businessName}
              onBack={handleBack}
              onComplete={handleComplete}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PhoneIntegrationPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PhoneSetupContent />
    </Suspense>
  );
}
