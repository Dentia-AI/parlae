# Stripe Production Setup Guide

## ⚠️ Critical: Replace Placeholder Price IDs

Your application is currently using **sample/test Stripe price IDs** which don't exist in your production Stripe account. You need to create real products and update the configuration.

## 🛒 Step 1: Create Products in Stripe Dashboard

### 1.1 Go to Stripe Dashboard
Visit: https://dashboard.stripe.com/products

### 1.2 Create Each Product

For each plan (Starter, Pro, Enterprise), create a product with prices:

#### **Product 1: Starter Plan**
```
Name: Starter Plan
Description: Perfect for getting started with Dentia

Prices:
- Monthly: $29.99/month (recurring)
- Yearly: $299.99/year (recurring, save ~16%)
```

#### **Product 2: Pro Plan** (Recommended/Popular)
```
Name: Pro Plan
Description: Perfect for growing businesses

Prices:
- Monthly: $79.99/month (recurring)
- Yearly: $799.99/year (recurring, save ~16%)
```

#### **Product 3: Enterprise Plan**
```
Name: Enterprise Plan
Description: For large organizations

Prices:
- Monthly: $199.99/month (recurring)
- Yearly: $1,999.99/year (recurring, save ~16%)
```

### 1.3 Copy the Price IDs

After creating each price, **copy the Price ID** (looks like `price_1xxx...`)

Example:
```
✓ Starter Monthly → price_1ABCxyz123...
✓ Starter Yearly  → price_1DEFabc456...
✓ Pro Monthly     → price_1GHIdef789...
✓ Pro Yearly      → price_1JKLghi012...
✓ Enterprise Monthly → price_1MNOjkl345...
✓ Enterprise Yearly  → price_1PQRmno678...
```

## 📝 Step 2: Update billing.config.ts

Open: `apps/frontend/apps/web/config/billing.config.ts`

Replace ALL the `price_YOUR_xxx_PRICE_ID` placeholders with your actual Stripe price IDs:

```typescript
// Find and replace these:
id: 'price_YOUR_STARTER_MONTHLY_PRICE_ID',    // ← Replace with actual price ID
id: 'price_YOUR_STARTER_YEARLY_PRICE_ID',     // ← Replace with actual price ID
id: 'price_YOUR_PRO_MONTHLY_PRICE_ID',        // ← Replace with actual price ID
id: 'price_YOUR_PRO_YEARLY_PRICE_ID',         // ← Replace with actual price ID
id: 'price_YOUR_ENTERPRISE_MONTHLY_PRICE_ID', // ← Replace with actual price ID
id: 'price_YOUR_ENTERPRISE_YEARLY_PRICE_ID',  // ← Replace with actual price ID
```

Example (after replacement):
```typescript
lineItems: [
  {
    id: 'price_1ABC123xyz456def789',  // ✅ Real Stripe price ID
    name: 'Pro Plan',
    cost: 79.99,
    type: 'flat',
  },
],
```

## 🔄 Step 3: Rebuild and Deploy

After updating the config:

```bash
# Build new frontend image with updated config
cd /path/to/your/project/dentia
./scripts/build-and-push-ecr.sh frontend prod

# Deploy to ECS
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-frontend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

## ✅ Step 4: Verify

1. **Check Stripe Dashboard**:
   - Verify all products and prices are created
   - Make sure they're in **Live mode** (not test mode)

2. **Test the billing flow**:
   - Go to your app
   - Navigate to billing/pricing page
   - Try to subscribe to a plan
   - Should redirect to Stripe checkout successfully

## 🔍 Troubleshooting

### Error: "No such price: 'price_xxx'"

**Cause**: The price ID doesn't exist in your Stripe account

**Solution**:
1. Check if you're using the correct Stripe keys (live vs test)
2. Verify the price ID exists in https://dashboard.stripe.com/products
3. Make sure `STRIPE_SECRET_KEY` environment variable is set to your **live** key (not test)

### Error: "No such plan: 'xxx'"

**Cause**: The price is archived or doesn't match the product

**Solution**: Recreate the price in Stripe dashboard

### Billing not working after deployment

**Check**:
1. Environment variable `NEXT_PUBLIC_BILLING_PROVIDER` is set to `stripe`
2. `STRIPE_SECRET_KEY` in SSM Parameter Store is your **live** key
3. Frontend was rebuilt after config changes
4. ECS service was redeployed

## 🔐 Environment Variables

Make sure these are set in AWS SSM:

```bash
# Check your Stripe keys are the LIVE keys
aws ssm get-parameter \
  --name /dentia/shared/STRIPE_SECRET_KEY \
  --with-decryption \
  --profile dentia \
  --region us-east-2

aws ssm get-parameter \
  --name /dentia/shared/STRIPE_PUBLISHABLE_KEY \
  --profile dentia \
  --region us-east-2
```

Should start with:
- `STRIPE_SECRET_KEY` = `sk_live_YOUR_STRIPE_SECRET_KEY...` (NOT `sk_test_YOUR_STRIPE_TEST_SECRET_KEY...`)
- `STRIPE_PUBLISHABLE_KEY` = `pk_live_YOUR_STRIPE_PUBLISHABLE_KEY...` (NOT `pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY...`)

## 📊 Price Structure Guide

| Plan | Monthly | Yearly | Annual Savings |
|------|---------|--------|----------------|
| **Starter** | $29.99 | $299.99 (~$25/mo) | ~16% |
| **Pro** | $79.99 | $799.99 (~$66.67/mo) | ~16% |
| **Enterprise** | $199.99 | $1,999.99 (~$166.66/mo) | ~16% |

Adjust these prices based on your business model!

## 🎯 Quick Checklist

- [ ] Created 3 products in Stripe Dashboard (Starter, Pro, Enterprise)
- [ ] Created 2 prices for each product (monthly & yearly)
- [ ] Copied all 6 price IDs
- [ ] Updated `billing.config.ts` with real price IDs
- [ ] Verified using **live** Stripe keys (not test)
- [ ] Rebuilt frontend Docker image
- [ ] Deployed to production
- [ ] Tested checkout flow end-to-end

## 📚 Related Documentation

- [Stripe Products Documentation](https://stripe.com/docs/products-prices/overview)
- [Stripe Testing Guide](https://stripe.com/docs/testing)

---

**Remember**: Your pricing is public-facing and affects your revenue. Double-check all prices before going live! 💰



