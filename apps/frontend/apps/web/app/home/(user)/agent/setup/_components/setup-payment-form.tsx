'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { If } from '@kit/ui/if';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface SetupPaymentFormProps {
  onPaymentComplete: () => void;
}

declare global {
  interface Window {
    Stripe: any;
  }
}

export function SetupPaymentForm({ onPaymentComplete }: SetupPaymentFormProps) {
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const paymentElementRef = useRef<any>(null);
  const stripeRef = useRef<any>(null);
  const csrfToken = useCsrfToken();

  useEffect(() => {
    let mounted = true;
    let scriptElement: HTMLScriptElement | null = null;

    // Load Stripe.js and get client secret
    const initializePayment = async () => {
      try {
        // Load Stripe.js
        scriptElement = document.createElement('script');
        scriptElement.src = 'https://js.stripe.com/v3/';
        scriptElement.async = true;
        
        scriptElement.onload = async () => {
          if (!mounted) return;
          setStripeLoaded(true);
          
          // Get client secret from API route
          try {
            console.log('Fetching SetupIntent with CSRF token...');
            const response = await fetch('/api/stripe/setup-intent', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken,
              },
              body: JSON.stringify({}),
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('SetupIntent result:', result);
            
            if (result?.clientSecret) {
              console.log('Got client secret');
              setClientSecret(result.clientSecret);
            } else {
              console.error('No client secret in response');
              setError('Failed to initialize payment form');
            }
          } catch (err) {
            console.error('Error getting client secret:', err);
            setError(`Failed to initialize payment form: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        };
        
        scriptElement.onerror = () => {
          console.error('Failed to load Stripe.js');
          setError('Failed to load payment system');
        };
        
        document.body.appendChild(scriptElement);
      } catch (err) {
        console.error('Error in initializePayment:', err);
        setError('Failed to initialize payment form');
      }
    };

    initializePayment();

    return () => {
      mounted = false;
      if (scriptElement && document.body.contains(scriptElement)) {
        document.body.removeChild(scriptElement);
      }
    };
  }, []);

  useEffect(() => {
    // Initialize Stripe Elements once we have both Stripe.js loaded and client secret
    if (stripeLoaded && clientSecret && typeof window !== 'undefined' && window.Stripe) {
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        setError('Stripe configuration error');
        return;
      }

      const stripe = window.Stripe(publishableKey);
      stripeRef.current = stripe;

      // Use Payment Element with clientSecret for Link support
      const elements = stripe.elements({
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#0066cc',
            colorBackground: '#ffffff',
            colorText: '#1f2937',
            colorDanger: '#ef4444',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            borderRadius: '6px',
          },
        },
      });

      // Payment Element automatically includes:
      // - Card input
      // - Link (Pay with email)
      // - Other payment methods if configured
      const paymentElement = elements.create('payment', {
        layout: {
          type: 'tabs',
          defaultCollapsed: false,
        },
      });

      paymentElement.mount('#payment-element');
      paymentElementRef.current = paymentElement;

      paymentElement.on('change', (event: any) => {
        if (event.error) {
          setError(event.error.message);
        } else {
          setError(null);
        }
      });
    }
  }, [stripeLoaded, clientSecret]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripeRef.current || !clientSecret) {
      setError('Payment form not loaded');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Confirming Stripe setup...');
      
      // Confirm the SetupIntent with Stripe
      const { error: confirmError, setupIntent } = await stripeRef.current.confirmSetup({
        clientSecret,
        redirect: 'if_required', // Don't redirect, handle success inline
      });
      
      if (confirmError) {
        console.error('Stripe confirmation error:', confirmError);
        setError(confirmError.message || 'Failed to confirm payment method');
        return;
      }

      console.log('SetupIntent confirmed:', setupIntent);

      // Save the payment method ID to the account
      if (setupIntent?.payment_method) {
        console.log('Saving payment method to account...');
        
        const response = await fetch('/api/stripe/save-payment-method', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            paymentMethodId: setupIntent.payment_method,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save payment method: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Payment method saved:', result);
      }
      
      setPaymentCompleted(true);
      onPaymentComplete();
    } catch (err) {
      setError('Failed to add payment method. Please try again.');
      console.error('Payment error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // If payment is completed, show success message
  if (paymentCompleted) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100">Payment Method Added</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Your payment method has been securely saved. You can now deploy your AI receptionist.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Payment Method</CardTitle>
        </div>
        <CardDescription>
          Add your credit card to activate your AI receptionist
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <If condition={!!error}>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </If>

          <div className="space-y-4">
            {/* Stripe Payment Element (includes Link + Card) */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div 
                id="payment-element"
                className="stripe-payment-element"
              />
              {!stripeLoaded && (
                <p className="text-sm text-muted-foreground">Loading payment form...</p>
              )}
            </div>

            {/* Submit Button */}
            <Button 
              type="submit"
              disabled={isLoading || !stripeLoaded || !clientSecret}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Add Payment Method
                </>
              )}
            </Button>
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              <strong>Secure Payment:</strong> Your payment information is processed securely through Stripe. 
              Your card will not be charged until you deploy your AI receptionist.
            </AlertDescription>
          </Alert>

          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>🔒 Protected by 256-bit SSL encryption</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
