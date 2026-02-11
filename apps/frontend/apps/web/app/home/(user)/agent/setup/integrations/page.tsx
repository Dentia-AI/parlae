'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Calendar, Clock, Info, Building2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { PmsSetupWizard } from '../_components/pms-setup-wizard';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';
import { useSetupProgress } from '../_lib/use-setup-progress';

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showPmsSetup, setShowPmsSetup] = useState(false);
  const [pmsConnectionStatus, setPmsConnectionStatus] = useState<'pending' | 'connected' | 'not_connected'>('pending');
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { progress, saveIntegrations, isLoading } = useSetupProgress(accountId || '');

  useEffect(() => {
    // Load account info from session storage
    const storedAccountId = sessionStorage.getItem('accountId');
    const storedAccountEmail = sessionStorage.getItem('accountEmail');
    const storedBusinessName = sessionStorage.getItem('businessName');

    // If missing, redirect to start
    if (!storedAccountId || !storedBusinessName) {
      router.push('/home/agent/setup');
      return;
    }

    setAccountId(storedAccountId);
    setAccountEmail(storedAccountEmail || '');
    setIsReady(true);

    // Check if returning from OAuth callback
    const status = searchParams.get('status');
    const error = searchParams.get('error');
    const provider = searchParams.get('provider');
    const email = searchParams.get('email');
    
    if (status === 'success') {
      if (provider === 'google-calendar') {
        // Google Calendar connection successful
        setGoogleCalendarConnected(true);
        setGoogleCalendarEmail(email);
        toast.success('Google Calendar connected successfully!');
      } else if (provider === 'sikka') {
        // Sikka PMS connection successful
        setShowPmsSetup(true);
        setPmsConnectionStatus('connected');
        toast.success('Sikka PMS connected successfully!');
      } else {
        // Generic PMS connection (fallback)
        setShowPmsSetup(true);
        toast.success(t('common:setup.integrations.authSuccess'));
      }
    } else if (status === 'error' || error) {
      if (provider === 'google-calendar') {
        toast.error(error || 'Failed to connect Google Calendar');
      } else if (provider === 'sikka') {
        setShowPmsSetup(true);
        toast.error(error || 'Failed to connect Sikka PMS');
      } else {
        setShowPmsSetup(true);
        toast.error(error || t('common:setup.integrations.authError'));
      }
    }
  }, [router, searchParams, t]);

  // Load saved integrations progress from database
  useEffect(() => {
    if (progress?.integrations?.data) {
      const savedData = progress.integrations.data;
      
      // Restore PMS connection status
      if (savedData.pmsConnected) {
        setPmsConnectionStatus('connected');
      } else if (savedData.skipped) {
        setPmsConnectionStatus('not_connected');
      }
      
      // Restore Google Calendar connection status
      if (savedData.googleCalendarConnected) {
        setGoogleCalendarConnected(true);
        setGoogleCalendarEmail(savedData.googleCalendarEmail || null);
      }
      
      // If they had started PMS setup, show the wizard
      if (savedData.pmsProvider) {
        setShowPmsSetup(true);
      }
    }
  }, [progress]);

  if (!isReady) {
    return null;
  }

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

  const handleSetupPms = () => {
    // Show PMS setup wizard (no navigation)
    setShowPmsSetup(true);
  };

  const handleBackFromPmsSetup = () => {
    // Hide PMS setup wizard and return to integrations list
    setShowPmsSetup(false);
    // Clear URL params
    window.history.replaceState({}, '', '/home/agent/setup/integrations');
  };

  const handleConnectGoogleCalendar = async () => {
    if (!accountId) return;

    try {
      // Get OAuth URL from Next.js API route
      const response = await fetch(`/api/google-calendar/${accountId}/auth-url`);

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const { authUrl } = await response.json();
      
      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to connect Google Calendar:', error);
      toast.error('Failed to connect Google Calendar. Please try again.');
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!accountId) return;

    try {
      const response = await fetch(`/api/google-calendar/${accountId}/disconnect`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      setGoogleCalendarConnected(false);
      setGoogleCalendarEmail(null);
      toast.success('Google Calendar disconnected');
    } catch (error) {
      console.error('Failed to disconnect Google Calendar:', error);
      toast.error('Failed to disconnect Google Calendar');
    }
  };

  const handleSkip = async () => {
    if (!accountId) {
      router.push(`/home/agent/setup/phone`);
      return;
    }

    try {
      setIsSaving(true);
      
      // Save that integrations were skipped
      await saveIntegrations({ 
        pmsConnected: false,
        pmsProvider: null,
        googleCalendarConnected,
        googleCalendarEmail,
        skipped: true 
      });
      router.push(`/home/agent/setup/phone`);
    } catch (error) {
      console.error('Failed to save integrations skip:', error);
      // Continue anyway
      router.push(`/home/agent/setup/phone`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = async () => {
    if (!accountId) {
      router.push(`/home/agent/setup/phone`);
      return;
    }

    try {
      setIsSaving(true);

      // Save integrations progress (PMS and/or Google Calendar)
      await saveIntegrations({
        pmsConnected: pmsConnectionStatus === 'connected',
        pmsProvider: pmsConnectionStatus === 'connected' ? 'sikka' : null,
        googleCalendarConnected,
        googleCalendarEmail,
        skipped: false
      });

      toast.success('Integrations progress saved');
      router.push(`/home/agent/setup/phone`);
    } catch (error) {
      console.error('Failed to save integrations:', error);
      toast.error('Failed to save integrations. Please try again.');
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
          <Trans i18nKey="common:setup.integrations.title" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <Trans i18nKey="common:setup.integrations.description" />
        </p>
      </div>

      {/* Progress Steps - Compact */}
      <div className="mb-6 flex-shrink-0">
        <Stepper
          steps={steps}
          currentStep={2}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Scrollable Content Area with Fade */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4">
        
        {/* Show PMS Setup Wizard or Integrations List */}
        {showPmsSetup ? (
          // PMS Setup Wizard (replaces integrations list)
          <>
            <Button variant="ghost" size="sm" onClick={handleBackFromPmsSetup} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <Trans i18nKey="common:setup.integrations.backToIntegrations" />
            </Button>
            <PmsSetupWizard 
              accountId={accountId!} 
              accountEmail={accountEmail!}
              onConnectionStatusChange={setPmsConnectionStatus}
            />
          </>
        ) : (
          // Integrations List
          <>
        {/* Practice Management System - Recommended */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                <Trans i18nKey="common:setup.integrations.pmsTitle" />
              </CardTitle>
              <Badge variant="default" className="bg-green-600 text-xs">
                <Trans i18nKey="common:setup.integrations.recommended" />
              </Badge>
            </div>
            <CardDescription className="text-sm">
              <Trans i18nKey="common:setup.integrations.pmsDescription" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">
                      <Trans i18nKey="common:setup.integrations.pmsIntegrationTitle" />
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <Trans i18nKey="common:setup.integrations.pmsIntegrationDesc" />
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span><Trans i18nKey="common:setup.integrations.appointmentBooking" /></span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span><Trans i18nKey="common:setup.integrations.patientLookup" /></span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span><Trans i18nKey="common:setup.integrations.insuranceVerification" /></span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span><Trans i18nKey="common:setup.integrations.paymentProcessing" /></span>
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleSetupPms} size="sm">
                    <Trans i18nKey="common:setup.integrations.connectPMS" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <Trans i18nKey="common:setup.integrations.pmsAlertRecommended" />
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Google Calendar - Alternative */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              <Trans i18nKey="common:setup.integrations.calendarTitle" />
            </CardTitle>
            <CardDescription className="text-sm">
              {pmsConnectionStatus === 'connected' 
                ? <Trans i18nKey="common:setup.integrations.calendarDescConnected" />
                : <Trans i18nKey="common:setup.integrations.calendarDescNotConnected" />
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Card className={googleCalendarConnected ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20" : "border-muted"}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 dark:bg-blue-900/20 p-2.5">
                    <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Trans i18nKey="common:setup.integrations.googleCalendar" />
                      {googleCalendarConnected && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                          <Trans i18nKey="common:setup.integrations.connected" />
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {googleCalendarConnected
                        ? `${t('common:setup.integrations.googleCalendarConnectedAs')} ${googleCalendarEmail || 'Google Account'}`
                        : pmsConnectionStatus === 'connected'
                          ? <Trans i18nKey="common:setup.integrations.googleCalendarBasicSync" />
                          : <Trans i18nKey="common:setup.integrations.googleCalendarBasicManagement" />
                      }
                    </p>
                    {!googleCalendarConnected && pmsConnectionStatus !== 'connected' && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-2">
                        <CheckCircle2 className="h-3 w-3" />
                        <span><Trans i18nKey="common:setup.integrations.googleCalendarAppointmentOnly" /></span>
                      </div>
                    )}
                  </div>
                  {googleCalendarConnected ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleDisconnectGoogleCalendar}
                    >
                      <Trans i18nKey="common:setup.integrations.disconnect" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleConnectGoogleCalendar} 
                      size="sm"
                      variant={pmsConnectionStatus === 'connected' ? 'outline' : 'default'}
                    >
                      <Trans i18nKey="common:setup.integrations.connectCalendar" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {pmsConnectionStatus !== 'connected' && !googleCalendarConnected && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <Trans i18nKey="common:setup.integrations.googleCalendarNote" />
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
          </>
        )}
        </div>
        {/* Fade effect at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Navigation - Fixed at bottom */}
      <div className="pt-4 border-t flex-shrink-0 bg-background">
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/home/agent/setup/knowledge`)}
          >
            <Trans i18nKey="common:setup.navigation.back" />
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={isSaving}
            >
              <Trans i18nKey="common:setup.integrations.skipForNow" />
            </Button>
            <Button
              onClick={handleContinue}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : <Trans i18nKey="common:setup.integrations.continue" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
