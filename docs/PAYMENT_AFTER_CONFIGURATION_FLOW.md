# Payment-After-Configuration Flow for Phone Setup

## Overview

This document describes the updated payment verification flow that allows users to **configure** their phone integration without payment blocking them, but requires payment before **executing** any purchases or deployments.

## Key Principle

**Configuration is free, execution requires payment.**

Users can:
- ✅ Select phone integration method (ported, forwarded, SIP)
- ✅ Enter their clinic phone number
- ✅ Configure SIP credentials
- ✅ Submit port request information
- ✅ Complete all wizard steps

Users cannot (without payment):
- ❌ Deploy the AI receptionist
- ❌ Purchase Twilio phone numbers
- ❌ Activate the system for live calls

## Updated Flow

### Phase 1: Configuration (No Payment Required)

```
1. Voice Selection
   → User selects AI voice
   → Configuration saved to database
   → No payment needed ✓

2. Knowledge Base
   → User uploads documents
   → Files stored in Vapi
   → No payment needed ✓

3. Integrations
   → User connects PMS/Calendar
   → OAuth completed
   → No payment needed ✓

4. Phone Integration
   → User selects method (ported/forwarded/SIP)
   → User enters configuration details
   → Configuration saved to database
   → Flag set: needsPhoneNumber = true (if forwarded)
   → No payment needed ✓
   → User can proceed to review
```

### Phase 2: Payment & Deployment

```
5. Review & Payment
   
   Step 1: Add Payment Method
   → User enters card details
   → Stripe validates and creates SetupIntent
   → Payment method ID saved to account
   → paymentMethodVerified = true
   → Payment section collapses ✓
   
   Step 2: Review Configuration
   → User reviews all settings
   → User clicks "Deploy"
   → Backend verifies payment ✓
   → If forwarded method: Purchase Twilio number NOW
   → If ported method: Submit port request NOW
   → If SIP method: Create SIP trunk NOW
   → Deploy Vapi assistant and squad
   → System goes live ✓
```

## Implementation Changes

### 1. Phone Actions (No Payment Verification)

All phone setup actions now **only save configuration**:

#### `setupForwardedNumberAction`
```typescript
// Before: Tried to purchase number immediately
// After: Just saves configuration with needsPhoneNumber flag

await prisma.account.update({
  data: {
    phoneIntegrationMethod: 'forwarded',
    phoneIntegrationSettings: {
      businessName,
      clinicNumber,
      needsPhoneNumber: true, // Flag for later purchase
      configuredAt: new Date().toISOString(),
    },
  },
});

return {
  success: true,
  message: 'Configuration saved. Phone number will be provisioned after payment.',
};
```

#### `setupPortedNumberAction`
```typescript
// Before: Tried to submit port request immediately
// After: Just saves port configuration

await prisma.account.update({
  data: {
    phoneIntegrationMethod: 'ported',
    phoneIntegrationSettings: {
      phoneNumber,
      currentCarrier,
      portStatus: 'pending_configuration', // Not submitted yet
      configuredAt: new Date().toISOString(),
    },
  },
});

return {
  success: true,
  message: 'Configuration saved. Port request will be submitted after payment.',
};
```

#### `setupSipTrunkAction`
```typescript
// Before & After: Unchanged (never purchased anything)
// Just generates credentials and saves configuration

return {
  success: true,
  sipCredentials: { sipUrl, username, password },
};
```

### 2. Deployment Action (With Payment Verification)

The `deployReceptionistAction` now handles purchasing based on saved configuration:

```typescript
// STEP 0: Verify payment method
if (!account.paymentMethodVerified || !account.stripePaymentMethodId) {
  throw new Error('Payment method required. Please add a payment method before deploying.');
}

// STEP 1: Check if we need to purchase a phone number
const needsPhoneNumber = phoneIntegrationSettings?.needsPhoneNumber === true;

if (needsPhoneNumber && existingNumbers.length === 0) {
  // Payment is verified, now we can purchase
  logger.info('[Receptionist] Purchasing new Twilio number (payment verified)');
  
  // Purchase the number now
  const purchasedNumber = await twilioService.purchaseNumber({
    areaCode: phoneIntegrationSettings?.areaCode,
  });
  
  phoneNumber = purchasedNumber.phoneNumber;
} else {
  // Use existing number
  phoneNumber = existingNumbers[0].phoneNumber;
}

// STEP 2-5: Continue with deployment (assistant, squad, etc.)
```

