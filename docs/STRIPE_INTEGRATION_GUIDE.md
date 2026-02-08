# Stripe Integration Guide

This guide explains the complete Stripe integration for handling one-time and recurring payments during onboarding.

## Overview

The Stripe integration allows users to:
1. Make an initial one-time payment during onboarding
2. Optionally enable recurring payments with flexible amounts and intervals
3. View and manage their payments
4. Receive automatic billing for recurring payments
5. Get immediate refunds when needed

## Architecture

### Backend (NestJS)
- **Location**: `apps/backend/src/stripe/`
- **Components**:
  - `StripeModule`: Main module that imports all Stripe services
  - `StripeService`: Initializes and manages the Stripe client
  - `PaymentService`: Handles payment creation and processing
  - `WebhookService`: Processes Stripe webhook events
  - `RefundService`: Handles refund requests
  - `RecurringBillingService`: Processes recurring payments (runs daily at 2 AM)
  - `StripeController`: REST API endpoints for Stripe operations

### Frontend (Next.js)
- **Location**: `apps/frontend/apps/web/app/onboarding/`
- **Components**:
  - Onboarding page with payment collection form
  - Stripe Embedded Checkout integration
  - Payment success page

### Database
- **New Tables**:
  - `payments`: Tracks all payments (one-time and recurring)
  - `refunds`: Tracks refund requests and statuses
- **New Enums**:
  - `PaymentType`: ONE_TIME, RECURRING
  - `RecurringInterval`: DAILY, WEEKLY, MONTHLY, YEARLY
  - `RefundStatus`: PENDING, SUCCEEDED, FAILED, CANCELED

## Setup Instructions

### 1. Infrastructure Setup (Terraform)

The Stripe API keys are stored in AWS SSM Parameter Store via Terraform:

#### Production Keys (Live)
File: `dentia-infra/infra/ecs/terraform.tfvars`
```hcl
stripe_publishable_key = "your-stripe-live-publishable-key"
stripe_secret_key      = "your-stripe-live-secret-key"
stripe_webhook_secret  = "" # To be set after webhook endpoint is created
```

#### Development Keys (Test)
File: `dentia-infra/infra/environments/dev/terraform.tfvars`
```hcl
environment = "dev"
stripe_publishable_key = "pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY"
stripe_secret_key      = "sk_test_YOUR_STRIPE_TEST_SECRET_KEY"
stripe_webhook_secret  = "" # To be set after webhook endpoint is created
```

**Deploy Terraform:**
```bash
cd dentia-infra/infra/ecs
terraform apply
```

### 2. Database Migration

Generate and apply the Prisma migration for the new payment tables:

```bash
cd dentia/packages/prisma
pnpm prisma migrate dev --name add_stripe_payments
pnpm prisma generate
```

### 3. Backend Setup

Install dependencies:
```bash
cd dentia/apps/backend
pnpm install
```

The backend will automatically load Stripe configuration from environment variables:
- `STRIPE_SECRET_KEY`: Loaded from SSM Parameter Store
- `STRIPE_WEBHOOK_SECRET`: Loaded from SSM Parameter Store

### 4. Frontend Setup

Install dependencies:
```bash
cd dentia/apps/frontend
pnpm install
```

Set environment variable in your `.env.local` or deployment:
```bash
# For local development (test key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY

# For production (live key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-live-publishable-key
```

### 5. Webhook Configuration

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Create a new webhook endpoint:
   - **URL**: `https://api.dentiaapp.com/stripe/webhook` (production) or your dev URL
   - **Events to send**:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. Copy the webhook signing secret and update Terraform:
   ```bash
   # Update terraform.tfvars with the webhook secret
   stripe_webhook_secret = "whsec_YOUR_STRIPE_WEBHOOK_SECRET"
   
   # Apply changes
   terraform apply
   ```

## API Endpoints

### Backend Endpoints

#### Create Checkout Session
```
POST /stripe/create-checkout-session
```

**Request Body:**
```json
{
  "userId": "user-uuid",
  "accountId": "account-uuid", // optional
  "amountCents": 10000, // $100.00
  "currency": "usd",
  "paymentType": "RECURRING",
  "isRecurring": true,
  "recurringInterval": "MONTHLY",
  "recurringFrequency": 1,
  "customerEmail": "user@example.com",
  "returnUrl": "https://app.dentiaapp.com/onboarding/complete",
  "metadata": {
    // any custom metadata
  }
}
```

**Response:**
```json
{
  "sessionId": "cs_test_xxxxx",
  "clientSecret": "cs_test_xxxxx_secret_xxxxx",
  "url": null
}
```

#### Get User Payments
```
GET /stripe/payments/user/:userId
```

#### Get Payment by ID
```
GET /stripe/payments/:paymentId
```

#### Create Refund
```
POST /stripe/refunds
```

