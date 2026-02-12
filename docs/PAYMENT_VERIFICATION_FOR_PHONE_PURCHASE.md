# Payment Verification for Phone Number Purchasing

## Overview

This document describes the payment verification system that ensures payment methods are added and verified **before** any phone numbers are purchased on Twilio.

## Problem Statement

Previously, phone numbers could be purchased without verifying that a payment method was on file, potentially leading to:
- Unauthorized charges
- Failed purchases that users didn't realize would occur
- Confusion about when charges would happen

## Solution

We've implemented a multi-layer payment verification system:

1. **Database Schema**: Track payment method verification status
2. **Payment Form**: Capture and verify payment method during setup
3. **API Protection**: Verify payment before any purchase operations
4. **User Flow**: Clear payment step before deployment

## Implementation Details

### 1. Database Schema Changes

**File**: `/packages/prisma/schema.prisma`

Added three new fields to the `Account` model:

```prisma
// Payment verification for phone number purchasing
stripePaymentMethodId       String?   @map("stripe_payment_method_id")
paymentMethodVerified       Boolean   @default(false) @map("payment_method_verified")
paymentMethodVerifiedAt     DateTime? @map("payment_method_verified_at")
```

**Migration**: `/packages/prisma/migrations/20260212000000_add_payment_verification/migration.sql`

### 2. Payment Form Updates

**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/_components/setup-payment-form.tsx`

Changes:
- Now actually confirms the SetupIntent with Stripe (not simulated)
- Saves the payment method ID to the account after confirmation
- Calls new `/api/stripe/save-payment-method` endpoint

Key code:
```typescript
const { error: confirmError, setupIntent } = await stripeRef.current.confirmSetup({
  clientSecret,
  redirect: 'if_required',
});

if (setupIntent?.payment_method) {
  await fetch('/api/stripe/save-payment-method', {
    method: 'POST',
    body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
  });
}
```

### 3. New API Routes

#### Save Payment Method
**File**: `/apps/frontend/apps/web/app/api/stripe/save-payment-method/route.ts`

- Authenticates the user
- Saves the payment method ID to their account
- Sets `paymentMethodVerified = true`
- Records verification timestamp

#### Check Payment Status
**File**: `/apps/frontend/apps/web/app/api/stripe/check-payment-method/route.ts`

- Checks if an account has a verified payment method
- Used by the review page to restore payment state on reload

### 4. Protected Actions

All phone-related actions now verify payment **before** proceeding:

#### Deploy Receptionist Action
**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/actions.ts`

```typescript
if (!account.paymentMethodVerified || !account.stripePaymentMethodId) {
  throw new Error('Payment method required. Please add a payment method before deploying.');
}
```

#### Setup Forwarded Number Action
**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/phone-actions.ts`

```typescript
if (!account.paymentMethodVerified || !account.stripePaymentMethodId) {
  throw new Error('Payment method required. Please add a payment method before purchasing a phone number.');
}
```

#### Twilio Purchase API Route
**File**: `/apps/frontend/apps/web/app/api/twilio/phone/purchase/route.ts`

- Now requires `accountId` parameter
- Verifies payment method before calling Twilio
- Returns `402 Payment Required` if not verified

### 5. UI Flow Updates

**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/review/page.tsx`

The review page now:
1. Checks payment status on load
2. Shows payment section first (collapsed after completion)
3. Disables deployment button until payment is verified
4. Displays appropriate error messages if payment verification fails

## User Flow

### Setup Wizard Flow

1. **Voice Selection** → User selects AI voice
2. **Knowledge Base** → User uploads documents (optional)
3. **Integrations** → User connects PMS/Calendar (optional)
4. **Phone Integration** → User selects phone method
5. **Review & Payment**:
   - Step 1: Add Payment Method (expanded by default)
   - Step 2: Review Configuration (expands after payment)
   - Deploy button is disabled until payment is verified

### Payment Verification Process

```
User enters card details
  ↓
Stripe.js validates card
  ↓
Frontend calls confirmSetup()
  ↓
Stripe processes SetupIntent
  ↓
Frontend receives payment_method ID
  ↓
Frontend calls /api/stripe/save-payment-method
  ↓
Backend saves to Account.stripePaymentMethodId
Backend sets Account.paymentMethodVerified = true
  ↓
Payment section collapses, review section opens
Deploy button becomes enabled
```

### Deployment/Purchase Flow

```
User clicks "Deploy"
  ↓
Backend receives deployReceptionistAction
  ↓
Backend checks Account.paymentMethodVerified
  ↓
If FALSE: Return error "Payment method required"
If TRUE: Proceed with deployment
  ↓
(If phone purchase needed)
  ↓
Backend checks payment method again
  ↓
Backend calls Twilio API to purchase number
  ↓
Twilio charges the stored payment method
  ↓
Success: Return phone number to user
```

## Protected Endpoints

All the following operations now require verified payment:

1. **Deploy AI Receptionist** (`deployReceptionistAction`)
   - Uses existing Twilio numbers
   - Creates Vapi assistant and squad
   - Imports phone to Vapi

2. **Setup Forwarded Number** (`setupForwardedNumberAction`)
   - May purchase new Twilio number
   - Configures call forwarding

3. **Purchase Phone Number** (`POST /api/twilio/phone/purchase`)
   - Direct Twilio number purchase
   - Used by various setup flows