### 3. API Route Protection

The direct purchase API still requires payment (for admin/manual purchases):

```typescript
// POST /api/twilio/phone/purchase
// Still requires accountId and payment verification

if (!account.paymentMethodVerified || !account.stripePaymentMethodId) {
  return NextResponse.json(
    { success: false, message: 'Payment method required' },
    { status: 402 }
  );
}

// Proceed with purchase
```

## User Experience

### Wizard Navigation Flow

```
┌─────────────────────────────────────────────────────┐
│ Step 1-4: Configuration                             │
│ • User can freely move between steps                │
│ • All settings are saved immediately                │
│ • No payment barriers                               │
│ • "Next" buttons always enabled (if valid input)    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: Review & Payment                            │
│                                                      │
│ ┌─────────────────────────────────────────────┐    │
│ │ Payment Section (expanded initially)        │    │
│ │ • Add credit card                            │    │
│ │ • Stripe validates                           │    │
│ │ • Payment method saved                       │    │
│ └─────────────────────────────────────────────┘    │
│                        ↓                             │
│ ┌─────────────────────────────────────────────┐    │
│ │ Review Section (expands after payment)      │    │
│ │ • Shows all configuration                    │    │
│ │ • Deploy button enabled                      │    │
│ │ • Click Deploy → Purchase happens            │    │
│ └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### User Messages

**During Phone Setup:**
```
✓ Configuration saved successfully!
  Your phone number will be provisioned when you deploy.
```

**On Review Page (Before Payment):**
```
⚠ Add payment method to deploy your AI receptionist
  Your card will be charged when you click "Deploy"
```

**On Review Page (After Payment):**
```
✓ Payment method added
  Ready to deploy! Click "Deploy" to purchase phone number and go live.
```

**During Deployment:**
```
⏳ Deploying...
   • Purchasing Twilio phone number... ✓
   • Creating AI assistant... ✓
   • Setting up call routing... ✓
   • System is now live! ✓
```

## Database Schema

### Account Model Fields

```prisma
// Phone integration configuration
phoneIntegrationMethod   String? // 'ported', 'forwarded', 'sip', 'none'
phoneIntegrationSettings Json?   // Stores configuration details

// Settings structure for forwarded numbers:
{
  "businessName": "Dental Clinic",
  "clinicNumber": "+15551234567",
  "needsPhoneNumber": true,      // Flag indicating purchase needed
  "configuredAt": "2026-02-12T..."
}

// Settings structure after deployment:
{
  ...previousSettings,
  "twilioForwardNumber": "+15559876543", // Purchased number
  "setupCompletedAt": "2026-02-12T..."
}