**Request Body:**
```json
{
  "paymentId": "payment-uuid",
  "amountCents": 5000, // optional, defaults to full amount
  "reason": "requested_by_customer",
  "metadata": {}
}
```

#### Webhook Endpoint
```
POST /stripe/webhook
```

### Frontend API Route

#### Create Checkout Session (Proxy to Backend)
```
POST /api/stripe/create-checkout-session
```

This route proxies requests to the backend API.

## User Flow

### Onboarding Flow

1. **User Signs Up**: User creates an account via `/auth/sign-up`
2. **Redirect to Onboarding**: After sign-up, redirect user to `/onboarding`
3. **Payment Information Form**:
   - User enters initial budget amount (required)
   - User optionally enables recurring payments
   - If recurring: user enters amount and interval
4. **Stripe Checkout**: User is shown Stripe Embedded Checkout
5. **Payment Processing**: 
   - Stripe processes the payment
   - Webhook updates payment status in database
6. **Success**: User is redirected to `/onboarding/complete`
7. **Dashboard**: User can access `/home` dashboard

### Recurring Billing

The `RecurringBillingService` runs daily at 2 AM and:
1. Finds all payments with `isRecurring = true` and `nextBillingDate <= today`
2. Attempts to charge the customer using saved payment method
3. On success: Updates `lastBillingDate` and calculates new `nextBillingDate`
4. On failure: Increments `failureCount` and stores `failureReason`
5. After 3 failures: Marks payment as FAILED and stops recurring charges

## Testing

### Local Testing with Stripe CLI

1. Install Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

2. Login to Stripe:
   ```bash
   stripe login
   ```

3. Forward webhooks to local backend:
   ```bash
   stripe listen --forward-to localhost:4000/stripe/webhook
   ```

4. Copy the webhook signing secret and set it in your `.env`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK_SECRET
   ```

5. Test with Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Authentication required: `4000 0025 0000 3155`

### Testing Failed Payments

1. Use a card that requires authentication: `4000 0025 0000 3155`
2. Don't complete the authentication
3. The webhook will trigger `payment_intent.payment_failed`

### Testing Refunds

```bash
curl -X POST http://localhost:4000/stripe/refunds \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "payment-uuid",
    "reason": "requested_by_customer"
  }'
```

## Monitoring

### CloudWatch Logs

Backend logs are available in CloudWatch:
- Log Group: `/ecs/dentia/backend` (production)
- Log Group: `/ecs/dentia-dev/backend` (development)

Search for:
- `Creating checkout session` - Payment initiation
- `Payment ... marked as succeeded` - Successful payment
- `Payment ... marked as failed` - Failed payment
- `Recurring payment ... failed` - Recurring billing failure

### Stripe Dashboard

Monitor all transactions in [Stripe Dashboard](https://dashboard.stripe.com):
- **Payments**: View all successful payments
- **Failed Payments**: View declined transactions
- **Refunds**: View all refund requests
- **Webhooks**: Monitor webhook deliveries and failures

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook endpoint URL is correct in Stripe Dashboard
2. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
3. Check CloudWatch logs for webhook errors
4. Test webhook delivery in Stripe Dashboard

### Payment Not Creating in Database

1. Check backend logs for errors during payment creation
2. Verify Prisma migrations are applied
3. Check database connectivity

### Recurring Payments Not Processing

1. Verify cron job is running (check CloudWatch logs for "Starting recurring payment processing")
2. Check that customer has a default payment method saved
3. Verify `nextBillingDate` is set correctly on payment records

### Frontend Not Loading Stripe

1. Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
2. Check browser console for Stripe loading errors
3. Ensure Stripe JS library is loading correctly

## Security Considerations

1. **Keys Storage**: All Stripe keys are stored in AWS SSM Parameter Store, never committed to git
2. **Environment Separation**: Test keys for dev, live keys for production only
3. **Webhook Verification**: All webhooks are verified using Stripe signature
4. **Authentication**: All API endpoints (except webhooks) require authentication
5. **HTTPS Only**: Stripe requires HTTPS for production webhooks

## Next Steps

1. **Add Email Notifications**: Send email when:
   - Payment successful
   - Payment failed
   - Recurring payment processed
   - Recurring payment failed after 3 attempts

2. **Add Payment History UI**: Create a page in `/home/billing` to show:
   - All past payments
   - Recurring payment status
   - Option to cancel recurring payments
   - Refund history

3. **Add Payment Method Management**: Allow users to:
   - Update default payment method
   - Add/remove payment methods
   - View saved cards

4. **Add Analytics**: Track:
   - Conversion rate (sign-ups to first payment)
   - Average initial payment amount
   - Recurring payment adoption rate
   - Churn rate (canceled recurring payments)

## Support

For Stripe-related issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com/)
- Internal: Check CloudWatch logs and backend error logs

