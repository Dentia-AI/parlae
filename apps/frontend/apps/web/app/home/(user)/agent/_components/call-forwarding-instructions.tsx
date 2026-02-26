'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import {
  PhoneForwarded,
  Info,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';
import { formatPhoneDisplay } from '~/lib/format-phone';

interface CallForwardingInstructionsProps {
  twilioNumber: string;
  clinicNumber?: string;
  defaultExpanded?: boolean;
  variant?: 'card' | 'inline';
}

export function CallForwardingInstructions({
  twilioNumber,
  clinicNumber,
  defaultExpanded = false,
  variant = 'card',
}: CallForwardingInstructionsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const displayNumber = formatPhoneDisplay(twilioNumber);
  const displayClinic = clinicNumber ? formatPhoneDisplay(clinicNumber) : undefined;

  const copyNumber = () => {
    navigator.clipboard.writeText(twilioNumber);
    setCopied(true);
    toast.success(t('callForwarding.numberCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const content = (
    <div className="space-y-5 text-sm">
      {/* Number to forward to */}
      <div className="rounded-xl bg-primary/[0.06] ring-1 ring-primary/20 p-4">
        <div className="text-xs text-muted-foreground mb-1">{t('callForwarding.forwardTo')}</div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold font-mono tracking-tight">{displayNumber}</span>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={copyNumber}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {displayClinic && (
          <div className="text-xs text-muted-foreground mt-1.5">
            {t('callForwarding.fromClinic')} <span className="font-mono font-medium text-foreground">{displayClinic}</span>
          </div>
        )}
      </div>

      {/* Quick steps */}
      <div className="rounded-xl bg-muted/60 p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{t('callForwarding.quickSteps')}</span>
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          <li>{t('callForwarding.step1')}</li>
          <li>
            {t('callForwarding.step2')}{' '}
            <strong className="font-mono text-foreground">{displayNumber}</strong>
          </li>
          <li>{t('callForwarding.step3')}</li>
          <li>{t('callForwarding.step4')}</li>
        </ol>
      </div>

      {/* Recommended setup */}
      <div className="rounded-xl ring-1 ring-primary/20 bg-primary/[0.03] p-4">
        <h4 className="font-semibold mb-1.5 text-sm">
          {t('callForwarding.recommendedTitle')}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('callForwarding.recommendedDesc')}
        </p>
      </div>

      {/* Canadian carriers */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          {t('callForwarding.canadianCarriers')}
        </h4>
        <div className="space-y-2">
          <CarrierCode
            label={t('callForwarding.noAnswerForwarding')}
            desc={t('callForwarding.noAnswerDesc')}
            activate={`*92 + ${twilioNumber}`}
            disable="*93"
            recommendedLabel={t('callForwarding.recommended')}
            recommended
          />
          <CarrierCode
            label={t('callForwarding.busyForwarding')}
            desc={t('callForwarding.busyDesc')}
            activate={`*90 + ${twilioNumber}`}
            disable="*91"
            recommendedLabel={t('callForwarding.recommended')}
            recommended
          />
          <CarrierCode
            label={t('callForwarding.allCalls')}
            desc={t('callForwarding.allCallsDesc')}
            activate={`*72 + ${twilioNumber}`}
            disable="*73"
            recommendedLabel={t('callForwarding.recommended')}
          />
        </div>
      </div>

      {/* US carriers */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          {t('callForwarding.usCarriers')}
        </h4>
        <div className="space-y-2">
          <CarrierCode
            label={t('callForwarding.noAnswerForwarding')}
            activate={`*61*${twilioNumber}#`}
            disable="#61#"
            recommendedLabel={t('callForwarding.recommended')}
            recommended
          />
          <CarrierCode
            label={t('callForwarding.busyForwarding')}
            activate={`*67*${twilioNumber}#`}
            disable="#67#"
            recommendedLabel={t('callForwarding.recommended')}
            recommended
          />
          <CarrierCode
            label={t('callForwarding.allCalls')}
            activate={`*21*${twilioNumber}#`}
            disable="#21#"
            recommendedLabel={t('callForwarding.recommended')}
          />
        </div>
      </div>

      {/* VoIP */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          {t('callForwarding.voipSystems')}
        </h4>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
          <li>{t('callForwarding.voipStep1')}</li>
          <li>{t('callForwarding.voipStep2')}</li>
          <li>{t('callForwarding.voipStep3', { number: twilioNumber })}</li>
          <li>{t('callForwarding.voipStep4')}</li>
          <li>{t('callForwarding.voipStep5')}</li>
        </ol>
      </div>
    </div>
  );

  if (variant === 'inline') {
    return content;
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-500/10 p-2.5">
              <PhoneForwarded className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">{t('callForwarding.title')}</CardTitle>
              <CardDescription className="text-sm">
                {t('callForwarding.description')}
              </CardDescription>
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </CardHeader>
      {expanded && <CardContent>{content}</CardContent>}
    </Card>
  );
}

function CarrierCode({
  label,
  desc,
  activate,
  disable,
  recommended,
  recommendedLabel,
}: {
  label: string;
  desc?: string;
  activate: string;
  disable: string;
  recommended?: boolean;
  recommendedLabel?: string;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${recommended ? 'bg-green-50/60 dark:bg-green-950/20 ring-1 ring-green-200/50 dark:ring-green-800/30' : 'bg-muted/40'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${recommended ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
          {label}
        </span>
        {recommended && (
          <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">
            {recommendedLabel}
          </span>
        )}
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
