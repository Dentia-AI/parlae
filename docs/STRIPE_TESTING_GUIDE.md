# Stripe Integration Testing Guide

This guide provides step-by-step instructions for testing the Stripe integration locally and in production.

## Prerequisites

1. **Install dependencies**:
   ```bash
   # Backend
   cd apps/backend
   pnpm install
   
   # Frontend
   cd apps/frontend
   pnpm install
   
   # Prisma
   cd packages/prisma
   pnpm install
   ```

2. **Apply database migrations**:
   ```bash
   cd packages/prisma
   pnpm prisma migrate dev --name add_stripe_payments
   pnpm prisma generate
   ```

3. **Install Stripe CLI** (for local webhook testing):
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login
   ```

## Local Development Testing

### Step 1: Set Environment Variables

Create `.env.local` files with test keys:

**Backend (`apps/backend/.env.local`):**
```bash
DATABASE_URL="your-postgres-connection-string"
STRIPE_SECRET_KEY="sk_test_YOUR_STRIPE_TEST_SECRET_KEY"
STRIPE_WEBHOOK_SECRET="" # Will be set by Stripe CLI
```

**Frontend (`apps/frontend/.env.local`):**
```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY"
BACKEND_API_URL="http://localhost:4000"
```

### Step 2: Start Stripe CLI Webhook Forwarding

In a separate terminal:
```bash
stripe listen --forward-to localhost:4000/stripe/webhook
```

Copy the webhook signing secret (starts with `whsec_YOUR_STRIPE_WEBHOOK_SECRET`) and add it to your backend `.env.local`:
```bash
STRIPE_WEBHOOK_SECRET="whsec_YOUR_STRIPE_WEBHOOK_SECRET"
```

### Step 3: Start Development Servers

**Terminal 1 - Backend:**
```bash
cd apps/backend
pnpm run start:dev
```

**Terminal 2 - Frontend:**
```bash
cd apps/frontend
pnpm run dev
```

**Terminal 3 - Stripe Webhooks:**
```bash
stripe listen --forward-to localhost:4000/stripe/webhook
```

### Step 4: Test User Flow

1. **Sign Up**: Navigate to `http://localhost:3000/auth/sign-up`
   - Create a new account

2. **Onboarding**: Navigate to `http://localhost:3000/onboarding`
   - Enter one-time payment amount: `100`
   - (Optional) Enable recurring payments: `50` monthly
   - Click "Continue to Payment"

3. **Stripe Checkout**:
   - Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)

4. **Verify Success**: You should be redirected to `/onboarding/complete`

5. **Check Database**:
   ```sql
   SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;
   ```

### Step 5: Test Webhook Events

After completing a payment, check the Stripe CLI output for webhook events:
- `checkout.session.completed`
- `payment_intent.succeeded`

Check backend logs for:
- "Checkout session completed"
- "Payment ... marked as succeeded"

### Step 6: Test Failed Payment

1. Go through onboarding flow again
2. Use declined card: `4000 0000 0000 0002`
3. Verify webhook receives `payment_intent.payment_failed`
4. Check database that payment is marked as `FAILED`

### Step 7: Test Refund

```bash
# Get payment ID from database
PAYMENT_ID="<payment-uuid>"

# Create refund
curl -X POST http://localhost:4000/stripe/refunds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d "{
    \"paymentId\": \"$PAYMENT_ID\",
    \"reason\": \"requested_by_customer\"
  }"
```

Verify:
1. Refund appears in database
2. Payment status updated to `REFUNDED`
3. Stripe dashboard shows refund

### Step 8: Test Recurring Billing (Manual Trigger)

Since the cron runs daily at 2 AM, we can test manually:

1. Create a payment with `isRecurring = true` and `nextBillingDate = NOW()`
2. Trigger the service manually (add a test endpoint or run directly):

```typescript
// In backend, create a test endpoint
@Get('test-recurring')
async testRecurring() {
  return this.recurringBillingService.processRecurringPayments();
}
```

3. Check logs for recurring billing processing
4. Verify new payment intent created in Stripe

## Testing Different Scenarios

### Scenario 1: One-Time Payment Only
- Amount: $100
- Recurring: Disabled
- Expected: Single payment, no future billing

### Scenario 2: One-Time + Monthly Recurring
- Initial: $100
- Recurring: $50 monthly
- Expected: Immediate $100 charge, then $50 monthly

### Scenario 3: Failed Recurring Payment
- Set up recurring payment
- Remove payment method from Stripe customer
- Wait for next billing cycle
- Expected: Payment fails, `failureCount` increments

### Scenario 4: Recurring Payment After 3 Failures
- Simulate 3 failed recurring payments
- Expected: Payment marked as FAILED, `isRecurring = false`

### Scenario 5: Partial Refund
- Create payment for $100
- Refund $50
- Expected: Refund record created, payment status remains `SUCCEEDED`

### Scenario 6: Full Refund
- Create payment for $100
- Refund $100
- Expected: Refund record created, payment status changes to `REFUNDED`

## Test Cards

### Successful Payments
- **Basic success**: `4242 4242 4242 4242`
- **3D Secure success**: `4000 0027 6000 3184`

### Failed Payments
- **Generic decline**: `4000 0000 0000 0002`
- **Insufficient funds**: `4000 0000 0000 9995`
- **Lost card**: `4000 0000 0000 9987`
- **Stolen card**: `4000 0000 0000 9979`

