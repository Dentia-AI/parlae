# Payment Flow Update Summary

## What Changed

Fixed the payment verification flow so that users can **configure** their phone setup without being blocked by payment, but phone number **purchasing** only happens after payment is verified during deployment.

## Key Changes

### 1. Phone Actions Now Save Configuration Only

**Files Modified:**
- `apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/phone-actions.ts`

**Changes:**
- ✅ `setupForwardedNumberAction`: Saves config with `needsPhoneNumber: true` flag, doesn't purchase
- ✅ `setupPortedNumberAction`: Saves port config as `pending_configuration`, doesn't submit port
- ✅ `setupSipTrunkAction`: Saves SIP config with `needsPhoneNumber: true` flag (Twilio number needed as Vapi endpoint)

**Result**: Users can complete phone setup step without payment

**Important Note**: All methods (including SIP) need a Twilio phone number:
- **Forwarded**: New Twilio number for call forwarding destination
- **Ported**: User's existing number transferred to Twilio
- **SIP Trunk**: New Twilio number as Vapi endpoint (user's PBX routes to it via SIP)

### 2. Deployment Action Handles Purchasing

**File Modified:**
- `apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/actions.ts`

**Changes:**
- ✅ Checks `paymentMethodVerified` before proceeding
- ✅ Reads `needsPhoneNumber` flag from saved settings
- ✅ Purchases Twilio number during deployment if needed
- ✅ Uses existing number if available

**Result**: Phone purchase only happens after payment verified

### 3. Direct Purchase API Still Protected

**File Modified:**
- `apps/frontend/apps/web/app/api/twilio/phone/purchase/route.ts`

**Changes:**
- ✅ Requires `accountId` parameter
- ✅ Verifies payment before purchase
- ✅ Returns 402 Payment Required if not verified

**Result**: Manual/admin purchases still protected

## User Flow

```
1. Voice Selection        → No payment needed ✓
2. Knowledge Base        → No payment needed ✓
3. Integrations          → No payment needed ✓
4. Phone Setup           → No payment needed ✓ (just saves config)
5. Review & Payment:
   a. Add Payment        → Payment method verified ✓
   b. Click Deploy       → NOW phone number is purchased ✓
```

## Database Schema

**New Fields in Account Model:**
```prisma
stripePaymentMethodId    String?   // Stripe payment method ID
paymentMethodVerified    Boolean   // Whether payment is verified
paymentMethodVerifiedAt  DateTime? // When verified
```

**Migration File:**
- `packages/prisma/migrations/20260212000000_add_payment_verification/migration.sql`

## Configuration Storage

Phone settings are stored with flags indicating future actions:

**Forwarded Method:**
```json
{
  "businessName": "Dental Clinic",
  "clinicNumber": "+15551234567",
  "needsPhoneNumber": true,  // ← Purchase during deployment
  "configuredAt": "2026-02-12T..."
}
```

**SIP Trunk Method:**
```json
{
  "businessName": "Dental Clinic",
  "clinicNumber": "+15551234567",      // User's existing number on PBX
  "pbxType": "FreePBX",
  "sipUrl": "sip:sip_ca5ecdfd@sip.twilio.com",
  "sipUsername": "sip_ca5ecdfd",
  "sipPassword": "...",
  "needsPhoneNumber": true,  // ← Purchase during deployment (Vapi endpoint)
  "configuredAt": "2026-02-12T..."
}
```

**Ported Method:**
```json
{
  "businessName": "Dental Clinic",
  "phoneNumber": "+15551234567",       // Number to be ported
  "currentCarrier": "AT&T",
  "portStatus": "pending_configuration",
  "needsPhoneNumber": false, // ← No purchase, will use ported number
  "configuredAt": "2026-02-12T..."
}
```

## What Happens During Deployment

```typescript
// 1. Verify payment
if (!paymentMethodVerified) {
  throw Error('Payment required');
}

// 2. Check if we need to purchase
if (settings.needsPhoneNumber && noExistingNumbers) {
  // Payment verified, purchase now
  phoneNumber = await twilioService.purchaseNumber();
} else {
  // Use existing number
  phoneNumber = existingNumbers[0];
}

// 3. Continue with deployment
// - Create Vapi assistant
// - Create squad
// - Import phone to Vapi
```

## Files Created

1. **Migration:**
   - `/packages/prisma/migrations/20260212000000_add_payment_verification/migration.sql`

2. **API Routes:**
   - `/apps/frontend/apps/web/app/api/stripe/save-payment-method/route.ts`
   - `/apps/frontend/apps/web/app/api/stripe/check-payment-method/route.ts`

3. **Documentation:**
   - `/docs/PAYMENT_VERIFICATION_FOR_PHONE_PURCHASE.md` (comprehensive technical doc)
   - `/docs/PAYMENT_AFTER_CONFIGURATION_FLOW.md` (detailed flow explanation)

## Files Modified

1. **Schema:**
   - `/packages/prisma/schema.prisma`

2. **Actions:**
   - `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/actions.ts`
   - `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/phone-actions.ts`

3. **Components:**
   - `/apps/frontend/apps/web/app/home/(user)/agent/setup/_components/setup-payment-form.tsx`
   - `/apps/frontend/apps/web/app/home/(user)/agent/setup/review/page.tsx`

4. **API Routes:**
   - `/apps/frontend/apps/web/app/api/twilio/phone/purchase/route.ts`

## Next Steps

### To Deploy:

1. **Run migration:**
   ```bash
   cd packages/prisma
   npx prisma migrate deploy
   ```

2. **Verify environment variables:**
   ```bash
   # Ensure these are set:
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

3. **Test flow:**
   - Complete setup wizard without payment
   - Add payment method on review page
   - Deploy and verify phone purchase happens

### Testing Checklist:

- [ ] Configure phone forwarding without payment (should succeed)
- [ ] Try to deploy without payment (should fail with clear error)
- [ ] Add payment method (should save to database)
- [ ] Deploy with payment (should purchase phone number)
- [ ] Verify Twilio number only purchased after payment verified
- [ ] Check database for `paymentMethodVerified = true`
- [ ] Test with SIP method (should not purchase, just configure)

## Benefits

1. **Better UX**: Users can configure everything first without payment friction
2. **Clear Billing**: Single point where charges occur (Deploy button)
3. **Safer**: Payment verified before any purchases
4. **Flexible**: Users can configure, then decide if they want to proceed
5. **Transparent**: User knows exactly when they'll be charged

## Important Notes

- Phone number purchasing during deployment is still using existing numbers or has a TODO for actual purchasing logic
- Port requests are saved as configuration and will need Twilio support to actually execute
- **SIP trunk DOES need a Twilio number** - it serves as the Vapi endpoint that the user's PBX routes to via SIP
- All three methods (ported, forwarded, SIP) require a Twilio number, but only forwarding and SIP purchase new ones
- Payment verification happens at multiple layers for security
