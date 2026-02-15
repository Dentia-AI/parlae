'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Switch } from '@kit/ui/switch';
import { Alert, AlertDescription } from '@kit/ui/alert';
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
  name: string;
  description: string;
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
    name: 'AI Receptionist',
    description: 'Your AI-powered phone receptionist answers calls, books appointments, and handles patient inquiries 24/7.',
    icon: Bot,
    enabled: true,
    available: true,
    category: 'core',
  },
  {
    id: 'call-logging',
    name: 'Call Logging & Analytics',
    description: 'Track all incoming calls, view transcripts, and monitor AI performance with detailed analytics.',
    icon: Phone,
    enabled: true,
    available: true,
    category: 'core',
  },
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    description: 'Upload documents to train your AI on your services, policies, and FAQs.',
    icon: Brain,
    enabled: true,
    available: true,
    category: 'core',
  },

  // Communication
  {
    id: 'sms-confirmations',
    name: 'SMS Confirmations',
    description: 'Send SMS appointment confirmations and reminders to patients via Twilio.',
    icon: MessageSquare,
    enabled: true,
    available: true,
    category: 'communication',
  },
  {
    id: 'email-confirmations',
    name: 'Email Confirmations',
    description: 'Send branded email confirmations for appointments, cancellations, and reschedules.',
    icon: MessageSquare,
    enabled: true,
    available: true,
    category: 'communication',
  },
  {
    id: 'outbound-calls',
    name: 'Outbound Calls',
    description: 'Proactively reach out to patients for appointment reminders, follow-ups, and recall campaigns.',
    icon: PhoneOutgoing,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'communication',
  },

  // Integrations
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync appointments with Google Calendar for real-time availability and booking.',
    icon: Calendar,
    enabled: true,
    available: true,
    category: 'integration',
  },
  {
    id: 'pms-integration',
    name: 'PMS Integration',
    description: 'Connect your Practice Management System for seamless patient and appointment management.',
    icon: Zap,
    enabled: true,
    available: true,
    category: 'integration',
  },

  // Advanced
  {
    id: 'insurance-verification',
    name: 'Insurance Verification',
    description: 'Automatically verify patient insurance eligibility and benefits before appointments.',
    icon: Shield,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'advanced',
  },
  {
    id: 'payment-collection',
    name: 'Payment Collection',
    description: 'Collect patient payments and co-pays over the phone or via SMS payment links.',
    icon: CreditCard,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'advanced',
  },
  {
    id: 'lead-management',
    name: 'Lead Management',
    description: 'Capture and manage new patient leads from calls, track conversion rates, and automate follow-ups.',
    icon: Users,
    enabled: false,
    available: false,
    comingSoon: true,
    category: 'advanced',
  },
];

const categoryLabels: Record<string, { label: string; description: string }> = {
  core: {
    label: 'Core Features',
    description: 'Essential AI receptionist capabilities',
  },
  communication: {
    label: 'Communication',
    description: 'Patient notifications and outreach',
  },
  integration: {
    label: 'Integrations',
    description: 'Connect with external services',
  },
  advanced: {
    label: 'Advanced',
    description: 'Coming soon - advanced capabilities',
  },
};

export default function FeaturesPage() {
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
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Master Control Header */}
      <Card className={aiReceptionistEnabled ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30'}>
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
              <h1 className="text-xl font-bold tracking-tight">AI Receptionist</h1>
              <Badge
                variant="outline"
                className={aiReceptionistEnabled
                  ? 'text-green-600 border-green-300 bg-green-100 dark:bg-green-900 dark:text-green-400 dark:border-green-700'
                  : 'text-red-600 border-red-300 bg-red-100 dark:bg-red-900 dark:text-red-400 dark:border-red-700'
                }
              >
                {aiReceptionistEnabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {aiReceptionistEnabled
                ? `Your AI receptionist is live. ${enabledCount} features enabled.`
                : 'Your AI receptionist is turned off. Enable it to start answering calls.'}
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
        <h2 className="text-lg font-semibold">Feature Controls</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Toggle individual features on or off. Changes take effect immediately.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Core features are enabled by default. Toggle optional features based on your needs. 
          Features marked "Coming Soon" are in development.
        </AlertDescription>
      </Alert>

      {categories.map((category) => {
        // Filter out the master AI Receptionist toggle from the category list
        const categoryFeatures = features.filter(
          (f) => f.category === category && f.id !== 'ai-receptionist',
        );
        if (categoryFeatures.length === 0) return null;
        const { label, description } = categoryLabels[category]!;

        return (
          <div key={category}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{label}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <div className="grid gap-3">
              {categoryFeatures.map((feature) => (
                <Card
                  key={feature.id}
                  className={
                    feature.comingSoon
                      ? 'opacity-60'
                      : feature.enabled
                        ? 'border-primary/20 bg-primary/[0.02]'
                        : ''
                  }
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
                        <p className="text-sm font-medium">{feature.name}</p>
                        {feature.comingSoon && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {feature.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {feature.enabled && feature.available && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                          Active
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
