# Phone Number Requirements by Integration Method

## Overview

All three phone integration methods require a **Twilio phone number** for the Vapi assistant endpoint, but they use it differently.

## Method Comparison

### 1. Ported Number Method

**User's Number**: Transferred to Twilio  
**Twilio Number**: Same as user's existing number (after porting)  
**How It Works**:
```
Caller → User's Number (now on Twilio) → Vapi Assistant → Response
```

**Phone Number Purchase**: Not needed - user's existing number becomes the Twilio number after porting

**Configuration**:
```json
{
  "method": "ported",
  "phoneNumber": "+15551234567",      // User's existing number
  "currentCarrier": "AT&T",
  "portStatus": "pending_configuration",
  "needsPhoneNumber": false           // ❌ No purchase needed
}
```

**Deployment Process**:
1. Verify payment ✓
2. Submit port request to Twilio (can take 7-14 days)
3. Use temporary number OR wait for port to complete
4. Attach ported number to Vapi assistant

---

### 2. Forwarded Number Method

**User's Number**: Stays with current carrier  
**Twilio Number**: New number purchased on Twilio  
**How It Works**:
```
Caller → User's Number (current carrier) 
      → Call Forwarding → Twilio Number 
      → Vapi Assistant → Response
```

**Phone Number Purchase**: Required - new Twilio number purchased

**Configuration**:
```json
{
  "method": "forwarded",
  "clinicNumber": "+15551234567",     // User's existing number
  "needsPhoneNumber": true,           // ✅ Purchase needed
  "configuredAt": "2026-02-12T..."
}
```

**After Deployment**:
```json
{
  "method": "forwarded",
  "clinicNumber": "+15551234567",     // User's existing number
  "twilioForwardNumber": "+15559876543", // ← Newly purchased Twilio number
  "setupCompletedAt": "2026-02-12T..."
}
```

**Deployment Process**:
1. Verify payment ✓
2. **Purchase new Twilio number** (happens during deployment)
3. Attach Twilio number to Vapi assistant
4. User manually sets up call forwarding from their existing number to the new Twilio number

---

### 3. SIP Trunk Method

**User's Number**: Stays on user's PBX system  
**Twilio Number**: New number purchased on Twilio (for Vapi endpoint)  
**How It Works**:
```
Caller → User's Number (on PBX) 
      → PBX Routes Call → SIP Trunk (credentials)
      → Twilio Number → Vapi Assistant → Response
```

**Phone Number Purchase**: Required - Twilio number needed as Vapi endpoint

**Configuration**:
```json
{
  "method": "sip",
  "clinicNumber": "+15551234567",     // User's existing number on PBX
  "pbxType": "FreePBX",
  "sipUrl": "sip:sip_ca5ecdfd@sip.twilio.com",
  "sipUsername": "sip_ca5ecdfd",
  "sipPassword": "...",
  "needsPhoneNumber": true,           // ✅ Purchase needed
  "configuredAt": "2026-02-12T..."
}
```

**After Deployment**:
```json
{
  "method": "sip",
  "clinicNumber": "+15551234567",     // User's existing number on PBX
  "pbxType": "FreePBX",
  "sipUrl": "sip:sip_ca5ecdfd@sip.twilio.com",
  "sipUsername": "sip_ca5ecdfd",
  "sipPassword": "...",
  "twilioSipNumber": "+15559876543",  // ← Newly purchased Twilio number
  "setupCompletedAt": "2026-02-12T..."
}
```

**Deployment Process**:
1. Verify payment ✓
2. **Purchase new Twilio number** (happens during deployment)
3. Create SIP trunk in Twilio
4. Attach Twilio number to SIP trunk
5. Attach SIP trunk to Vapi assistant
6. User configures PBX to route calls through SIP trunk to Twilio number

---

## Why Does SIP Method Need a Twilio Number?

### Common Misconception
"The user already has their own phone number on their PBX, why do they need a Twilio number?"

### Reality
The Twilio number serves as the **Vapi assistant endpoint**:

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Infrastructure                    │
│                                                              │
│  Caller → User's Number → User's PBX System                 │
│              (+15551234567)                                  │
└───────────────────────────────┬──────────────────────────────┘
                                │ SIP Trunk Connection
                                │ (using credentials)
                                ↓