// Payment verification
stripePaymentMethodId    String?   // Payment method ID
paymentMethodVerified    Boolean   // true after payment added
paymentMethodVerifiedAt  DateTime? // Timestamp
```

## Advantages of This Approach

1. **Better UX**: Users aren't blocked during setup, creating a smoother flow
2. **Clearer Billing**: Payment happens at a single, explicit "Deploy" step
3. **Configuration Flexibility**: Users can configure everything, then decide if they want to proceed
4. **Fail-Safe**: If payment fails, no resources have been provisioned yet
5. **Transparent Costs**: Users see what they're getting before being charged

## Edge Cases & Handling

### Case 1: User Abandons After Configuration

**Scenario**: User configures everything but never adds payment

**Result**:
- Configuration is saved in database
- No charges incurred
- No Twilio resources provisioned
- User can return anytime to complete setup

**Action**: No cleanup needed, configuration just sits unused

### Case 2: Payment Fails During Deployment

**Scenario**: User has verified payment, but charge fails during number purchase

**Result**:
- Deployment stops immediately
- Error message shown to user
- No assistant/squad created
- User can retry with different payment method

**Action**:
```typescript
try {
  const purchased = await twilioService.purchaseNumber(...);
} catch (error) {
  logger.error('Phone purchase failed');
  throw new Error('Failed to purchase phone number. Please verify your payment method.');
}
```

### Case 3: User Changes Phone Method After Configuration

**Scenario**: User configures forwarding, then goes back and selects SIP instead

**Result**:
- Previous configuration is overwritten
- needsPhoneNumber flag is removed (SIP doesn't need purchase)
- Deployment will use SIP configuration instead

**Action**: No special handling needed, last configuration wins

### Case 4: User Has Existing Twilio Number

**Scenario**: User configured forwarding, but Twilio account already has numbers

**Result**:
- Deployment detects existing number
- Uses existing number instead of purchasing
- No additional charge

**Action**:
```typescript
if (needsPhoneNumber && existingNumbers.length > 0) {
  // Use existing instead of purchasing
  phoneNumber = existingNumbers[0].phoneNumber;
  logger.info('Using existing number instead of purchasing');
}
```

### Case 5: Deployment Starts Then Fails Mid-Way

**Scenario**: Phone purchased successfully, but Vapi assistant creation fails

**Result**:
- Twilio number is purchased (can't be undone automatically)
- Assistant not created
- System not live

**Action**:
```typescript
// We should implement cleanup/rollback logic
try {
  const phoneNumber = await purchaseNumber();
  const assistant = await createAssistant();
  const squad = await createSquad();
  // ... rest of deployment
} catch (error) {
  // TODO: Implement rollback
  // - Release purchased phone number
  // - Or: Save partial progress for retry
  logger.error('Deployment failed, may need manual cleanup');
  throw error;
}
```

## Testing Checklist

### Configuration Phase (No Payment)
- [ ] Complete voice selection without payment
- [ ] Upload knowledge base files without payment
- [ ] Connect PMS/Calendar without payment
- [ ] Configure forwarded number without payment
- [ ] Configure ported number without payment
- [ ] Configure SIP trunk without payment
- [ ] Navigate freely between all wizard steps
- [ ] Refresh page and verify configuration persists

### Payment Phase
- [ ] Add valid payment method
- [ ] Verify payment method saved to database
- [ ] Check `paymentMethodVerified = true`
- [ ] Reload review page, payment section stays collapsed
- [ ] Try invalid card (should show error, not crash)

### Deployment Phase (With Payment)
- [ ] Deploy with forwarding method (should purchase number)
- [ ] Deploy with SIP method (should not purchase)
- [ ] Deploy with ported method (should submit port request)
- [ ] Verify Twilio number only purchased after payment verified
- [ ] Check logs show payment verification before purchase
- [ ] Verify error message if payment not added

### Error Cases
- [ ] Try to deploy without payment (should fail gracefully)
- [ ] Simulate Twilio purchase failure (should rollback)
- [ ] Test with insufficient funds (should show clear error)
- [ ] Test network failure during deployment

## Monitoring & Logging

### Key Log Messages

**Configuration Saved:**
```
[Phone Integration] Forwarding configuration saved (number will be purchased after payment)
[Phone Integration] Port configuration saved (actual port will be initiated after payment)
[Phone Integration] SIP trunk configuration saved
```

**Payment Verified:**
```
[Payment] Payment method saved successfully
[Receptionist] Payment method verified, proceeding with deployment
```

**Purchase Triggered:**
```
[Receptionist] Purchasing new Twilio number for forwarding (payment verified)
[Twilio API] Payment method verified, proceeding with phone purchase
```

**Purchase Completed:**
```
[Receptionist] Successfully purchased phone number: +15559876543
[Twilio API] Successfully purchased phone number
```

### Metrics to Track

1. **Configuration Completion Rate**: % users who finish configuration
2. **Payment Conversion Rate**: % configured users who add payment
3. **Deployment Success Rate**: % paid users who successfully deploy
4. **Phone Purchase Success Rate**: % deployments that purchase successfully
5. **Time to Deploy**: Average time from signup to live system

## Future Enhancements

1. **Cost Preview**: Show estimated costs before payment
2. **Rollback Logic**: Automatically release resources if deployment fails
3. **Partial Deployment**: Save progress if mid-deployment failure
4. **Phone Number Selection**: Let user choose specific number before purchase
5. **Area Code Selection**: Let user specify desired area code
6. **Purchase Confirmation**: Show confirmation modal before purchase
7. **Deployment Status**: Real-time progress indicator during deployment

## Related Documentation

- [Payment Verification Implementation](./PAYMENT_VERIFICATION_FOR_PHONE_PURCHASE.md)
- [Setup Wizard Flow](./SETUP_WIZARD_IMPROVEMENTS.md)
- [Phone Integration Architecture](./PHONE_INTEGRATION_METHODS.md)
