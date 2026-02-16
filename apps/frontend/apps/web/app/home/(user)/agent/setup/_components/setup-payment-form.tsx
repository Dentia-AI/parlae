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
  const elementsRef = useRef<any>(null);
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

            if (result?.clientSecret) {
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

      // Detect dark mode
      const isDarkMode = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;

      // Use Payment Element with clientSecret for Link support
      const elements = stripe.elements({
        clientSecret,
        appearance: {
          theme: isDarkMode ? 'night' : 'stripe',
          variables: {
            colorPrimary: '#6366f1',
            colorBackground: isDarkMode ? '#1c1c1e' : '#ffffff',
            colorText: isDarkMode ? '#e5e5e5' : '#1f2937',
            colorDanger: '#ef4444',
            colorTextPlaceholder: isDarkMode ? '#6b7280' : '#9ca3af',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            borderRadius: '6px',
          },
          rules: {
            '.Label': {
              color: isDarkMode ? '#d1d5db' : '#374151',
            },
            '.Input': {
              backgroundColor: isDarkMode ? '#27272a' : '#ffffff',
              borderColor: isDarkMode ? '#3f3f46' : '#d1d5db',
              color: isDarkMode ? '#e5e5e5' : '#1f2937',
            },
            '.Input:focus': {
              borderColor: '#6366f1',
              boxShadow: '0 0 0 1px #6366f1',
            },
            '.Tab': {
              backgroundColor: isDarkMode ? '#27272a' : '#f9fafb',
              borderColor: isDarkMode ? '#3f3f46' : '#e5e7eb',
              color: isDarkMode ? '#d1d5db' : '#6b7280',
            },
            '.Tab--selected': {
              backgroundColor: isDarkMode ? '#1c1c1e' : '#ffffff',
              borderColor: '#6366f1',
              color: isDarkMode ? '#e5e5e5' : '#1f2937',
            },
          },
        },
      });

      elementsRef.current = elements;

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
    
    if (!stripeRef.current || !elementsRef.current) {
      setError('Payment form not loaded');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Confirm the SetupIntent using the Elements instance
      const { error: confirmError, setupIntent } = await stripeRef.current.confirmSetup({
        elements: elementsRef.current,
        redirect: 'if_required',
      });
      
      if (confirmError) {
        console.error('Stripe confirmation error:', confirmError);
        setError(confirmError.message || 'Failed to confirm payment method');
        return;
      }

      // Save the payment method ID to the account
      if (setupIntent?.payment_method) {
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
