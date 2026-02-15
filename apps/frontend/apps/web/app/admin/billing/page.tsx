'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/shadcn-table';
import {
  Receipt,
  Search,
  Settings,
  DollarSign,
  Loader2,
  Save,
  ArrowLeft,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import Link from 'next/link';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

/**
 * Super Admin Billing Management
 *
 * This page allows admins to:
 * - View all clinics and their billing status
 * - Activate/deactivate billing per clinic
 * - Set per-feature pricing per clinic
 * - Set base price, overage rate, included minutes per clinic
 * - Set installation fees
 */

interface ClinicBilling {
  accountId: string;
  accountName: string;
  accountEmail: string | null;
  billingEnabled: boolean;
  billingConfig: BillingConfig | null;
}

interface BillingConfig {
  basePricePerLocation: number;
  additionalLocationMultiplier: number;
  includedMinutes: number;
  overageRate: number;
  installationFee: number;
  featurePricing: Record<string, number>;
  currency: string;
  notes: string;
}

const DEFAULT_BILLING_CONFIG: BillingConfig = {
  basePricePerLocation: 149,
  additionalLocationMultiplier: 0.5,
  includedMinutes: 500,
  overageRate: 0.15,
  installationFee: 5,
  featurePricing: {
    inbound: 0,
    outbound: 49,
    reminders: 29,
    recalls: 39,
    payments: 19,
  },
  currency: 'CAD',
  notes: '',
};

const FEATURE_LABELS: Record<string, string> = {
  inbound: 'Inbound Calls',
  outbound: 'Outbound Calls',
  reminders: 'Appt. Reminders',
  recalls: 'Recalls & Activation',
  payments: 'Payment Collection',
};

export default function AdminBillingPage() {
  const [clinics, setClinics] = useState<ClinicBilling[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<ClinicBilling | null>(null);
  const [editConfig, setEditConfig] = useState<BillingConfig>(DEFAULT_BILLING_CONFIG);
  const [isSaving, startSaving] = useTransition();
  const csrfToken = useCsrfToken();

  useEffect(() => {
    loadClinics();
  }, []);

  const loadClinics = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/billing/clinics', {
        headers: { 'x-csrf-token': csrfToken },
      });
      if (response.ok) {
        const data = await response.json();
        setClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Failed to load clinics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectClinic = (clinic: ClinicBilling) => {
    setSelectedClinic(clinic);
    setEditConfig(clinic.billingConfig || { ...DEFAULT_BILLING_CONFIG });
  };

  const handleSave = () => {
    if (!selectedClinic) return;

    startSaving(async () => {
      try {
        const response = await fetch('/api/admin/billing/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            accountId: selectedClinic.accountId,
            billingEnabled: selectedClinic.billingEnabled,
            billingConfig: editConfig,
          }),
        });

        if (response.ok) {
          toast.success(`Billing updated for ${selectedClinic.accountName}`);
          setClinics((prev) =>
            prev.map((c) =>
              c.accountId === selectedClinic.accountId
                ? { ...c, billingConfig: editConfig }
                : c,
            ),
          );
        } else {
          toast.error('Failed to update billing');
        }
      } catch {
        toast.error('An error occurred');
      }
    });
  };

  const toggleBilling = (clinic: ClinicBilling) => {
    const updated = { ...clinic, billingEnabled: !clinic.billingEnabled };
    setSelectedClinic(updated);
    setClinics((prev) =>
      prev.map((c) => (c.accountId === clinic.accountId ? updated : c)),
    );
  };

  const filteredClinics = clinics.filter(
    (c) =>
      c.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.accountEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  );

  // Detail view for a selected clinic
  if (selectedClinic) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
        <button
          onClick={() => setSelectedClinic(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clinics
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {selectedClinic.accountName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedClinic.accountEmail || 'No email'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="billing-toggle" className="text-sm">
                Billing Active
              </Label>
              <Switch
                id="billing-toggle"
                checked={selectedClinic.billingEnabled}
                onCheckedChange={() => toggleBilling(selectedClinic)}
              />
            </div>
            <Badge
              variant={selectedClinic.billingEnabled ? 'default' : 'secondary'}
            >
              {selectedClinic.billingEnabled ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Base Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Base Pricing
            </CardTitle>
            <CardDescription>
              Set the base monthly price and usage rates for this clinic
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Base Price per Location ($/mo)</Label>
                <Input
                  type="number"
                  value={editConfig.basePricePerLocation}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      basePricePerLocation: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Additional Location Multiplier</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editConfig.additionalLocationMultiplier}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      additionalLocationMultiplier:
                        parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  e.g. 0.5 = 50% of base for each additional location
                </p>
              </div>
              <div className="space-y-2">
                <Label>Included Minutes</Label>
                <Input
                  type="number"
                  value={editConfig.includedMinutes}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      includedMinutes: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Overage Rate ($/min)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editConfig.overageRate}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      overageRate: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Installation Fee ($)</Label>
                <Input
                  type="number"
                  value={editConfig.installationFee}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      installationFee: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={editConfig.currency}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, currency: e.target.value })
                  }
                  placeholder="CAD"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Feature Pricing
            </CardTitle>
            <CardDescription>
              Set per-feature monthly cost for this clinic. Set to 0 to include
              for free.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(FEATURE_LABELS).map(([featureId, label]) => (
                <div
                  key={featureId}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {featureId === 'inbound'
                        ? 'Core feature - usually included'
                        : 'Add-on feature'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      className="w-24"
                      value={editConfig.featurePricing[featureId] ?? 0}
                      onChange={(e) =>
                        setEditConfig({
                          ...editConfig,
                          featurePricing: {
                            ...editConfig.featurePricing,
                            [featureId]: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Admin Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Internal notes about this clinic's billing arrangement..."
              value={editConfig.notes}
              onChange={(e) =>
                setEditConfig({ ...editConfig, notes: e.target.value })
              }
            />
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setSelectedClinic(null)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Billing Config
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Billing Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage billing configuration and pricing for each clinic
          </p>
        </div>
        <Button variant="outline" onClick={loadClinics} disabled={isLoading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      <Alert>
        <Receipt className="h-4 w-4" />
        <AlertDescription>
          Usage-based billing is <strong>disabled by default</strong> for new
          clinics. Activate billing for a clinic and customize their pricing
          before they start receiving invoices.
        </AlertDescription>
      </Alert>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clinics by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Clinics Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClinics.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No clinics match your search'
                  : 'No clinic accounts found'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Billing Status</TableHead>
                  <TableHead className="text-right">Base Price</TableHead>
                  <TableHead className="text-right">Installation</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClinics.map((clinic) => (
                  <TableRow key={clinic.accountId}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{clinic.accountName}</p>
                        <p className="text-xs text-muted-foreground">
                          {clinic.accountEmail || 'No email'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          clinic.billingEnabled ? 'default' : 'secondary'
                        }
                      >
                        {clinic.billingEnabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {clinic.billingConfig
                        ? `$${clinic.billingConfig.basePricePerLocation}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {clinic.billingConfig
                        ? `$${clinic.billingConfig.installationFee}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => selectClinic(clinic)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Configure
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
