'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { PhoneMethodSelector } from '../_components/phone-method-selector';
import { PortedNumberSetup } from '../_components/ported-number-setup';
import { ForwardedNumberSetup } from '../_components/forwarded-number-setup';
import { SipTrunkSetup } from '../_components/sip-trunk-setup';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';
import { useSetupProgress } from '../_lib/use-setup-progress';

type IntegrationMethod = 'ported' | 'forwarded' | 'sip' | null;

function PhoneSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<IntegrationMethod>(null);
  const [tempSelectedMethod, setTempSelectedMethod] = useState<IntegrationMethod>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [canSubmitPort, setCanSubmitPort] = useState(false);
  const [portSubmitHandler, setPortSubmitHandler] = useState<(() => void) | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const { progress, savePhone, isLoading } = useSetupProgress(accountId);

  const handleStepClick = (stepIndex: number) => {
    const routes = [
      '/home/agent/setup',
      '/home/agent/setup/knowledge',
      '/home/agent/setup/integrations',
      '/home/agent/setup/phone',
      '/home/agent/setup/review',
    ];
    router.push(routes[stepIndex]);
  };

  useEffect(() => {
    // Load from session storage
    const storedAccountId = sessionStorage.getItem('accountId');
    const storedBusinessName = sessionStorage.getItem('businessName');

    if (storedAccountId && storedBusinessName) {
      setAccountId(storedAccountId);
      setBusinessName(storedBusinessName);
    }
  }, []);

  // Load saved phone integration progress from database
  useEffect(() => {
    if (progress?.phone?.data) {
      const savedMethod = progress.phone.data.method as IntegrationMethod;
      if (savedMethod) {
        setSelectedMethod(savedMethod);
        setTempSelectedMethod(savedMethod);
        // Sync to sessionStorage
        sessionStorage.setItem('phoneIntegrationMethod', savedMethod);

        // Also restore settings to sessionStorage
        if (progress.phone.data.settings) {
          sessionStorage.setItem(
            'phoneIntegrationSettings',
            JSON.stringify(progress.phone.data.settings),
          );
          // Restore specific fields
          const settings = progress.phone.data.settings as Record<string, any>;
          if (settings.clinicNumber) {
            sessionStorage.setItem('phoneNumber', settings.clinicNumber);
          }
        }
      }
    }
  }, [progress]);

  const handleMethodChange = (method: IntegrationMethod) => {
    setTempSelectedMethod(method);
  };

  const handleContinueFromSelector = async () => {
    if (!tempSelectedMethod) {
      toast.error(t('common:setup.phone.selectMethod'));
      return;
    }

    if (!accountId) {
      toast.error('Account ID not found');
      return;
    }

    try {
      setIsSaving(true);

      // Save to database
      await savePhone({ 
        method: tempSelectedMethod,
        settings: {
          clinicNumber: sessionStorage.getItem('phoneNumber') || '',
        },
      });

      // Store selection in session storage for backward compatibility
      sessionStorage.setItem('phoneIntegrationMethod', tempSelectedMethod);
      
      // Navigate to method-specific setup
      setSelectedMethod(tempSelectedMethod);
      
      toast.success('Phone method saved');
    } catch (error) {
      console.error('Failed to save phone method:', error);
      toast.error('Failed to save phone method. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (selectedMethod) {
      // If in a specific setup, go back to method selection
      setSelectedMethod(null);
      setTempSelectedMethod(null);
      sessionStorage.removeItem('phoneIntegrationMethod');
    } else {
      // If in method selection, go back to integrations
      router.push('/home/agent/setup/integrations');
    }
  };

  const handleComplete = () => {
    // After phone setup is complete, go to review
    router.push('/home/agent/setup/review');
  };

  const steps = [
    t('common:setup.steps.voice'),
    t('common:setup.steps.knowledge'),
    t('common:setup.steps.integrations'),
    t('common:setup.steps.phone'),
    t('common:setup.steps.review'),
  ];

  const getMethodName = (methodId: string) => {
    return t(`common:setup.phone.methods.${methodId}`);
  };

  return (
    <div className="container max-w-4xl py-4 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header - Compact */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          <Trans i18nKey="common:setup.phone.title" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <Trans i18nKey="common:setup.phone.description" />
        </p>
      </div>

      {/* Progress Steps - Compact */}
      <div className="mb-6 flex-shrink-0">
        <Stepper
          steps={steps}
          currentStep={3}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Scrollable Content Area with Fade */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {!selectedMethod ? (
                  <Trans i18nKey="common:setup.phone.chooseMethod" defaults="Step 4: Choose Integration Method" />
                ) : (
                  `Setup: ${getMethodName(selectedMethod)}`
                )}
              </CardTitle>
              <CardDescription className="text-sm">
                {!selectedMethod ? (
                  <Trans i18nKey="common:setup.phone.chooseMethodDesc" defaults="Select how you want to connect your phone number" />
                ) : (
                  <Trans i18nKey="common:setup.phone.setupMethod" defaults="Complete the setup for your selected method" />
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
            {!selectedMethod ? (
              <PhoneMethodSelector
                accountId={accountId}
                businessName={businessName}
                onMethodSelected={handleMethodChange}
              />
            ) : selectedMethod === 'ported' ? (
              <PortedNumberSetup
                accountId={accountId}
                businessName={businessName}
                onBack={handleBack}
                onComplete={handleComplete}
                onCanSubmit={(canSubmit, onSubmit) => {
                  setCanSubmitPort(canSubmit);
                  setPortSubmitHandler(() => onSubmit);
                }}
              />
            ) : selectedMethod === 'forwarded' ? (
              <ForwardedNumberSetup
                accountId={accountId}
                businessName={businessName}
                onBack={handleBack}
                onComplete={handleComplete}
                onSetupStateChange={setIsSetupComplete}
              />
            ) : selectedMethod === 'sip' ? (
              <SipTrunkSetup
                accountId={accountId}
                businessName={businessName}
                onBack={handleBack}
                onComplete={handleComplete}
                onSetupStateChange={setIsSetupComplete}
              />
            ) : null}
            </CardContent>
          </Card>
        </div>
        {/* Fade effect at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Navigation - Fixed at bottom */}
      <div className="pt-4 border-t flex-shrink-0 bg-background">
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
          >
            <Trans i18nKey="common:setup.navigation.back" />
          </Button>
          {!selectedMethod ? (
            <Button
              onClick={handleContinueFromSelector}
              disabled={!tempSelectedMethod || isSaving}
            >
              {isSaving ? 'Saving...' : `${t('common:setup.phone.continueWith')} ${tempSelectedMethod ? getMethodName(tempSelectedMethod) : t('common:setup.phone.selectedMethod')}`}
            </Button>
          ) : selectedMethod === 'ported' ? (
            <Button
              onClick={() => portSubmitHandler?.()}
              disabled={!canSubmitPort}
            >
              <Trans i18nKey="common:setup.phone.submitPortRequest" />
            </Button>
          ) : isSetupComplete ? (
            <Button onClick={handleComplete}>
              <Trans i18nKey="common:setup.phone.continueToReview" />
            </Button>
          ) : null}
        </div>
      </div>
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
