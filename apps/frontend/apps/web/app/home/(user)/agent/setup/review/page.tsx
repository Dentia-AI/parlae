'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Separator } from '@kit/ui/separator';
import { Loader2, Mic, FileText, Link, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Database } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { deployReceptionistAction } from '../_lib/actions';
import { SetupPaymentForm } from '../_components/setup-payment-form';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@kit/ui/collapsible';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

export default function ReviewPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const csrfToken = useCsrfToken();
  const [pending, startTransition] = useTransition();
  
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentSectionOpen, setPaymentSectionOpen] = useState(true);
  const [reviewSectionOpen, setReviewSectionOpen] = useState(false);

  const [config, setConfig] = useState<{
    accountId?: string;
    businessName?: string;
    voice?: any;
    files?: any[];
    knowledgeBaseConfig?: Record<string, string[]>;
  }>({});
  const [integrations, setIntegrations] = useState<{
    googleCalendar: boolean;
    pms: boolean;
    pmsProvider?: string;
  }>({ googleCalendar: false, pms: false });

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
    // Load configuration from session storage
    const voice = sessionStorage.getItem('selectedVoice');
    const files = sessionStorage.getItem('knowledgeBaseFiles');
    const accountId = sessionStorage.getItem('accountId');
    const businessName = sessionStorage.getItem('businessName');

    if (!voice || !accountId || !businessName) {
      toast.error(t('common:setup.review.configNotFound'));
      router.push('/home/agent/setup');
      return;
    }

    const kbConfigStr = sessionStorage.getItem('knowledgeBaseConfig');

    setConfig({
      accountId,
      businessName,
      voice: voice ? JSON.parse(voice) : null,
      files: files ? JSON.parse(files) : [],
      knowledgeBaseConfig: kbConfigStr ? JSON.parse(kbConfigStr) : undefined,
    });

    // Check integration status
    const checkIntegrations = async () => {
      try {
        const response = await fetch('/api/integrations/status');
        if (response.ok) {
          const data = await response.json();
          setIntegrations({
            googleCalendar: data.googleCalendar ?? false,
            pms: data.pms ?? false,
            pmsProvider: data.pmsProvider,
          });
        }
      } catch (error) {
        console.error('Failed to check integrations:', error);
      }
    };

    checkIntegrations();

    // Check if payment method is already verified
    const checkPaymentStatus = async () => {
      try {
        const response = await fetch(`/api/stripe/check-payment-method?accountId=${accountId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.verified) {
            setPaymentCompleted(true);
            setPaymentSectionOpen(false);
            setReviewSectionOpen(true);
          }
        }
      } catch (error) {
        console.error('Failed to check payment status:', error);
      }
    };

    checkPaymentStatus();
  }, [router]);

  const handleDeploy = () => {
    if (!config.voice) {
      toast.error(t('common:setup.review.voiceMissing'));
      return;
    }

    startTransition(async () => {
      try {
        // Charge the $5 activation fee first
        const chargeResponse = await fetch('/api/stripe/charge-activation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({}),
        });

        if (!chargeResponse.ok) {
          let errorMsg = 'Failed to process activation fee';
          try {
            const chargeResult = await chargeResponse.json();
            errorMsg = chargeResult.error || errorMsg;
          } catch {
            // Response wasn't JSON
          }
          toast.error(errorMsg);
          return;
        }

        // Backend will automatically use an existing Twilio number
        const result = await deployReceptionistAction({
          voice: config.voice,
          files: config.files || [],
          knowledgeBaseConfig: config.knowledgeBaseConfig,
        });

        if (result.success) {
          toast.success(t('common:setup.review.deploySuccess'));
          
          // Clear session storage
          sessionStorage.removeItem('selectedVoice');
          sessionStorage.removeItem('knowledgeBaseFiles');
          sessionStorage.removeItem('knowledgeBaseConfig');
          sessionStorage.removeItem('accountId');
          sessionStorage.removeItem('businessName');

          // Redirect to AI Agent dashboard with deployed flag
          router.push('/home/agent?deployed=true');
          return;
        } else {
          toast.error(result.error || t('common:setup.review.deployError'));
        }
      } catch (error) {
        toast.error(t('common:setup.review.deployErrorGeneric'));
        console.error(error);
      }
    });
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
          <Trans i18nKey="common:setup.review.title" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <Trans i18nKey="common:setup.review.description" />
        </p>
      </div>

      {/* Progress Steps - Compact */}
      <div className="mb-6 flex-shrink-0">
        <Stepper
          steps={steps}
          currentStep={4}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Scrollable Content Area with Fade */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* Payment Section - Shows First, Collapses After Completion */}
          <Collapsible 
            open={paymentSectionOpen} 
            onOpenChange={setPaymentSectionOpen}
          >
            <Card className={paymentCompleted ? 'border-green-200 bg-green-50/50' : ''}>
              <CardHeader className="pb-3">
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:opacity-80 transition-opacity">
                  <div className="text-left">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {paymentCompleted && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      <Trans i18nKey="common:setup.review.paymentStep" defaults="Step 1: Payment Information" />
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {paymentCompleted 
                        ? (t('common:setup.review.paymentAdded') || 'Payment method added successfully')
                        : (t('common:setup.review.addPaymentMethod') || 'Add your payment method to continue')}
                    </CardDescription>
                  </div>
                  {paymentSectionOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <SetupPaymentForm
                    onPaymentComplete={() => {
                      setPaymentCompleted(true);
                      setPaymentSectionOpen(false);
                      setReviewSectionOpen(true);
                    }}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Review Section - Expands After Payment */}
          <Collapsible 
            open={reviewSectionOpen} 
            onOpenChange={setReviewSectionOpen}
          >
            <Card>
              <CardHeader className="pb-3">
                <CollapsibleTrigger 
                  className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
                  disabled={!paymentCompleted}
                >
                  <div className="text-left">
                    <CardTitle className="text-lg">
                      <Trans i18nKey="common:setup.review.reviewStep" defaults="Step 2: Review & Launch" />
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {paymentCompleted 
                        ? (t('common:setup.review.reviewBeforeLaunch') || 'Review your configuration before going live')
                        : (t('common:setup.review.completePayment') || 'Complete payment to continue')}
                    </CardDescription>
                  </div>
                  {reviewSectionOpen ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  {/* Voice */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">
                        <Trans i18nKey="common:setup.review.voiceAssistant" />
                      </h3>
                    </div>
                    {config.voice ? (
                      <Card className="bg-muted/50">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm">{config.voice.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {config.voice.gender} • {config.voice.accent} • {config.voice.provider}
                              </p>
                              <p className="text-xs mt-1">{config.voice.description}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/home/agent/setup`)}
                            >
                              <Trans i18nKey="common:setup.review.change" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <Trans i18nKey="common:setup.review.noVoice" />
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Separator />

                  {/* Knowledge Base */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">
                        <Trans i18nKey="common:setup.review.knowledgeBase" />
                      </h3>
                    </div>
                    {config.files && config.files.length > 0 ? (
                      <Card className="bg-muted/50">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium">
                              {config.files.length} {t('common:setup.review.filesUploaded')}
                              {config.knowledgeBaseConfig && (
                                <span className="text-muted-foreground ml-1">
                                  across {Object.keys(config.knowledgeBaseConfig).filter((k) => (config.knowledgeBaseConfig![k]?.length || 0) > 0).length} categories
                                </span>
                              )}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push('/home/agent/setup/knowledge')}
                            >
                              <Trans i18nKey="common:setup.review.edit" />
                            </Button>
                          </div>
                          {config.knowledgeBaseConfig ? (
                            <div className="space-y-1">
                              {Object.entries(config.knowledgeBaseConfig)
                                .filter(([, ids]) => ids && ids.length > 0)
                                .map(([catId, ids]) => {
                                  const catLabels: Record<string, string> = {
                                    'clinic-info': 'Clinic Info',
                                    services: 'Services',
                                    insurance: 'Insurance',
                                    providers: 'Providers',
                                    policies: 'Policies',
                                    faqs: 'FAQs',
                                  };
                                  return (
                                    <div key={catId} className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                      <span>{catLabels[catId] || catId}: {ids.length} file{ids.length !== 1 ? 's' : ''}</span>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {config.files.slice(0, 3).map((file: any) => (
                                <p key={file.id} className="text-xs text-muted-foreground">
                                  • {file.name}
                                </p>
                              ))}
                              {config.files.length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  • {t('common:setup.review.andMore', { count: config.files.length - 3 })}
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="bg-muted/50">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            <Trans i18nKey="common:setup.review.noFiles" />
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <Separator />

                  {/* Integrations */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">
                        <Trans i18nKey="common:setup.review.integrations" />
                      </h3>
                    </div>
                    {(integrations.googleCalendar || integrations.pms) ? (
                      <Card className="bg-muted/50">
                        <CardContent className="p-3 space-y-2">
                          {integrations.googleCalendar && (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                              <p className="text-xs font-medium">Google Calendar connected</p>
                            </div>
                          )}
                          {integrations.pms && (
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                              <p className="text-xs font-medium">
                                PMS connected{integrations.pmsProvider ? ` (${integrations.pmsProvider})` : ''}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="bg-muted/50">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            <Trans i18nKey="common:setup.review.noIntegrations" />
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <div className="rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    <strong className="text-foreground"><Trans i18nKey="common:setup.review.readyToLaunch" /></strong>{' '}
                    <Trans i18nKey="common:setup.review.readyToLaunchDesc" />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

        </div>
        {/* Fade effect at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Navigation - Fixed at bottom */}
      <div className="pt-4 border-t border-border/40 flex-shrink-0 bg-background">
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/home/agent/setup/phone`)}
            disabled={pending}
          >
            <Trans i18nKey="common:setup.navigation.back" />
          </Button>
          <Button
            onClick={handleDeploy}
            disabled={pending || !config.voice || !paymentCompleted}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {paymentCompleted ? t('common:setup.review.deployButton') : t('common:setup.review.completePaymentToDeploy')}
          </Button>
        </div>
      </div>
    </div>
  );
}
