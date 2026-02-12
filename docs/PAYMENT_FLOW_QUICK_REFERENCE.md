# Quick Reference: Payment Flow & Phone Number Purchasing

## TL;DR

✅ **Users can configure everything without payment**  
✅ **Phone number purchasing only happens at deployment after payment verified**  
✅ **ALL methods need a Twilio number** (yes, even SIP trunk!)

## Which Methods Need to Purchase a Number?

| Method    | Purchases New Number? | Why? |
|-----------|----------------------|------|
| Forwarded | ✅ YES | Need Twilio number for forwarding destination |
| SIP Trunk | ✅ YES | Need Twilio number as Vapi endpoint |
| Ported    | ❌ NO  | User's number is transferred to Twilio instead |

## Configuration Flags

```typescript
// Forwarded
{ needsPhoneNumber: true }   // Will purchase during deployment

// SIP Trunk  
{ needsPhoneNumber: true }   // Will purchase during deployment (for Vapi endpoint)

// Ported
{ needsPhoneNumber: false }  // Will use ported number instead
```

## When Does Purchase Happen?

```
Setup Step 1-4: Configuration saved ✓ (no purchase)
                ↓
Review Step 5a: Payment added ✓ (no purchase)
                ↓
Review Step 5b: Click "Deploy" → PURCHASE HAPPENS HERE ✓
```

## Deployment Logic

```typescript
// 1. Verify payment first
if (!account.paymentMethodVerified) {
  throw Error('Payment method required');
}

// 2. Check if we need to purchase
if (settings.needsPhoneNumber && noExistingNumbers) {
  // FORWARDED or SIP method
  phoneNumber = await twilioService.purchaseNumber();
} else if (settings.method === 'ported') {
  // PORTED method - wait for port to complete or use temp number
  phoneNumber = await handlePortedNumber();
} else {
  // Use existing Twilio number
  phoneNumber = existingNumbers[0];
}

// 3. Attach to Vapi (all methods)
await vapiService.importPhoneNumber(phoneNumber, ...);
```

## SIP Trunk Explanation

**Common Question**: "User has their own number on their PBX, why buy a Twilio number?"

**Answer**: The Twilio number is the **Vapi endpoint**:

```
Caller 
  ↓
User's PBX Number (+15551234567) ← User keeps this
  ↓
SIP Trunk (with credentials)
  ↓
Twilio Number (+15559876543) ← NEW, purchased during deployment
  ↓
Vapi AI Assistant
```

The user's PBX routes calls TO the Twilio number via SIP. The Twilio number is where Vapi attaches the AI assistant.

## Files Changed

### Core Logic
- ✅ `phone-actions.ts` - All methods set `needsPhoneNumber` flag
- ✅ `actions.ts` - Deployment checks flag and purchases if needed
- ✅ `schema.prisma` - Added payment verification fields

### Payment Handling
- ✅ `setup-payment-form.tsx` - Actually saves payment method
- ✅ `review/page.tsx` - Checks payment status
- ✅ `/api/stripe/save-payment-method` - Saves to database
- ✅ `/api/stripe/check-payment-method` - Checks status

### Protection
- ✅ `/api/twilio/phone/purchase` - Verifies payment before purchase

## Testing Checklist

- [ ] Configure forwarding without payment (should work)
- [ ] Configure SIP without payment (should work)
- [ ] Configure porting without payment (should work)
- [ ] Try to deploy without payment (should fail)
- [ ] Add payment method (should save to DB)
- [ ] Deploy with forwarding (should purchase Twilio number)
- [ ] Deploy with SIP (should purchase Twilio number for endpoint)
- [ ] Deploy with porting (should NOT purchase, use ported number)

## Migration Required

```bash
cd packages/prisma
npx prisma migrate deploy
```

Adds:
- `stripe_payment_method_id`
- `payment_method_verified`
- `payment_method_verified_at`

## Environment Variables Needed

```bash
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

## Related Docs

- [Phone Number Requirements by Method](./PHONE_NUMBER_REQUIREMENTS_BY_METHOD.md) - Detailed explanation
- [Payment After Configuration Flow](./PAYMENT_AFTER_CONFIGURATION_FLOW.md) - Full user flow
- [Payment Verification Implementation](./PAYMENT_VERIFICATION_FOR_PHONE_PURCHASE.md) - Technical details
