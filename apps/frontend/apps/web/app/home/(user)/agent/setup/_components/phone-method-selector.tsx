'use client';

import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import {
  PhoneForwarded,
  PhoneCall,
  Network,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Trans } from '@kit/ui/trans';
import { useTranslation } from 'react-i18next';

type IntegrationMethod = 'ported' | 'forwarded' | 'sip';

interface PhoneMethodSelectorProps {
  accountId: string;
  businessName: string;
  onMethodSelected: (method: IntegrationMethod) => void;
}

export function PhoneMethodSelector({
  accountId,
  businessName,
  onMethodSelected,
}: PhoneMethodSelectorProps) {
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] =
    useState<IntegrationMethod | null>(null);

  const methods = [
    {
      id: 'forwarded' as const,
      name: t('common:setup.phone.forwarded.name'),
      icon: PhoneForwarded,
      setupTime: t('common:setup.phone.forwarded.setupTime'),
      difficulty: t('common:setup.phone.forwarded.difficulty'),
      quality: t('common:setup.phone.forwarded.quality'),
      description: t('common:setup.phone.forwarded.description'),
      pros: [
        t('common:setup.phone.forwarded.pros.0'),
        t('common:setup.phone.forwarded.pros.1'),
        t('common:setup.phone.forwarded.pros.2'),
        t('common:setup.phone.forwarded.pros.3'),
        t('common:setup.phone.forwarded.pros.4'),
      ],
      cons: [
        t('common:setup.phone.forwarded.cons.0'),
        t('common:setup.phone.forwarded.cons.1'),
      ],
      bestFor: t('common:setup.phone.forwarded.bestFor'),
    },
    {
      id: 'sip' as const,
      name: t('common:setup.phone.sip.name'),
      icon: Network,
      setupTime: t('common:setup.phone.sip.setupTime'),
      difficulty: t('common:setup.phone.sip.difficulty'),
      quality: t('common:setup.phone.sip.quality'),
      description: t('common:setup.phone.sip.description'),
      pros: [
        t('common:setup.phone.sip.pros.0'),
        t('common:setup.phone.sip.pros.1'),
        t('common:setup.phone.sip.pros.2'),
        t('common:setup.phone.sip.pros.3'),
      ],
      cons: [
        t('common:setup.phone.sip.cons.0'),
        t('common:setup.phone.sip.cons.1'),
        t('common:setup.phone.sip.cons.2'),
      ],
      bestFor: t('common:setup.phone.sip.bestFor'),
    },
    {
      id: 'ported' as const,
      name: t('common:setup.phone.ported.name'),
      icon: PhoneCall,
      setupTime: t('common:setup.phone.ported.setupTime'),
      difficulty: t('common:setup.phone.ported.difficulty'),
      quality: t('common:setup.phone.ported.quality'),
      description: t('common:setup.phone.ported.description'),
      pros: [
        t('common:setup.phone.ported.pros.0'),
        t('common:setup.phone.ported.pros.1'),
        t('common:setup.phone.ported.pros.2'),
        t('common:setup.phone.ported.pros.3'),
      ],
      cons: [
        t('common:setup.phone.ported.cons.0'),
        t('common:setup.phone.ported.cons.1'),
        t('common:setup.phone.ported.cons.2'),
      ],
      bestFor: t('common:setup.phone.ported.bestFor'),
    },
  ];

  const handleMethodClick = (methodId: IntegrationMethod) => {
    setSelectedMethod(methodId);
    onMethodSelected(methodId);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      <RadioGroup
        value={selectedMethod || ''}
        onValueChange={(value) => {
          const method = value as IntegrationMethod;
          setSelectedMethod(method);
          onMethodSelected(method);
        }}
      >
        <div className="space-y-3">
          {methods.map((method, index) => {
            const Icon = method.icon;
            const isSelected = selectedMethod === method.id;

            return (
              <div
                key={method.id}
                className={`group rounded-xl transition-all duration-200 cursor-pointer
                  ${
                    isSelected
                      ? 'bg-primary/[0.04] ring-1 ring-primary/50 shadow-sm'
                      : 'bg-card ring-1 ring-border/40 hover:ring-border/70 hover:shadow-sm'
                  }`}
                style={{ animationDelay: `${index * 60}ms` }}
                onClick={() => handleMethodClick(method.id)}
              >
                {/* Header */}
                <div className="p-4 pb-2">
                  <div className="flex items-start gap-2.5">
                    <RadioGroupItem
                      value={method.id}
                      id={method.id}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                        <Label
                          htmlFor={method.id}
                          className="text-sm font-semibold cursor-pointer"
                        >
                          {method.name}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {method.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="px-4 pb-4 space-y-3">
                  {/* Stats row */}
                  <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        <Trans i18nKey="common:setup.phone.setup" />
                      </span>
                      <span className="font-medium">{method.setupTime}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">
                        <Trans i18nKey="common:setup.phone.quality" />
                      </span>
                      <span className="font-medium">{method.quality}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">
                        <Trans i18nKey="common:setup.phone.difficulty" />
                      </span>
                      <span className="font-medium">{method.difficulty}</span>
                    </div>
                  </div>

                  {/* Pros & Cons */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <Trans i18nKey="common:setup.phone.pros" />
                      </div>
                      <ul className="space-y-0.5">
                        {method.pros.map((pro, idx) => (
                          <li
                            key={idx}
                            className="text-muted-foreground flex items-start gap-1.5"
                          >
                            <span className="text-green-500 mt-0.5 text-[10px]">
                              ●
                            </span>
                            {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        <Trans i18nKey="common:setup.phone.cons" />
                      </div>
                      <ul className="space-y-0.5">
                        {method.cons.map((con, idx) => (
                          <li
                            key={idx}
                            className="text-muted-foreground flex items-start gap-1.5"
                          >
                            <span className="text-orange-500 mt-0.5 text-[10px]">
                              ●
                            </span>
                            {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Best For */}
                  <div className="flex items-start gap-2 px-3 py-2 bg-muted/30 rounded-lg">
                    <Info className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-medium">
                        <Trans i18nKey="common:setup.phone.bestFor" />
                      </span>{' '}
                      <span className="text-xs text-muted-foreground">
                        {method.bestFor}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </RadioGroup>
    </div>
  );
}
