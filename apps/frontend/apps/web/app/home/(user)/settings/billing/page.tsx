'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Slider } from '@kit/ui/slider';


import {
  Phone,
  PhoneOutgoing,
  Bell,
  RotateCcw,
  CreditCard,
  Check,
  Minus,
  Plus,
  Sparkles,
  Info,
  Lock,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';
import { toast } from '@kit/ui/sonner';

/**
 * Parlae Billing Page
 *
 * Usage-based billing is disabled by default. When activated by a super admin,
 * the clinic sees their customized pricing. Billing = features + usage + optional install fee.
 * Super admin can set per-feature, per-clinic pricing.
 */

interface PricingFeature {
  id: string;
  name: string;
  icon: React.ElementType;
  monthlyCost: number;
  included: boolean;
  comingSoon?: boolean;
}

const DEFAULT_INCLUDED_MINUTES = 500;
const DEFAULT_OVERAGE_RATE = 0.15;

const CURRENCY_OPTIONS = ['$', 'C$', '€', '£'] as const;
type Currency = (typeof CURRENCY_OPTIONS)[number];

const defaultFeatures: PricingFeature[] = [
  { id: 'inbound', name: 'Inbound Calls', icon: Phone, monthlyCost: 0, included: true },
  { id: 'outbound', name: 'Outbound Calls', icon: PhoneOutgoing, monthlyCost: 49, included: false, comingSoon: true },
  { id: 'reminders', name: 'Appt. Reminders', icon: Bell, monthlyCost: 29, included: false, comingSoon: true },
  { id: 'recalls', name: 'Recalls & Activation', icon: RotateCcw, monthlyCost: 39, included: false, comingSoon: true },
  { id: 'payments', name: 'Payment Collection', icon: CreditCard, monthlyCost: 19, included: false, comingSoon: true },
];

const INCLUDED_BADGES = [
  'Inbound', '24/7 AI', 'HIPAA', 'PMS', 'Knowledge Base',
  'Call Logs', 'SMS Confirm', 'Email Confirm',
];

export default function SettingsBillingPage() {
  const [locations, setLocations] = useState(1);
  const [features, setFeatures] = useState(defaultFeatures);
  const [callVolume, setCallVolume] = useState(500);
  const [currency, setCurrency] = useState<Currency>('C$');
  const [isSaving, setIsSaving] = useState(false);

  // In the future, this will be loaded from the account's billing config set by admin
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [basePricePerLocation, setBasePricePerLocation] = useState(149);
  const [additionalLocationMultiplier] = useState(0.5);
  const [includedMinutes] = useState(DEFAULT_INCLUDED_MINUTES);
  const [overageRate] = useState(DEFAULT_OVERAGE_RATE);
  const [installationFee, setInstallationFee] = useState(5);

  // Load billing config from account publicData (set by super admin)
  useEffect(() => {
    async function loadBillingConfig() {
      try {
        const response = await fetch('/api/billing/config');
        if (response.ok) {
          const data = await response.json();
          if (data.billingEnabled !== undefined) {
            setBillingEnabled(data.billingEnabled);
          }
          if (data.billingConfig) {
            const cfg = data.billingConfig;
            if (cfg.basePricePerLocation) setBasePricePerLocation(cfg.basePricePerLocation);
            if (cfg.installationFee !== undefined) setInstallationFee(cfg.installationFee);
            if (cfg.featurePricing) {
              setFeatures((prev) =>
                prev.map((f) => ({
                  ...f,
                  monthlyCost: cfg.featurePricing[f.id] ?? f.monthlyCost,
                })),
              );
            }
          }
          if (data.billingPlan) {
            const plan = data.billingPlan;
            if (plan.locations) setLocations(plan.locations);
            if (plan.estimatedCallVolume) setCallVolume(plan.estimatedCallVolume);
            if (plan.currency) setCurrency(plan.currency as Currency);
            if (plan.features) {
              setFeatures((prev) =>
                prev.map((f) => ({
                  ...f,
                  included: plan.features.includes(f.id) || f.id === 'inbound',
                })),
              );
            }
          }
        }
      } catch (error) {
        console.error('Failed to load billing config:', error);
      }
    }
    loadBillingConfig();
  }, []);

  const toggleFeature = (featureId: string) => {
    if (!billingEnabled) return;
    setFeatures((prev) =>
      prev.map((f) =>
        f.id === featureId && !f.comingSoon ? { ...f, included: !f.included } : f,
      ),
    );
  };

  const pricing = useMemo(() => {
    const baseServiceCost = basePricePerLocation;
    const additionalLocationCost =
      (locations - 1) * basePricePerLocation * additionalLocationMultiplier;
    const serviceCost = baseServiceCost + additionalLocationCost;

    const featureCost = features
      .filter((f) => f.included && f.monthlyCost > 0)
      .reduce((sum, f) => sum + f.monthlyCost, 0);

    const overageMinutes = Math.max(0, callVolume - includedMinutes);
    const overageCost = overageMinutes * overageRate;

    const total = serviceCost + featureCost + overageCost;

    return { serviceCost, featureCost, overageMinutes, overageCost, total };
  }, [locations, features, callVolume, basePricePerLocation, additionalLocationMultiplier, includedMinutes, overageRate]);

  const formatCurrency = (amount: number) =>
    `${currency}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleSavePlan = async () => {
    setIsSaving(true);
    try {
      const selectedFeatures = features.filter((f) => f.included).map((f) => f.id);
      const response = await fetch('/api/stripe/save-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations, features: selectedFeatures, estimatedCallVolume: callVolume, currency }),
      });
      if (response.ok) {
        toast.success('Plan preferences saved successfully');
      } else {
        toast.error('Failed to save plan preferences');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Status Banner */}
      {!billingEnabled && (
        <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Billing is currently inactive.</strong> Your account is on a complimentary plan during the setup period.
            Usage-based billing will be activated by your account administrator when ready.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Configurator */}
        <div className={cn('lg:col-span-3 space-y-8', !billingEnabled && 'opacity-60 pointer-events-none')}>
          {/* Practice Locations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-semibold">Practice locations</h3>
                <p className="text-sm text-muted-foreground">
                  Each additional location is {Math.round(additionalLocationMultiplier * 100)}% of your base fee.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setLocations(Math.max(1, locations - 1))}
                  disabled={locations <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-12 items-center justify-center rounded-md border bg-background text-sm font-semibold">
                  {locations}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setLocations(Math.min(10, locations + 1))}
                  disabled={locations >= 10}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Features */}
          <div>
            <h3 className="text-base font-semibold mb-1">Features</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose what your AI receptionist handles
            </p>
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.id}
                    onClick={() => toggleFeature(feature.id)}
                    disabled={feature.comingSoon || !billingEnabled}
                    className={cn(
                      'flex items-center gap-3 rounded-xl p-3.5 text-left transition-all duration-200',
                      feature.included && !feature.comingSoon
                        ? 'bg-primary/[0.06] ring-1 ring-primary/30 shadow-sm'
                        : 'ring-1 ring-border/30 hover:ring-border/50',
                      (feature.comingSoon || !billingEnabled) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0',
                        feature.included && !feature.comingSoon
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{feature.name}</span>
                      {feature.comingSoon && (
                        <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                          Soon
                        </Badge>
                      )}
                      {feature.monthlyCost > 0 && !feature.comingSoon && (
                        <span className="text-xs text-muted-foreground ml-1">
                          +{formatCurrency(feature.monthlyCost)}/mo
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Call Volume Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-semibold">Monthly call volume</h3>
                <p className="text-sm text-muted-foreground">
                  {includedMinutes.toLocaleString()} free min included. {formatCurrency(overageRate)}/min overage.
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold">{callVolume.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground ml-1">min</span>
              </div>
            </div>
            <div className="mt-4 px-1">
              <Slider
                value={[callVolume]}
                onValueChange={([val]) => setCallVolume(val ?? 500)}
                min={0}
                max={10000}
                step={50}
                className="w-full"
                disabled={!billingEnabled}
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>0</span>
                <span>{includedMinutes >= 1000 ? `${includedMinutes / 1000}K` : includedMinutes}</span>
                <span>3K</span>
                <span>5K</span>
                <span>7.5K</span>
                <span>10K</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Pricing Card */}
        <div className="lg:col-span-2">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-bold text-base">Parlae AI</span>
                </div>
                <div className="flex gap-1">
                  {CURRENCY_OPTIONS.map((cur) => (
                    <button
                      key={cur}
                      onClick={() => setCurrency(cur)}
                      className={cn(
                        'text-xs px-2 py-1 rounded-md transition-colors',
                        currency === cur
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                {billingEnabled ? (
                  <>
                    <div className="text-4xl font-extrabold tracking-tight">
                      {formatCurrency(Math.round(pricing.total))}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Per month, {includedMinutes.toLocaleString()} min included
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-4xl font-extrabold tracking-tight text-green-600 dark:text-green-400">
                      Free
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Complimentary during setup period
                    </p>
                  </>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Cost Breakdown */}
              {billingEnabled && (
                <div>
                  <p className="text-sm font-semibold mb-2">Cost breakdown</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Services ({locations} location{locations > 1 ? 's' : ''})
                      </span>
                      <span className="font-medium">{formatCurrency(Math.round(pricing.serviceCost))}</span>
                    </div>
                    {pricing.featureCost > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Add-on features</span>
                        <span className="font-medium">+{formatCurrency(pricing.featureCost)}</span>
                      </div>
                    )}
                    {pricing.overageMinutes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Overage ({pricing.overageMinutes.toLocaleString()} min)
                        </span>
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          +{formatCurrency(Math.round(pricing.overageCost))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Included Features */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Included
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {INCLUDED_BADGES.map((label) => (
                    <Badge key={label} variant="outline" className="text-xs gap-1 font-normal">
                      <Check className="h-3 w-3 text-green-500" />
                      {label}
                    </Badge>
                  ))}
                  {features
                    .filter((f) => f.included && f.id !== 'inbound')
                    .map((f) => (
                      <Badge
                        key={f.id}
                        variant="outline"
                        className="text-xs gap-1 font-normal border-primary/30 bg-primary/5"
                      >
                        <Check className="h-3 w-3 text-primary" />
                        {f.name}
                      </Badge>
                    ))}
                </div>
              </div>

              {/* Billing Status Note */}
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                {billingEnabled ? (
                  <p>
                    <strong>Setup fee:</strong> A one-time {formatCurrency(installationFee)} activation fee is charged when you deploy.
                    Monthly billing starts after your first full month.
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5">
                    <Lock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      Usage-based billing will be activated by your administrator.
                      Pricing shown above is an estimate of what your plan would cost.
                    </span>
                  </p>
                )}
              </div>

              {/* Save / CTA */}
              {billingEnabled ? (
                <Button onClick={handleSavePlan} disabled={isSaving} className="w-full" size="lg">
                  {isSaving ? 'Saving...' : 'Save Plan Preferences'}
                </Button>
              ) : (
                <Button disabled className="w-full" size="lg" variant="secondary">
                  <Lock className="h-4 w-4 mr-2" />
                  Billing Not Active
                </Button>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Actual billing is based on usage. Contact your administrator for pricing details.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
