'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Switch } from '@kit/ui/switch';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import {
  PhoneIncoming,
  Calendar,
  Shield,
  CreditCard,
  MessageSquare,
  Users,
  Zap,
  Power,
  Heart,
  DollarSign,
  Mail,
  Megaphone,
  CheckCircle2,
} from 'lucide-react';

interface Feature {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: React.ElementType;
  enabled: boolean;
  available: boolean;
  comingSoon?: boolean;
  category: 'inbound' | 'outbound' | 'communication' | 'integration' | 'advanced';
  children?: Feature[];
}

const defaultFeatures: Feature[] = [
  {
    id: 'inbound-calls',
    nameKey: 'features.inboundCalls.name',
    descriptionKey: 'features.inboundCalls.description',
    icon: PhoneIncoming,
    enabled: true,
    available: true,
    category: 'inbound',
  },
  {
    id: 'appointment-scheduling',
    nameKey: 'features.appointmentScheduling.name',
    descriptionKey: 'features.appointmentScheduling.description',
    icon: Calendar,
    enabled: true,
    available: true,
    category: 'inbound',
  },

  {
    id: 'outbound-calls',
    nameKey: 'features.outboundCalls.name',
    descriptionKey: 'features.outboundCalls.description',
    icon: Megaphone,
    enabled: true,
    available: true,
    category: 'outbound',
    children: [
      {
        id: 'outbound-patient-care',
        nameKey: 'features.outboundPatientCare.name',
        descriptionKey: 'features.outboundPatientCare.description',
        icon: Heart,
        enabled: true,
        available: true,
        category: 'outbound',
      },
      {
        id: 'outbound-financial',
        nameKey: 'features.outboundFinancial.name',
        descriptionKey: 'features.outboundFinancial.description',
        icon: DollarSign,
        enabled: true,
        available: true,
        category: 'outbound',
      },
      {
        id: 'outbound-auto-approve',
        nameKey: 'features.outboundAutoApprove.name',
        descriptionKey: 'features.outboundAutoApprove.description',
        icon: CheckCircle2,
        enabled: false,
        available: true,
        category: 'outbound',
      },
    ],
  },

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
    icon: Mail,
    enabled: true,
    available: true,
    category: 'communication',
  },

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
  inbound: {
    labelKey: 'features.categories.inbound',
    descriptionKey: 'features.categories.inboundDesc',
  },
  outbound: {
    labelKey: 'features.categories.outbound',
    descriptionKey: 'features.categories.outboundDesc',
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
  const getCsrfToken = useCsrfToken;
  const [features, setFeatures] = useState(defaultFeatures);
  const [saving, setSaving] = useState(false);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/features')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.featureSettings) return;
        const settings = data.featureSettings as Record<string, boolean>;

        if (settings['ai-receptionist'] !== undefined) {
          setMasterEnabled(settings['ai-receptionist']!);
        }

        setFeatures((prev) =>
          prev.map((f) => {
            const updated = { ...f };
            if (settings[f.id] !== undefined) updated.enabled = settings[f.id]!;
            if (f.children) {
              updated.children = f.children.map((c) => ({
                ...c,
                enabled: settings[c.id] !== undefined ? settings[c.id]! : c.enabled,
              }));
            }
            return updated;
          }),
        );
      })
      .catch(() => {});
  }, []);

  const persistSettings = useCallback(
    async (updatedFeatures: Feature[], master: boolean) => {
      setSaving(true);
      try {
        const featureSettings: Record<string, boolean> = {
          'ai-receptionist': master,
        };
        for (const f of updatedFeatures) {
          featureSettings[f.id] = f.enabled;
          if (f.children) {
            for (const c of f.children) {
              featureSettings[c.id] = c.enabled;
            }
          }
        }
        const res = await fetch('/api/features', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          body: JSON.stringify({ featureSettings }),
        });
        if (!res.ok) throw new Error('Failed to save');
        toast.success(t('common:features.saved'));
      } catch {
        toast.error(t('common:features.saveFailed'));
      } finally {
        setSaving(false);
      }
    },
    [t, getCsrfToken],
  );

  const toggleMaster = (enable: boolean) => {
    if (!enable) {
      setShowDisableDialog(true);
      return;
    }
    setMasterEnabled(true);
    persistSettings(features, true);
  };

  const confirmDisableMaster = () => {
    setMasterEnabled(false);
    setShowDisableDialog(false);
    persistSettings(features, false);
  };

  const requestToggle = (featureId: string, featureName: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      setPendingToggle({ id: featureId, name: featureName });
      return;
    }
    applyToggle(featureId);
  };

  const applyToggle = (featureId: string) => {
    let updated: Feature[] = [];
    setFeatures((prev) => {
      updated = prev.map((f) => {
        if (f.id === featureId && f.available) {
          const newEnabled = !f.enabled;
          const newChildren = !newEnabled && f.children
            ? f.children.map((c) => ({ ...c, enabled: false }))
            : f.children;
          return { ...f, enabled: newEnabled, children: newChildren };
        }
        if (f.children) {
          const updatedChildren = f.children.map((c) =>
            c.id === featureId && c.available ? { ...c, enabled: !c.enabled } : c,
          );
          const anyChildEnabled = updatedChildren.some((c) => c.enabled);
          return {
            ...f,
            children: updatedChildren,
            enabled: anyChildEnabled ? true : f.enabled,
          };
        }
        return f;
      });
      return updated;
    });
    persistSettings(updated, masterEnabled);
  };

  const confirmToggleOff = () => {
    if (pendingToggle) {
      applyToggle(pendingToggle.id);
      setPendingToggle(null);
    }
  };

  const enabledCount = features.reduce((count, f) => {
    let c = f.enabled ? 1 : 0;
    if (f.children) c += f.children.filter((ch) => ch.enabled).length;
    return count + c;
  }, 0);

  const categories = ['inbound', 'outbound', 'communication', 'integration'];

  return (
    <div className="container max-w-4xl py-8 space-y-6 mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Master Control */}
      <Card className={masterEnabled ? 'bg-green-50/50 dark:bg-green-950/30 border-green-200 dark:border-green-900' : 'bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-900'}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0 ${
            masterEnabled
              ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
          }`}>
            <Power className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{t('common:features.title')}</h1>
              <Badge
                variant="outline"
                className={masterEnabled
                  ? 'text-green-600 border-green-300 bg-green-100 dark:bg-green-900 dark:text-green-400 dark:border-green-700'
                  : 'text-red-600 border-red-300 bg-red-100 dark:bg-red-900 dark:text-red-400 dark:border-red-700'
                }
              >
                {masterEnabled ? t('common:features.active') : t('common:features.inactive')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {masterEnabled
                ? t('common:features.liveMessage', { count: enabledCount })
                : t('common:features.offMessage')}
            </p>
          </div>
          <Switch
            checked={masterEnabled}
            onCheckedChange={toggleMaster}
            className="scale-125"
          />
        </CardContent>
      </Card>

      {/* Master disable confirmation */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common:features.disableDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('common:features.disableDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisableMaster}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:features.disableDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feature toggle-off confirmation */}
      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('common:features.toggleOffDialog.title', { feature: pendingToggle?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('common:features.toggleOffDialog.description', { feature: pendingToggle?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleOff}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:features.toggleOffDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feature Controls */}
      <div>
        <h2 className="text-lg font-semibold">{t('common:features.featureControls')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('common:features.featureControlsDesc')}
        </p>
      </div>

      {categories.map((category) => {
        const topLevelFeatures = features.filter((f) => f.category === category);
        if (topLevelFeatures.length === 0) return null;
        const { labelKey, descriptionKey } = categoryKeys[category]!;

        return (
          <div key={category}>
            <div className="mb-3">
              <h3 className="text-base font-semibold">{t(`common:${labelKey}`)}</h3>
              <p className="text-xs text-muted-foreground">{t(`common:${descriptionKey}`)}</p>
            </div>

            <div className="grid gap-3">
              {topLevelFeatures.map((feature) => (
                <div key={feature.id}>
                  <FeatureCard
                    feature={feature}
                    onToggle={requestToggle}
                    masterEnabled={masterEnabled}
                    t={t}
                  />
                  {feature.children && feature.enabled && (
                    <div className="ml-6 mt-2 grid gap-2 border-l-2 border-muted pl-4">
                      {feature.children.map((child) => (
                        <FeatureCard
                          key={child.id}
                          feature={child}
                          onToggle={requestToggle}
                          masterEnabled={masterEnabled}
                          t={t}
                          isChild
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Capabilities note */}
      <div className="rounded-xl bg-muted/30 px-4 py-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t('common:features.capabilitiesTitle')}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('common:features.capabilitiesNote')}
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  feature,
  onToggle,
  masterEnabled,
  t,
  isChild,
}: {
  feature: Feature;
  onToggle: (id: string, name: string, currentlyEnabled: boolean) => void;
  masterEnabled: boolean;
  t: (key: string, opts?: Record<string, string>) => string;
  isChild?: boolean;
}) {
  const disabled = !feature.available || !masterEnabled;
  const isActive = feature.enabled && !disabled;

  return (
    <Card
      className={`transition-all duration-200 ${
        feature.comingSoon
          ? 'opacity-50'
          : isActive
            ? 'bg-primary/[0.02] border-primary/20'
            : ''
      } ${!masterEnabled ? 'opacity-60' : ''}`}
    >
      <CardContent className={`flex items-center gap-4 ${isChild ? 'p-3' : 'p-4'}`}>
        <div
          className={`flex ${isChild ? 'h-8 w-8' : 'h-10 w-10'} items-center justify-center rounded-lg flex-shrink-0 ${
            isActive
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <feature.icon className={isChild ? 'h-4 w-4' : 'h-5 w-5'} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`${isChild ? 'text-xs' : 'text-sm'} font-medium`}>
              {t(`common:${feature.nameKey}`)}
            </p>
            {feature.comingSoon && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {t('common:features.comingSoon')}
              </Badge>
            )}
          </div>
          <p className={`${isChild ? 'text-[11px]' : 'text-xs'} text-muted-foreground mt-0.5 line-clamp-1`}>
            {t(`common:${feature.descriptionKey}`)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isActive && !isChild && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
              {t('common:features.active')}
            </Badge>
          )}
          <Switch
            checked={feature.enabled}
            onCheckedChange={() =>
              onToggle(feature.id, t(`common:${feature.nameKey}`), feature.enabled)
            }
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
