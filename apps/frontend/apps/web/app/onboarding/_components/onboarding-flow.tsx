'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@kit/ui/button';
import { Label } from '@kit/ui/label';
import { Input } from '@kit/ui/input';
import { Switch } from '@kit/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { useTranslation } from 'react-i18next';
import { StripeEmbeddedCheckout } from './stripe-embedded-checkout';

interface OnboardingFlowProps {
  user: {
    id: string;
    email: string;
  };
}

type Step = 'payment-info' | 'checkout';

export function OnboardingFlow({ user }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>('payment-info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Form state
  const [oneTimeAmount, setOneTimeAmount] = useState<string>('');
  const [enableRecurring, setEnableRecurring] = useState(false);
  const [recurringAmount, setRecurringAmount] = useState<string>('');
  const [recurringInterval, setRecurringInterval] = useState<
    'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  >('MONTHLY');

  const handleSubmitPaymentInfo = async () => {
    setError(null);

    // Validate amounts
    const oneTimeAmountNum = parseFloat(oneTimeAmount);
    if (isNaN(oneTimeAmountNum) || oneTimeAmountNum <= 0) {
      setError('Please enter a valid one-time payment amount');
      return;
    }

    if (enableRecurring) {
      const recurringAmountNum = parseFloat(recurringAmount);
      if (isNaN(recurringAmountNum) || recurringAmountNum <= 0) {
        setError('Please enter a valid recurring payment amount');
        return;
      }
    }

    setLoading(true);

    try {
      // Create checkout session
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          amountCents: Math.round(oneTimeAmountNum * 100),
          currency: 'usd',
          paymentType: enableRecurring ? 'RECURRING' : 'ONE_TIME',
          isRecurring: enableRecurring,
          recurringInterval: enableRecurring ? recurringInterval : undefined,
          recurringFrequency: 1,
          customerEmail: user.email,
          returnUrl: `${window.location.origin}/onboarding/complete`,
          metadata: {
            oneTimeAmount: oneTimeAmountNum,
            recurringAmount: enableRecurring
              ? parseFloat(recurringAmount)
              : null,
            recurringInterval: enableRecurring ? recurringInterval : null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
      setStep('checkout');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create checkout session',
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === 'checkout' && clientSecret) {
    return (
      <StripeEmbeddedCheckout
        clientSecret={clientSecret}
        onComplete={() => {
          router.push('/home');
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* One-time payment */}
          <div className="space-y-2">
            <Label htmlFor="oneTimeAmount">
              Initial Budget Amount (USD) *
            </Label>
            <Input
              id="oneTimeAmount"
              type="number"
              min="1"
              step="0.01"
              placeholder="Enter amount (e.g., 100.00)"
              value={oneTimeAmount}
              onChange={(e) => setOneTimeAmount(e.target.value)}
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">
              This amount will be charged immediately to fund your account.
            </p>
          </div>

          {/* Recurring payment toggle */}
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="enableRecurring">
                Enable Recurring Payments
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically add funds to your account on a schedule
              </p>
            </div>
            <Switch
              id="enableRecurring"
              checked={enableRecurring}
              onCheckedChange={setEnableRecurring}
              disabled={loading}
            />
          </div>

          {/* Recurring payment details */}
          {enableRecurring && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="recurringAmount">
                  Recurring Amount (USD) *
                </Label>
                <Input
                  id="recurringAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Enter amount (e.g., 50.00)"
                  value={recurringAmount}
                  onChange={(e) => setRecurringAmount(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recurringInterval">Billing Frequency *</Label>
                <Select
                  value={recurringInterval}
                  onValueChange={(value: any) => setRecurringInterval(value)}
                  disabled={loading}
                >
                  <SelectTrigger id="recurringInterval">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="YEARLY">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSubmitPaymentInfo}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? 'Processing...' : 'Continue to Payment'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