4. **Ported Number** (`setupPortedNumberAction`)
   - Currently stores port request
   - Will eventually need payment for port fees

## Error Handling

### Payment Not Verified Errors

When payment is not verified, users see clear error messages:

- **During deployment**: "Payment method required. Please add a payment method before deploying."
- **During phone purchase**: "Payment method required. Please add a payment method before purchasing a phone number."
- **API calls**: HTTP 402 Payment Required with descriptive message

### Stripe Errors

Payment form handles Stripe errors gracefully:
- Card declined
- Network errors
- Invalid card details
- Setup confirmation failures

All errors are logged with context for debugging.

## Testing Checklist

### Manual Testing

- [ ] Complete setup flow with valid card
- [ ] Verify payment method is saved to database
- [ ] Deploy receptionist successfully
- [ ] Try to deploy without payment (should fail)
- [ ] Try to purchase phone without payment (should fail)
- [ ] Reload review page after payment (should show payment as complete)
- [ ] Test with Stripe test cards:
  - `4242424242424242` (success)
  - `4000000000000002` (decline)

### Database Verification

```sql
-- Check payment method verification
SELECT 
  id,
  name,
  stripe_payment_method_id,
  payment_method_verified,
  payment_method_verified_at
FROM accounts
WHERE primary_owner_user_id = 'USER_ID';
```

### Logs to Monitor

- `[Payment] Saving payment method to account`
- `[Payment] Payment method saved successfully`
- `[Receptionist] Payment method verified, proceeding with deployment`
- `[Phone Integration] Payment method verified, proceeding with phone setup`
- `[Twilio API] Payment method verified, proceeding with phone purchase`

## Security Considerations

1. **Payment Method Storage**:
   - We store only the payment method ID, not card details
   - Actual card data is stored by Stripe (PCI compliant)

2. **Authorization**:
   - All API routes verify user authentication
   - Users can only access their own account's payment methods

3. **Verification**:
   - Payment method is verified by Stripe during SetupIntent confirmation
   - Backend double-checks verification status before purchases

4. **Encryption**:
   - All payment data in transit uses HTTPS/TLS
   - Stripe.js handles card data client-side (never touches our servers)

## Production Deployment Steps

1. **Run Migration**:
   ```bash
   cd packages/prisma
   npx prisma migrate deploy
   ```

2. **Verify Environment Variables**:
   ```bash
   # In .env.local
   STRIPE_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```

3. **Test with Stripe Test Mode First**:
   - Use test API keys
   - Test full payment flow
   - Verify database updates

4. **Switch to Live Mode**:
   - Update to live API keys
   - Test with real card (refund after test)
   - Monitor logs for errors

5. **Monitor After Deployment**:
   - Watch for payment verification errors
   - Check Twilio purchase logs
   - Monitor Stripe dashboard for failed charges

## Troubleshooting

### Payment Method Not Saving

**Symptoms**: Payment form completes but deployment still fails

**Checks**:
1. Check browser console for errors
2. Verify `/api/stripe/save-payment-method` is being called
3. Check database for `stripe_payment_method_id`
4. Verify Stripe webhook endpoints (if using webhooks)

**Solution**:
```bash
# Check database
SELECT stripe_payment_method_id, payment_method_verified 
FROM accounts WHERE id = 'ACCOUNT_ID';

# If NULL, check API logs
grep "save-payment-method" logs/*.log
```

### Deployment Fails with Payment Error

**Symptoms**: "Payment method required" error even after adding payment

**Checks**:
1. Verify `paymentMethodVerified = true` in database
2. Check if `stripePaymentMethodId` is set
3. Verify account ID matches between payment and deployment

**Solution**:
```sql
-- Manually verify payment (for debugging only)
UPDATE accounts 
SET payment_method_verified = true,
    payment_method_verified_at = NOW()
WHERE id = 'ACCOUNT_ID';
```

### Stripe Card Errors

**Symptoms**: Card is declined or setup fails

**Common Causes**:
- Insufficient funds
- Card declined by bank
- Incorrect card details
- Network issues

**Solution**:
- Ask user to try different card
- Check Stripe dashboard for specific decline reason
- Ensure Stripe account is in good standing

## Future Enhancements

1. **Multiple Payment Methods**:
   - Allow users to add multiple cards
   - Select default payment method
   - Fallback if primary method fails

2. **Payment Method Management**:
   - View saved payment methods
   - Update/remove payment methods
   - Set default method

3. **Webhook Integration**:
   - Handle payment method updates
   - Notify on card expiration
   - Auto-update payment method from Stripe

4. **Billing History**:
   - Show phone number purchase charges
   - Display monthly Twilio costs
   - Export billing statements

5. **Cost Estimation**:
   - Show estimated monthly costs before deployment
   - Break down costs by service (Twilio, Vapi, OpenAI)
   - Calculate ROI based on call volume

## Related Documentation

- [Stripe SetupIntent Documentation](https://stripe.com/docs/payments/setup-intents)
- [Twilio Pricing](https://www.twilio.com/pricing)
- [Setup Wizard Implementation](./SETUP_WIZARD_IMPROVEMENTS.md)
- [Payment Integration Setup](./SETUP_PAYMENT_INTEGRATION.md)
