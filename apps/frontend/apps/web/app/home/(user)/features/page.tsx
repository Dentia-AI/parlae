'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Switch } from '@kit/ui/switch';
import {
  Phone,
  PhoneOutgoing,
  Calendar,
  Shield,
  CreditCard,
  MessageSquare,
  Brain,
  Users,
  Bot,
  Zap,
  Info,
  Power,
} from 'lucide-react';

interface Feature {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: React.ElementType;
  enabled: boolean;
  available: boolean;
  comingSoon?: boolean;
  category: 'core' | 'communication' | 'integration' | 'advanced';
}

const defaultFeatures: Feature[] = [
  // Core
  {
    id: 'ai-receptionist',
    nameKey: 'features.aiReceptionist.name',
    descriptionKey: 'features.aiReceptionist.description',
    icon: Bot,
    enabled: true,
    available: true,
    category: 'core',
  },
  {
    id: 'call-logging',
    nameKey: 'features.callLogging.name',
    descriptionKey: 'features.callLogging.description',
    icon: Phone,
    enabled: true,
    available: true,
    category: 'core',
  },
  {
    id: 'knowledge-base',
    nameKey: 'features.knowledgeBase.name',
    descriptionKey: 'features.knowledgeBase.description',
    icon: Brain,
    enabled: true,
    available: true,
    category: 'core',
  },

  // Communication
  {
    id: 'sms-confirmations',
    nameKey: 'features.smsConfirmations.name',
    descriptionKey: 'features.smsConfirmations.description',
    icon: MessageSquare,
    enabled: true,
    available: true,
    category: 'communication',
  },
  {
    id: 'email-confirmations',
    nameKey: 'features.emailConfirmations.name',
    descriptionKey: 'features.emailConfirmations.description',
    icon: MessageSquare,
    enabled: true,
    available: true,
    category: 'communication',
  },
  {
    id: 'outbound-calls',
    nameKey: 'features.outboundCalls.name',
    descriptionKey: 'features.outboundCalls.description',
    icon: PhoneOutgoing,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'communication',
  },

  // Integrations
  {
    id: 'google-calendar',
    nameKey: 'features.googleCalendar.name',
    descriptionKey: 'features.googleCalendar.description',
    icon: Calendar,
    enabled: true,
    available: true,
    category: 'integration',
  },
  {
    id: 'pms-integration',
    nameKey: 'features.pmsIntegration.name',
    descriptionKey: 'features.pmsIntegration.description',
    icon: Zap,
    enabled: true,
    available: true,
    category: 'integration',
  },

  // Advanced
  {
    id: 'insurance-verification',
    nameKey: 'features.insuranceVerification.name',
    descriptionKey: 'features.insuranceVerification.description',
    icon: Shield,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'advanced',
  },
  {
    id: 'payment-collection',
    nameKey: 'features.paymentCollection.name',
    descriptionKey: 'features.paymentCollection.description',
    icon: CreditCard,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'advanced',
  },
  {
    id: 'lead-management',
    nameKey: 'features.leadManagement.name',
    descriptionKey: 'features.leadManagement.description',
    icon: Users,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'advanced',
  },
];

const categoryKeys: Record<string, { labelKey: string; descriptionKey: string }> = {
  core: {
    labelKey: 'features.categories.core',
    descriptionKey: 'features.categories.coreDesc',
  },
  communication: {
    labelKey: 'features.categories.communication',
    descriptionKey: 'features.categories.communicationDesc',
  },
  integration: {
    labelKey: 'features.categories.integration',
    descriptionKey: 'features.categories.integrationDesc',
  },
  advanced: {
    labelKey: 'features.categories.advanced',
    descriptionKey: 'features.categories.advancedDesc',
  },
};

export default function FeaturesPage() {
  const { t } = useTranslation();
  const [features, setFeatures] = useState(defaultFeatures);

  const toggleFeature = (featureId: string) => {
    setFeatures((prev) =>
      prev.map((f) =>
        f.id === featureId && f.available ? { ...f, enabled: !f.enabled } : f,
      ),
    );
    // TODO: Save to backend
  };

  const categories = ['core', 'communication', 'integration', 'advanced'];
  const enabledCount = features.filter((f) => f.enabled).length;

  // Check if the main AI receptionist is enabled
  const aiReceptionistEnabled = features.find(
    (f) => f.id === 'ai-receptionist',
  )?.enabled;

  return (
    <div className="container max-w-5xl py-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Master Control Header */}
      <Card className={aiReceptionistEnabled ? 'bg-green-50/50 dark:bg-green-950/30' : 'bg-red-50/50 dark:bg-red-950/30'}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0 ${
            aiReceptionistEnabled
              ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
          }`}>
            <Power className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{t('common:features.title')}</h1>
              <Badge
                variant="outline"
                className={aiReceptionistEnabled
                  ? 'text-green-600 border-green-300 bg-green-100 dark:bg-green-900 dark:text-green-400 dark:border-green-700'
                  : 'text-red-600 border-red-300 bg-red-100 dark:bg-red-900 dark:text-red-400 dark:border-red-700'
                }
              >
                {aiReceptionistEnabled ? t('common:features.active') : t('common:features.inactive')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {aiReceptionistEnabled
                ? t('common:features.liveMessage', { count: enabledCount })
                : t('common:features.offMessage')}
            </p>
          </div>
          <Switch
            checked={!!aiReceptionistEnabled}
            onCheckedChange={() => toggleFeature('ai-receptionist')}
            className="scale-125"
          />
        </CardContent>
      </Card>

      {/* Sub-header */}
      <div>
        <h2 className="text-lg font-semibold">{t('common:features.featureControls')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('common:features.featureControlsDesc')}
        </p>
      </div>

      <div className="rounded-xl bg-muted/30 px-4 py-3 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('common:features.infoNote')}
        </p>
      </div>

      {categories.map((category) => {
        // Filter out the master AI Receptionist toggle from the category list
        const categoryFeatures = features.filter(
          (f) => f.category === category && f.id !== 'ai-receptionist',
        );
        if (categoryFeatures.length === 0) return null;
        const { labelKey, descriptionKey } = categoryKeys[category]!;

        return (
          <div key={category}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{t(`common:${labelKey}`)}</h2>
              <p className="text-sm text-muted-foreground">{t(`common:${descriptionKey}`)}</p>
            </div>

            <div className="grid gap-3 stagger-children">
              {categoryFeatures.map((feature) => (
                <Card
                  key={feature.id}
                  className={`transition-all duration-200 ${
                    feature.comingSoon
                      ? 'opacity-60'
                      : feature.enabled
                        ? 'bg-primary/[0.02]'
                        : ''
                  }`}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
                        feature.enabled && feature.available
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <feature.icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{t(`common:${feature.nameKey}`)}</p>
                        {feature.comingSoon && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t('common:features.comingSoon')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {t(`common:${feature.descriptionKey}`)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {feature.enabled && feature.available && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                          {t('common:features.active')}
                        </Badge>
                      )}
                      <Switch
                        checked={feature.enabled}
                        onCheckedChange={() => toggleFeature(feature.id)}
                        disabled={!feature.available}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