### Authentication Required
- **3D Secure required**: `4000 0025 0000 3155`

## Monitoring and Debugging

### Backend Logs

Check logs for payment processing:
```bash
# If using pm2 or similar
pm2 logs backend

# If running with pnpm
# Logs appear in console
```

Look for:
- "Creating checkout session"
- "Checkout session completed"
- "Payment ... marked as succeeded"
- "Starting recurring payment processing"

### Database Queries

```sql
-- Check all payments
SELECT id, user_id, amount_cents, status, payment_type, is_recurring, created_at 
FROM payments 
ORDER BY created_at DESC;

-- Check failed payments
SELECT id, user_id, amount_cents, failure_count, failure_reason 
FROM payments 
WHERE status = 'FAILED';

-- Check recurring payments due
SELECT id, user_id, amount_cents, next_billing_date, last_billing_date 
FROM payments 
WHERE is_recurring = true AND next_billing_date <= NOW();

-- Check refunds
SELECT r.id, r.amount_cents, r.status, r.reason, p.amount_cents as original_amount
FROM refunds r
JOIN payments p ON r.payment_id = p.id
ORDER BY r.created_at DESC;
```

### Stripe Dashboard

1. **Test Mode Dashboard**: https://dashboard.stripe.com/test/payments
2. **Webhooks**: https://dashboard.stripe.com/test/webhooks
3. **Customers**: https://dashboard.stripe.com/test/customers
4. **Logs**: https://dashboard.stripe.com/test/logs

## Production Testing

### Prerequisites

1. **Deploy to staging/production**:
   ```bash
   # Apply Terraform with live keys
   cd dentia-infra/infra/ecs
   terraform apply
   ```

2. **Set up production webhook**:
   - Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
   - Add endpoint: `https://api.dentiaapp.com/stripe/webhook`
   - Select all relevant events
   - Copy webhook secret
   - Update Terraform: `stripe_webhook_secret = "whsec_YOUR_STRIPE_WEBHOOK_SECRET"`
   - Apply: `terraform apply`

3. **Update frontend environment**:
   ```bash
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="your-stripe-live-publishable-key"
   ```

### Production Testing Steps

⚠️ **WARNING**: Production testing uses real money. Use small amounts!

1. **Test with small amount**: $1.00
2. **Complete full flow**: Sign up → Onboarding → Payment
3. **Verify webhooks**: Check Stripe Dashboard > Webhooks
4. **Test refund**: Refund the test payment
5. **Monitor CloudWatch**: Check logs for any errors

### Production Smoke Test Checklist

- [ ] User can sign up
- [ ] User redirected to onboarding
- [ ] Payment form loads correctly
- [ ] Stripe checkout loads
- [ ] Payment succeeds with real card
- [ ] Webhook received and processed
- [ ] Payment appears in database
- [ ] User redirected to dashboard
- [ ] Refund works correctly
- [ ] Recurring payment scheduled correctly

## Common Issues and Solutions

### Issue: Webhook signature verification failed

**Solution**: 
- Check `STRIPE_WEBHOOK_SECRET` is correct
- Verify webhook endpoint URL in Stripe Dashboard
- Check backend is receiving raw body (not parsed JSON)

### Issue: Payment not appearing in database

**Solution**:
- Check webhook is being received (Stripe Dashboard > Webhooks > Logs)
- Check backend logs for errors
- Verify database connection
- Check Prisma migrations are applied

### Issue: Stripe checkout not loading

**Solution**:
- Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- Check browser console for errors
- Ensure `@stripe/stripe-js` and `@stripe/react-stripe-js` are installed
- Verify backend is returning valid `clientSecret`

### Issue: Recurring payments not processing

**Solution**:
- Check cron job is running (CloudWatch logs)
- Verify customer has default payment method
- Check `nextBillingDate` is set correctly
- Ensure recurring payments have `status = 'SUCCEEDED'`

### Issue: 401 Unauthorized on API calls

**Solution**:
- Verify user is authenticated
- Check JWT token is being sent in Authorization header
- Verify Cognito configuration

## Performance Testing

### Load Testing Checkout Creation

```bash
# Using Apache Bench
ab -n 100 -c 10 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -p payment-data.json \
  http://localhost:4000/stripe/create-checkout-session
```

**payment-data.json:**
```json
{
  "userId": "test-user-id",
  "amountCents": 10000,
  "currency": "usd",
  "paymentType": "ONE_TIME",
  "customerEmail": "test@example.com",
  "returnUrl": "http://localhost:3000/onboarding/complete"
}
```

### Expected Performance

- **Checkout creation**: < 500ms
- **Webhook processing**: < 200ms
- **Refund creation**: < 1000ms
- **Recurring billing (per payment)**: < 2000ms

## CI/CD Testing

Add to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Test Stripe Integration
  env:
    STRIPE_SECRET_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
  run: |
    cd apps/backend
    pnpm test src/stripe/
```

## Next Steps

After successful testing:

1. [ ] Set up production monitoring alerts
2. [ ] Configure email notifications for failed payments
3. [ ] Set up daily reports for recurring billing
4. [ ] Create admin dashboard for payment management
5. [ ] Document runbook for production issues
6. [ ] Set up Stripe radar for fraud prevention
7. [ ] Configure payment retry logic
8. [ ] Add analytics tracking for conversion rates

## Support Resources

- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- Internal: Check `STRIPE_INTEGRATION_GUIDE.md`

