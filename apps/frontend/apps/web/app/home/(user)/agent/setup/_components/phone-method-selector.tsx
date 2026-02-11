'use client';

import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { RadioGroup, RadioGroupItem } from '@kit/ui/radio-group';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { 
  PhoneForwarded, 
  PhoneCall, 
  Network,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
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
  onMethodSelected 
}: PhoneMethodSelectorProps) {
  const { t } = useTranslation();
  const [selectedMethod, setSelectedMethod] = useState<IntegrationMethod | null>(null);

  const methods = [
    {
      id: 'sip' as const,
      name: t('common:setup.phone.sip.name'),
      icon: Network,
      setupTime: t('common:setup.phone.sip.setupTime'),
      difficulty: t('common:setup.phone.sip.difficulty'),
      quality: t('common:setup.phone.sip.quality'),
      recommended: true,
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
      id: 'forwarded' as const,
      name: t('common:setup.phone.forwarded.name'),
      icon: PhoneForwarded,
      setupTime: t('common:setup.phone.forwarded.setupTime'),
      difficulty: t('common:setup.phone.forwarded.difficulty'),
      quality: t('common:setup.phone.forwarded.quality'),
      recommended: false,
      description: t('common:setup.phone.forwarded.description'),
      pros: [
        t('common:setup.phone.forwarded.pros.0'),
        t('common:setup.phone.forwarded.pros.1'),
        t('common:setup.phone.forwarded.pros.2'),
        t('common:setup.phone.forwarded.pros.3'),
      ],
      cons: [
        t('common:setup.phone.forwarded.cons.0'),
        t('common:setup.phone.forwarded.cons.1'),
        t('common:setup.phone.forwarded.cons.2'),
      ],
      bestFor: t('common:setup.phone.forwarded.bestFor'),
    },
    {
      id: 'ported' as const,
      name: t('common:setup.phone.ported.name'),
      icon: PhoneCall,
      setupTime: t('common:setup.phone.ported.setupTime'),
      difficulty: t('common:setup.phone.ported.difficulty'),
      quality: t('common:setup.phone.ported.quality'),
      recommended: false,
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
    <div className="space-y-4">
      <RadioGroup 
        value={selectedMethod || ''} 
        onValueChange={(value) => {
          const method = value as IntegrationMethod;
          setSelectedMethod(method);
          onMethodSelected(method);
        }}
      >
        <div className="space-y-3">
          {methods.map((method) => {
            const Icon = method.icon;
            const isSelected = selectedMethod === method.id;

            return (
              <Card 
                key={method.id}
                className={`cursor-pointer transition-all ${
                  isSelected 
                    ? 'ring-2 ring-primary border-primary' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => handleMethodClick(method.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2 flex-1">
                      <RadioGroupItem value={method.id} id={method.id} className="mt-1" />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <Label htmlFor={method.id} className="text-base font-semibold cursor-pointer">
                            {method.name}
                          </Label>
                          {method.recommended && (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <Trans i18nKey="common:setup.phone.recommended" />
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">
                          {method.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-2">
                  {/* Stats */}
                  <div className="flex gap-3 text-xs">
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
                    <div className="space-y-1.5">
                      <div className="font-medium text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <Trans i18nKey="common:setup.phone.pros" />
                      </div>
                      <ul className="space-y-0.5">
                        {method.pros.map((pro, idx) => (
                          <li key={idx} className="text-muted-foreground flex items-start gap-1">
                            <span className="text-green-600 mt-0.5">•</span>
                            {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <div className="font-medium text-orange-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        <Trans i18nKey="common:setup.phone.cons" />
                      </div>
                      <ul className="space-y-0.5">
                        {method.cons.map((con, idx) => (
                          <li key={idx} className="text-muted-foreground flex items-start gap-1">
                            <span className="text-orange-600 mt-0.5">•</span>
                            {con}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Best For */}
                  <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                    <Info className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-medium">
                        <Trans i18nKey="common:setup.phone.bestFor" />
                      </div>
                      <div className="text-xs text-muted-foreground">{method.bestFor}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>
    </div>
  );
}
