/**
 * Parlae Production Billing Configuration
 * 
 * IMPORTANT: Update the price IDs below with your actual Stripe production price IDs
 * Get them from: https://dashboard.stripe.com/products
 */
import { BillingProviderSchema, createBillingSchema } from '@kit/billing';

const provider = BillingProviderSchema.parse(
  process.env.NEXT_PUBLIC_BILLING_PROVIDER ?? 'stripe',
);

export default createBillingSchema({
  provider,
  products: [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for small practices getting started with AI',
      currency: 'USD',
      badge: 'Value',
      plans: [
        {
          name: 'Starter Monthly',
          id: 'starter-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              // TODO: Replace with your actual Stripe price ID
              id: 'price_YOUR_STARTER_MONTHLY_PRICE_ID',
              name: 'Starter Plan',
              cost: 29.99,
              type: 'flat' as const,
            },
          ],
        },
        {
          name: 'Starter Yearly',
          id: 'starter-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              // TODO: Replace with your actual Stripe price ID
              id: 'price_YOUR_STARTER_YEARLY_PRICE_ID',
              name: 'Starter Plan',
              cost: 299.99,
              type: 'flat' as const,
            },
          ],
        },
      ],
      features: [
        '1 AI receptionist',
        '1 phone number',
        'Up to 100 calls/month',
        'Basic call analytics',
        'Email confirmations',
        'Email support',
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      badge: 'Popular',
      highlighted: true,
      description: 'Ideal for growing practices',
      currency: 'USD',
      plans: [
        {
          name: 'Pro Monthly',
          id: 'pro-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              // TODO: Replace with your actual Stripe price ID
              id: 'price_YOUR_PRO_MONTHLY_PRICE_ID',
              name: 'Pro Plan',
              cost: 79.99,
              type: 'flat',
            },
          ],
        },
        {
          name: 'Pro Yearly',
          id: 'pro-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              // TODO: Replace with your actual Stripe price ID
              id: 'price_YOUR_PRO_YEARLY_PRICE_ID',
              name: 'Pro Plan',
              cost: 799.99,
              type: 'flat',
            },
          ],
        },
      ],
      features: [
        'Everything in Starter',
        'Up to 500 calls/month',
        'SMS confirmations',
        'PMS integration',
        'Google Calendar sync',
        'Advanced analytics',
        'Priority support',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For multi-location practices',
      currency: 'USD',
      plans: [
        {
          name: 'Enterprise Monthly',
          id: 'enterprise-monthly',
          paymentType: 'recurring',
          interval: 'month',
          lineItems: [
            {
              // TODO: Replace with your actual Stripe price ID
              id: 'price_YOUR_ENTERPRISE_MONTHLY_PRICE_ID',
              name: 'Enterprise Plan',
              cost: 199.99,
              type: 'flat',
            },
          ],
        },
        {
          name: 'Enterprise Yearly',
          id: 'enterprise-yearly',
          paymentType: 'recurring',
          interval: 'year',
          lineItems: [
            {
              // TODO: Replace with your actual Stripe price ID
              id: 'price_YOUR_ENTERPRISE_YEARLY_PRICE_ID',
              name: 'Enterprise Plan',
              cost: 1999.99,
              type: 'flat',
            },
          ],
        },
      ],
      features: [
        'Everything in Pro',
        'Unlimited calls',
        'Multiple phone numbers',
        'Multiple locations',
        'Custom AI training',
        'Outbound calls (coming soon)',
        'Dedicated account manager',
        'SLA guarantee',
      ],
    },
  ],
});