┌─────────────────────────────────────────────────────────────┐
│                    Twilio/Vapi Infrastructure                │
│                                                              │
│  Twilio Number → Vapi Assistant → AI Response               │
│  (+15559876543)                                              │
└──────────────────────────────────────────────────────────────┘
```

### The Twilio Number's Role

1. **Vapi Endpoint**: Vapi needs a phone number to attach the assistant to
2. **SIP Target**: The PBX routes calls to this specific number via SIP
3. **Call Identity**: Helps track which calls belong to this account
4. **Billing**: Twilio charges are associated with this number

### What the User Configures on Their PBX

In their PBX system (FreePBX, Asterisk, etc.), they configure:

```ini
[dial-plan]
; When someone calls the clinic number, route to Twilio via SIP
exten => +15551234567,1,Dial(SIP/${EXTEN}@twilio-trunk)

[twilio-trunk]
type=friend
host=sip.twilio.com
username=sip_ca5ecdfd         ; ← From our SIP credentials
secret=<password>             ; ← From our SIP credentials
context=from-trunk
```

## Summary Table

| Method    | User's Number           | Twilio Number Needed? | Purchase During Deployment? | Why Twilio Number? |
|-----------|-------------------------|----------------------|----------------------------|-------------------|
| Ported    | Transferred to Twilio   | ✅ Yes (same number)  | ❌ No (port instead)        | Becomes the user's number |
| Forwarded | Stays with carrier      | ✅ Yes (new number)   | ✅ Yes                      | Forwarding destination |
| SIP Trunk | Stays on user's PBX     | ✅ Yes (new number)   | ✅ Yes                      | Vapi endpoint/SIP target |

## Implementation Details

### needsPhoneNumber Flag

This flag in the account settings indicates whether a Twilio number should be purchased during deployment:

```typescript
// Set to true for:
- Forwarded method (always needs new number)
- SIP method (always needs endpoint number)

// Set to false for:
- Ported method (using ported number instead)
- Already have existing Twilio numbers to use
```

### Deployment Logic

```typescript
const needsPhoneNumber = phoneIntegrationSettings?.needsPhoneNumber === true;
const method = phoneIntegrationSettings?.phoneIntegrationMethod;

if (needsPhoneNumber && existingNumbers.length === 0) {
  // Purchase a new Twilio number (payment already verified)
  logger.info(`Purchasing Twilio number for ${method} method`);
  phoneNumber = await twilioService.purchaseNumber({
    areaCode: phoneIntegrationSettings?.areaCode,
  });
} else if (existingNumbers.length > 0) {
  // Use existing Twilio number
  phoneNumber = existingNumbers[0].phoneNumber;
} else {
  throw new Error('No Twilio numbers available');
}

// All methods: Attach the Twilio number to Vapi assistant
await vapiService.importPhoneNumber(
  phoneNumber,
  twilioAccountSid,
  twilioAuthToken,
  squad.id
);
```

## User Communication

### During SIP Setup

**Show to User:**
```
✓ SIP credentials generated

Note: A Twilio phone number will be provisioned during deployment 
to serve as the endpoint for your AI assistant. Configure your PBX 
to route calls to this number using the SIP credentials provided.

Cost: Approximately $1/month for the Twilio number
```

### During Forwarding Setup

**Show to User:**
```
✓ Forwarding configuration saved

Note: A Twilio phone number will be provisioned during deployment.
You'll need to set up call forwarding from your existing number 
(+15551234567) to the new Twilio number.

Cost: Approximately $1/month for the Twilio number
```

### During Port Setup

**Show to User:**
```
✓ Port request configured

Note: Your existing number (+15551234567) will be transferred to 
Twilio. This process typically takes 7-14 business days. 

No additional phone number will be purchased.
```

## Cost Breakdown

### One-Time Costs
- **Number Purchase**: ~$1 (one-time, only for forwarding/SIP)
- **Port Fee**: ~$10 (one-time, only for porting)

### Monthly Costs (All Methods)
- **Twilio Number**: ~$1/month
- **Twilio Usage**: $0.013/min inbound, $0.013/min outbound
- **Vapi AI Assistant**: Variable based on usage
- **OpenAI API**: Variable based on conversation length

### Method-Specific Costs

**Ported**: 
- One-time: ~$10 port fee
- Monthly: ~$1 Twilio number + usage

**Forwarded**: 
- One-time: ~$1 number purchase
- Monthly: ~$1 Twilio number + usage + carrier forwarding fees

**SIP**: 
- One-time: ~$1 number purchase
- Monthly: ~$1 Twilio number + usage (no forwarding fees)

## Related Documentation

- [Payment After Configuration Flow](./PAYMENT_AFTER_CONFIGURATION_FLOW.md)
- [Phone Integration Methods](./PHONE_INTEGRATION_METHODS.md)
- [SIP Trunk Setup Guide](./SIP_TRUNK_SETUP_GUIDE.md)
