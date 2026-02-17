'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Stepper } from '@kit/ui/stepper';
import { VoiceSelectionForm } from './voice-selection-form';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';
import { useSetupProgress } from '../_lib/use-setup-progress';

interface VoiceSelectionPageClientProps {
  accountId: string;
  businessName: string;
  accountEmail: string;
  savedClinicName?: string;
}

export function VoiceSelectionPageClient({ accountId, businessName, accountEmail, savedClinicName }: VoiceSelectionPageClientProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedVoice, setSelectedVoice] = useState<any>(null);
  const [clinicName, setClinicName] = useState(savedClinicName || '');
  const [isSaving, setIsSaving] = useState(false);
  
  const { progress, saveVoice, isLoading } = useSetupProgress(accountId);

  // Load saved progress on mount
  useEffect(() => {
    if (progress?.voice?.data) {
      setSelectedVoice(progress.voice.data);
    }
    if (progress?.voice?.clinicName) {
      setClinicName(progress.voice.clinicName);
    }
  }, [progress]);

  // Store account info in session storage for other pages.
  // If the account changed (e.g. different user logged in), clear stale setup data
  // to prevent data leaking between users sharing the same browser tab.
  useEffect(() => {
    const previousAccountId = sessionStorage.getItem('accountId');
    if (previousAccountId && previousAccountId !== accountId) {
      const keysToClean = [
        'phoneNumber',
        'phoneIntegrationMethod',
        'phoneIntegrationSettings',
        'selectedVoice',
        'knowledgeBaseFiles',
        'businessName',
        'accountEmail',
        'clinicName',
      ];
      keysToClean.forEach((key) => sessionStorage.removeItem(key));
    }
    sessionStorage.setItem('accountId', accountId);
    sessionStorage.setItem('businessName', businessName);
    sessionStorage.setItem('accountEmail', accountEmail);
  }, [accountId, businessName, accountEmail]);

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

  const handleContinue = async () => {
    if (!clinicName.trim()) {
      toast.error(t('common:setup.voice.enterClinicName', 'Please enter your clinic or business name'));
      return;
    }
    if (!selectedVoice) {
      toast.error(t('common:setup.voice.selectVoice'));
      return;
    }

    try {
      setIsSaving(true);
      
      // Save voice + clinic name to database
      await saveVoice({ ...selectedVoice, clinicName: clinicName.trim() });
      
      // Also store in session storage for backward compatibility
      sessionStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
      sessionStorage.setItem('clinicName', clinicName.trim());
      
      toast.success('Saved');
      router.push(`/home/agent/setup/knowledge`);
    } catch (error) {
      console.error('Failed to save voice selection:', error);
      toast.error('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    t('common:setup.steps.voice'),
    t('common:setup.steps.knowledge'),
    t('common:setup.steps.integrations'),
    t('common:setup.steps.phone'),
    t('common:setup.steps.review'),
  ];

  return (
    <div className="container max-w-4xl py-4 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header - Compact */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          <Trans i18nKey="common:setup.title" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <Trans i18nKey="common:setup.subtitle" />
        </p>
      </div>

      {/* Progress Steps - Compact */}
      <div className="mb-6 flex-shrink-0">
        <Stepper
          steps={steps}
          currentStep={0}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Scrollable Content Area with Fade */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Clinic Name */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                <Trans i18nKey="common:setup.clinicName.title" defaults="Your Clinic" />
              </CardTitle>
              <CardDescription className="text-sm">
                <Trans i18nKey="common:setup.clinicName.description" defaults="This name will be used by your AI receptionist when greeting callers." />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="clinicName">
                  <Trans i18nKey="common:setup.clinicName.label" defaults="Clinic / Business Name" />
                </Label>
                <Input
                  id="clinicName"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder={t('common:setup.clinicName.placeholder', 'e.g. Maple Dental Clinic')}
                  className="max-w-md"
                />
              </div>
            </CardContent>
          </Card>

          {/* Voice Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                <Trans i18nKey="common:setup.voice.title" />
              </CardTitle>
              <CardDescription className="text-sm">
                <Trans i18nKey="common:setup.voice.description" />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VoiceSelectionForm 
                accountId={accountId}
                businessName={businessName}
                initialVoice={selectedVoice}
                onVoiceSelect={setSelectedVoice}
              />
            </CardContent>
          </Card>
        </div>
        {/* Fade effect at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Navigation - Fixed at bottom */}
      <div className="pt-4 border-t border-border/40 flex-shrink-0 bg-background">
        <div className="flex justify-end">
          <Button
            onClick={handleContinue}
            disabled={!selectedVoice || !clinicName.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : <Trans i18nKey="common:setup.voice.continueToKnowledge" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
