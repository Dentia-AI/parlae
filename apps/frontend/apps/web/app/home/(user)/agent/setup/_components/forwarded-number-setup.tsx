'use client';

import { useState, useTransition, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Loader2,
  Phone,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  PhoneForwarded,
  Shield,
  Info,
  UserRound,
  Pencil,
  Plus,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { setupForwardedNumberAction } from '../_lib/phone-actions';

interface ForwardedNumberSetupProps {
  accountId: string;
  businessName: string;
  onBack: () => void;
  onComplete: () => void;
  onSetupStateChange?: (isComplete: boolean) => void;
}

type ForwardingType = 'all' | 'conditional';

export function ForwardedNumberSetup({
  accountId,
  businessName,
  onBack,
  onComplete,
  onSetupStateChange,
}: ForwardedNumberSetupProps) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [clinicNumber, setClinicNumber] = useState('');
  const [staffDirectNumber, setStaffDirectNumber] = useState('');
  const [forwardingType, setForwardingType] = useState<ForwardingType>('all');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [showCarrierGuide, setShowCarrierGuide] = useState(false);
  const [editingHumanLine, setEditingHumanLine] = useState(false);
  const [tempHumanLine, setTempHumanLine] = useState('');

  // Load saved state from sessionStorage on mount
  useEffect(() => {
    const savedNumber = sessionStorage.getItem('phoneNumber');
    const savedMethod = sessionStorage.getItem('phoneIntegrationMethod');
    const savedSettings = sessionStorage.getItem('phoneIntegrationSettings');
    if (savedNumber && savedMethod === 'forwarded') {
      setClinicNumber(savedNumber);
      setSetupComplete(true);
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed.staffDirectNumber) {
            setStaffDirectNumber(parsed.staffDirectNumber);
          }
          if (parsed.forwardingType) {
            setForwardingType(parsed.forwardingType);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Notify parent of setup state changes
  useEffect(() => {
    onSetupStateChange?.(setupComplete);
  }, [setupComplete, onSetupStateChange]);

  const provisionTwilioNumber = () => {
    setIsProvisioning(true);

    startTransition(async () => {
      try {
        const result = await setupForwardedNumberAction({
          accountId,
          clinicNumber,
          staffDirectNumber: staffDirectNumber || undefined,
          forwardingType,
          businessName,
        });

        if (result.success) {
          setSetupComplete(true);
          sessionStorage.setItem('phoneIntegrationMethod', 'forwarded');
          sessionStorage.setItem('phoneNumber', clinicNumber);
          sessionStorage.setItem(
            'phoneIntegrationSettings',
            JSON.stringify({
              clinicNumber,
              staffDirectNumber: staffDirectNumber || undefined,
              forwardingType,
            }),
          );
          toast.success(result.message || t('common:setup.phone.forwarding.configSaved'));
        } else {
          toast.error(result.error || t('common:setup.phone.forwarding.saveConfig'));
        }
      } catch (error) {
        toast.error(t('common:setup.phone.forwarding.saveConfig'));
        console.error(error);
      } finally {
        setIsProvisioning(false);
      }
    });
  };

  const handleComplete = () => {
    if (!setupComplete) {
      toast.error(t('common:setup.phone.forwarding.saveConfig'));
      return;
    }
    onComplete();
  };

  const saveHumanLine = () => {
    setStaffDirectNumber(tempHumanLine);
    setEditingHumanLine(false);

    // Update sessionStorage
    const savedSettings = sessionStorage.getItem('phoneIntegrationSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        parsed.staffDirectNumber = tempHumanLine || undefined;
        sessionStorage.setItem(
          'phoneIntegrationSettings',
          JSON.stringify(parsed),
        );
      } catch {
        // ignore
      }
    }

    // Also save to backend
    startTransition(async () => {
      try {
        await setupForwardedNumberAction({
          accountId,
          clinicNumber,
          staffDirectNumber: tempHumanLine || undefined,
          forwardingType,
          businessName,
        });
        toast.success(
          tempHumanLine
            ? t('common:setup.phone.forwarding.save')
            : t('common:setup.phone.forwarding.save'),
        );
      } catch {
        toast.error(t('common:setup.phone.forwarding.saveConfig'));
      }
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header info */}
      <div className="rounded-xl bg-muted/40 p-4 flex items-start gap-3">
        <PhoneForwarded className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">{t('common:setup.phone.forwarding.headerTitle')}</strong>{' '}
          {t('common:setup.phone.forwarding.headerDesc')}
        </div>
      </div>

      {/* Step 1: Enter Clinic Number */}
      {!setupComplete && (
        <div className="space-y-5 animate-in slide-in-from-bottom-2 fade-in duration-300">
          {/* Main clinic number */}
          <div className="space-y-2">
            <Label htmlFor="clinicNumber">
              {t('common:setup.phone.forwarding.clinicNumber')}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clinicNumber"
              type="tel"
              placeholder="+1 (416) 555-1234"
              value={clinicNumber}
              onChange={(e) => setClinicNumber(e.target.value)}
              disabled={isProvisioning}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              {t('common:setup.phone.forwarding.clinicNumberHint')}
            </p>
          </div>

          {/* Forwarding type selector */}
          <div className="space-y-4">
            <Label>{t('common:setup.phone.forwarding.forwardingType')}</Label>
            <div className="grid gap-2.5">
              {/* All Calls */}
              <button
                type="button"
                onClick={() => setForwardingType('all')}
                className={`relative flex items-start gap-3 text-left rounded-xl p-4 transition-all duration-200 ${
                  forwardingType === 'all'
                    ? 'bg-primary/[0.06] ring-2 ring-primary shadow-sm'
                    : 'bg-muted/20 ring-1 ring-border/40 hover:ring-border/70 hover:bg-muted/30'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    forwardingType === 'all'
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  }`}
                >
                  {forwardingType === 'all' && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <PhoneForwarded
                      className={`h-4 w-4 ${forwardingType === 'all' ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span className="font-medium text-sm">
                      {t('common:setup.phone.forwarding.forwardAll')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {t('common:setup.phone.forwarding.forwardAllDesc')}
                  </p>
                </div>
              </button>

              {/* Conditional */}
              <button
                type="button"
                onClick={() => setForwardingType('conditional')}
                className={`relative flex items-start gap-3 text-left rounded-xl p-4 transition-all duration-200 ${
                  forwardingType === 'conditional'
                    ? 'bg-primary/[0.06] ring-2 ring-primary shadow-sm'
                    : 'bg-muted/20 ring-1 ring-border/40 hover:ring-border/70 hover:bg-muted/30'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    forwardingType === 'conditional'
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  }`}
                >
                  {forwardingType === 'conditional' && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Phone
                      className={`h-4 w-4 ${forwardingType === 'conditional' ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span className="font-medium text-sm">
                      {t('common:setup.phone.forwarding.noAnswer')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {t('common:setup.phone.forwarding.noAnswerDesc')}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Human line */}
          <div className="space-y-2">
            <Label htmlFor="staffDirectNumber">
              {t('common:setup.phone.forwarding.humanLine')}{' '}
              {forwardingType === 'all' ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground text-xs font-normal">
                  {t('common:setup.phone.forwarding.optional')}
                </span>
              )}
            </Label>
            <Input
              id="staffDirectNumber"
              type="tel"
              placeholder="+1 (416) 555-5678"
              value={staffDirectNumber}
              onChange={(e) => setStaffDirectNumber(e.target.value)}
              disabled={isProvisioning}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {forwardingType === 'all' ? (
                t('common:setup.phone.forwarding.humanLineDescAll')
              ) : (
                t('common:setup.phone.forwarding.humanLineDescConditional')
              )}
            </p>
          </div>

          {forwardingType === 'all' && !staffDirectNumber && clinicNumber && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2.5">
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                {t('common:setup.phone.forwarding.humanLineRequired')}
              </p>
            </div>
          )}

          <Button
            onClick={provisionTwilioNumber}
            disabled={
              !clinicNumber ||
              isProvisioning ||
              (forwardingType === 'all' && !staffDirectNumber)
            }
            className="w-full h-11"
          >
            {isProvisioning && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t('common:setup.phone.forwarding.saveConfig')}
          </Button>
        </div>
      )}

      {/* Step 2: Configuration Saved */}
      {setupComplete && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
          {/* Success banner */}
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 p-3 flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm text-green-800 dark:text-green-200">
              <strong>{t('common:setup.phone.forwarding.configSaved')}</strong> {t('common:setup.phone.forwarding.configSavedDesc')}
            </span>
          </div>

          {/* Numbers summary */}
          <div className="rounded-xl bg-card shadow-sm ring-1 ring-border/50 overflow-hidden">
            {/* Clinic number */}
            <div className="p-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">
                  {t('common:setup.phone.forwarding.clinicMainNumber')}
                </div>
                <div className="text-xl font-semibold font-mono tracking-tight">
                  {clinicNumber}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setSetupComplete(false)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {t('common:setup.phone.forwarding.edit')}
              </Button>
            </div>

            <div className="border-t border-border/50" />

            {/* Human line section */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1.5">
                    <UserRound className="h-3 w-3" />
                    {t('common:setup.phone.forwarding.humanLine')}
                    {forwardingType === 'all' && (
                      <span className="text-destructive">*</span>
                    )}
                  </div>
                  {staffDirectNumber && !editingHumanLine ? (
                    <div className="text-lg font-semibold font-mono tracking-tight">
                      {staffDirectNumber}
                    </div>
                  ) : !editingHumanLine ? (
                    <div className="text-sm text-muted-foreground">
                      {t('common:setup.phone.forwarding.notConfigured')}
                    </div>
                  ) : null}
                </div>
                {!editingHumanLine && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setTempHumanLine(staffDirectNumber);
                      setEditingHumanLine(true);
                    }}
                  >
                    {staffDirectNumber ? (
                      <>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        {t('common:setup.phone.forwarding.edit')}
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        {t('common:setup.phone.forwarding.add')}
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Inline edit for human line */}
              {editingHumanLine && (
                <div className="mt-2 space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                  <Input
                    type="tel"
                    placeholder="+1 (416) 555-5678"
                    value={tempHumanLine}
                    onChange={(e) => setTempHumanLine(e.target.value)}
                    className="h-10"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('common:setup.phone.forwarding.humanLineInlineHint')}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveHumanLine}>
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : null}
                      {t('common:setup.phone.forwarding.save')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingHumanLine(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Nudge to add human line if missing */}
              {!staffDirectNumber && !editingHumanLine && (
                <div className="mt-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  {forwardingType === 'all' ? (
                    <>
                      <strong>{t('common:setup.phone.forwarding.requiredLabel')}</strong> {t('common:setup.phone.forwarding.requiredNudge')}
                    </>
                  ) : (
                    <>
                      <strong>{t('common:setup.phone.forwarding.recommendedLabel')}</strong> {t('common:setup.phone.forwarding.recommendedNudge')}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Next steps */}
          <div className="rounded-xl bg-blue-50/60 dark:bg-blue-950/20 p-3.5 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
              <strong>{t('common:setup.phone.forwarding.nextSteps')}</strong> {t('common:setup.phone.forwarding.nextStepsDesc')}
            </p>
          </div>

          {/* After deployment */}
          <div className="rounded-xl bg-muted/30 p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('common:setup.phone.forwarding.afterDeployment')}</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
              <li>
                {t('common:setup.phone.forwarding.step1')}
              </li>
              <li>
                {t('common:setup.phone.forwarding.step2Pre')}{' '}
                <strong className="font-mono text-foreground">
                  {clinicNumber}
                </strong>{' '}
                {t('common:setup.phone.forwarding.step2Post')}
              </li>
              <li>
                {t('common:setup.phone.forwarding.step3')}{' '}
                {staffDirectNumber
                  ? t('common:setup.phone.forwarding.step3HumanLine')
                  : t('common:setup.phone.forwarding.step3NoHumanLine')}
              </li>
            </ol>
          </div>

          {/* Carrier Setup Guide (collapsible) */}
          <div className="rounded-xl ring-1 ring-border/40 overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setShowCarrierGuide(!showCarrierGuide)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4 text-muted-foreground" />
                {t('common:setup.phone.forwarding.carrierGuide')}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  showCarrierGuide ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showCarrierGuide && (
              <div className="px-4 pb-4 space-y-4 text-sm animate-in slide-in-from-top-1 fade-in duration-200">
                <div className="border-t border-border/40 pt-4" />

                <p className="text-xs text-muted-foreground">
                  {t('common:setup.phone.forwarding.carrierGuideDesc')}
                </p>

                {/* Canadian carriers */}
                <div>
                  <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                    {t('common:setup.phone.forwarding.canadianCarriers')}
                  </h4>
                  <div className="space-y-2">
                    <CarrierCode
                      label="All Calls (Unconditional)"
                      desc="All calls go straight to AI"
                      activate="*72"
                      disable="*73"
                    />
                    <CarrierCode
                      label="No-Answer"
                      desc="Forwards after ~15-25s"
                      activate="*92"
                      disable="*93"
                      muted
                    />
                    <CarrierCode
                      label="Busy"
                      desc="Forwards when lines occupied"
                      activate="*90"
                      disable="*91"
                      muted
                    />
                  </div>
                </div>

                {/* US carriers */}
                <div>
                  <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                    {t('common:setup.phone.forwarding.usCarriers')}
                  </h4>
                  <div className="space-y-2">
                    <CarrierCode
                      label="All Calls (Unconditional)"
                      activate="*21*[number]#"
                      disable="#21#"
                    />
                    <CarrierCode
                      label="No-Answer"
                      activate="*61*[number]#"
                      disable="#61#"
                      muted
                    />
                    <CarrierCode
                      label="Busy"
                      activate="*67*[number]#"
                      disable="#67#"
                      muted
                    />
                  </div>
                </div>

                {/* VoIP */}
                <div>
                  <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                    VoIP / PBX Systems
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                    <li>Log into your VoIP admin portal</li>
                    <li>Navigate to Call Routing or Call Forwarding</li>
                    <li>Add the Twilio number as a forwarding destination</li>
                    <li>Set to forward all calls, or configure rules</li>
                    <li>Save and test with a call</li>
                  </ol>
                </div>

                {/* Landline */}
                <div>
                  <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                    Traditional Landline
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Contact your phone provider and request call forwarding to
                    the Twilio number. Most carriers support this for $3-5/month.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CarrierCode({
  label,
  desc,
  activate,
  disable,
  muted,
}: {
  label: string;
  desc?: string;
  activate: string;
  disable: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <div
        className={`text-xs font-medium ${muted ? 'text-muted-foreground' : ''}`}
      >
        {label}
      </div>
      {desc && (
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      )}
      <div className="mt-1.5 font-mono text-xs text-muted-foreground">
        On: <strong className="text-foreground">{activate}</strong>
        {'  '}Off: <strong className="text-foreground">{disable}</strong>
      </div>
    </div>
  );
}
