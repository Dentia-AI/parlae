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
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  DollarSign,
  Loader2,
  Save,
  RefreshCw,
  Calculator,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface PlatformPricing {
  id: number;
  twilioInboundPerMin: number;
  twilioOutboundPerMin: number;
  serverCostPerMin: number;
  markupPercent: number;
  updatedAt: string;
  updatedBy: string | null;
}

export default function AdminSettingsPage() {
  const [pricing, setPricing] = useState<PlatformPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const csrfToken = useCsrfToken();

  // Form state
  const [twilioInboundPerMin, setTwilioInboundPerMin] = useState('');
  const [twilioOutboundPerMin, setTwilioOutboundPerMin] = useState('');
  const [serverCostPerMin, setServerCostPerMin] = useState('');
  const [markupPercent, setMarkupPercent] = useState('');

  // Preview calculation
  const [previewMinutes, setPreviewMinutes] = useState('2');
  const [previewVapiCost, setPreviewVapiCost] = useState('0.10');

  useEffect(() => {
    fetchPricing();
  }, []);

  async function fetchPricing() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/platform-pricing');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch pricing');
      setPricing(data.pricing);
      setTwilioInboundPerMin(String(data.pricing.twilioInboundPerMin));
      setTwilioOutboundPerMin(String(data.pricing.twilioOutboundPerMin));
      setServerCostPerMin(String(data.pricing.serverCostPerMin));
      setMarkupPercent(String(data.pricing.markupPercent));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pricing');
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/platform-pricing', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            twilioInboundPerMin: parseFloat(twilioInboundPerMin),
            twilioOutboundPerMin: parseFloat(twilioOutboundPerMin),
            serverCostPerMin: parseFloat(serverCostPerMin),
            markupPercent: parseFloat(markupPercent),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        setPricing(data.pricing);
        toast.success('Pricing updated successfully');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save pricing');
      }
    });
  }

  // Live preview of blended cost
  const previewCost = (() => {
    const mins = parseFloat(previewMinutes) || 0;
    const vapiCost = parseFloat(previewVapiCost) || 0;
    const twilio = mins * (parseFloat(twilioInboundPerMin) || 0);
    const server = mins * (parseFloat(serverCostPerMin) || 0);
    const subtotal = vapiCost + twilio + server;
    const markup = subtotal * ((parseFloat(markupPercent) || 0) / 100);
    const total = subtotal + markup;
    return { vapiCost, twilio, server, subtotal, markup, total };
  })();

  const hasChanges = pricing && (
    String(pricing.twilioInboundPerMin) !== twilioInboundPerMin ||
    String(pricing.twilioOutboundPerMin) !== twilioOutboundPerMin ||
    String(pricing.serverCostPerMin) !== serverCostPerMin ||
    String(pricing.markupPercent) !== markupPercent
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading pricing configuration...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-2xl mt-10">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
          <p className="text-muted-foreground">
            Configure pricing rates for blended call cost calculation
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPricing}
          disabled={isPending}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pricing Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Call Cost Rates
            </CardTitle>
            <CardDescription>
              These rates are used to compute the blended cost shown in call logs
              and analytics. The formula is: Vapi + Twilio + Server + Markup%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="twilioInbound">Twilio Inbound Rate ($/min)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="twilioInbound"
                  type="number"
                  step="0.0001"
                  min="0"
                  className="pl-7"
                  value={twilioInboundPerMin}
                  onChange={(e) => setTwilioInboundPerMin(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cost per minute for inbound Twilio calls
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="twilioOutbound">Twilio Outbound Rate ($/min)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="twilioOutbound"
                  type="number"
                  step="0.0001"
                  min="0"
                  className="pl-7"
                  value={twilioOutboundPerMin}
                  onChange={(e) => setTwilioOutboundPerMin(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cost per minute for outbound Twilio calls
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serverCost">Server Cost ($/min)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="serverCost"
                  type="number"
                  step="0.0001"
                  min="0"
                  className="pl-7"
                  value={serverCostPerMin}
                  onChange={(e) => setServerCostPerMin(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Infrastructure/server cost per minute of call processing
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="markup">Markup (%)</Label>
              <div className="relative">
                <Input
                  id="markup"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Percentage markup applied to the subtotal (Vapi + Twilio + Server)
              </p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={isPending || !hasChanges}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
              {pricing?.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated: {new Date(pricing.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cost Preview Calculator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Cost Preview
            </CardTitle>
            <CardDescription>
              Preview the blended cost for a sample call using the current rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="previewMinutes">Call Duration (min)</Label>
                <Input
                  id="previewMinutes"
                  type="number"
                  step="0.5"
                  min="0"
                  value={previewMinutes}
                  onChange={(e) => setPreviewMinutes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="previewVapiCost">Vapi Cost ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="previewVapiCost"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-7"
                    value={previewVapiCost}
                    onChange={(e) => setPreviewVapiCost(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vapi Cost</span>
                <span className="font-mono">${previewCost.vapiCost.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Twilio (inbound)</span>
                <span className="font-mono">${previewCost.twilio.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Server Cost</span>
                <span className="font-mono">${previewCost.server.toFixed(4)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">${previewCost.subtotal.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Markup ({markupPercent || 0}%)</span>
                <span className="font-mono">${previewCost.markup.toFixed(4)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span className="font-mono text-primary">${previewCost.total.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              This preview uses the inbound Twilio rate. Outbound calls would use the outbound rate (${twilioOutboundPerMin || '0'}/min).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
