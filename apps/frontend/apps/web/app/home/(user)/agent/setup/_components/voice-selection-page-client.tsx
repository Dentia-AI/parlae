'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
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
}

export function VoiceSelectionPageClient({ accountId, businessName, accountEmail }: VoiceSelectionPageClientProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedVoice, setSelectedVoice] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const { progress, saveVoice, isLoading } = useSetupProgress(accountId);

  // Load saved progress on mount
  useEffect(() => {
    if (progress?.voice?.data) {
      setSelectedVoice(progress.voice.data);
    }
  }, [progress]);

  // Store account info in session storage for other pages
  useEffect(() => {
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
    if (!selectedVoice) {
      toast.error(t('common:setup.voice.selectVoice'));
      return;
    }

    try {
      setIsSaving(true);
      
      // Save to database
      await saveVoice(selectedVoice);
      
      // Also store in session storage for backward compatibility
      sessionStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
      
      toast.success('Voice selection saved');
      router.push(`/home/agent/setup/knowledge`);
    } catch (error) {
      console.error('Failed to save voice selection:', error);
      toast.error('Failed to save voice selection. Please try again.');
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
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4">
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
      <div className="pt-4 border-t flex-shrink-0 bg-background">
        <div className="flex justify-end">
          <Button
            onClick={handleContinue}
            disabled={!selectedVoice || isSaving}
          >
            {isSaving ? 'Saving...' : <Trans i18nKey="common:setup.voice.continueToKnowledge" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
