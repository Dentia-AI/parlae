# Automated Agent Setup - Quick Reference

## TL;DR

**Problem**: GoHighLevel doesn't have APIs to purchase or assign phone numbers.

**Solution**: Use Twilio's API directly to purchase numbers and assign them to GHL sub-accounts automatically.

## Quick Start

### 1. Setup Environment

```bash
# .env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
GHL_API_KEY=your_ghl_api_key
GHL_LOCATION_ID=your_location_id
```

### 2. Get GHL's Twilio Sub-Account SID

From GHL UI: Settings → Phone Integration → Sub-account Settings → Copy "Account SID"

Store this mapping:
```typescript
{
  ghlSubAccountId: "abc123",
  twilioSubAccountSid: "ACxxx..."
}
```

### 3. Automated Setup (Simple)

```typescript
// Search for available number
const search = await fetch('/api/twilio/phone/search?areaCode=415&limit=1');
const { numbers } = await search.json();

// Purchase directly to GHL sub-account
const purchase = await fetch('/api/twilio/phone/purchase', {
  method: 'POST',
  body: JSON.stringify({
    phoneNumber: numbers[0].phoneNumber,
    subAccountSid: 'ACxxx...', // GHL's Twilio SID
    friendlyName: 'AI Agent'
  })
});

// Number is now in GHL automatically! ✅
```

## Two Strategies

### Strategy 1: On-Demand Purchase (Recommended)
- Buy when needed
- Simple, no pre-planning
- Best for: Variable demand

```typescript
async function setupAgent(customerSubAccountSid: string) {
  // Search & purchase in one flow
  const numbers = await searchNumbers({ areaCode: '415' });
  const number = await purchaseNumber(numbers[0], customerSubAccountSid);
  return number; // Ready to use in GHL!
}
```

### Strategy 2: Pre-Purchase Pool
- Buy 50-100 numbers upfront to a "pool" sub-account
- Assign from pool during setup
- Best for: High volume, predictable demand

```typescript
// One-time: Buy 50 numbers to pool
await bulkPurchaseToPool(50);

// During setup: Assign from pool
async function setupAgent(customerSubAccountSid: string) {
  const poolNumber = await getAvailablePoolNumber();
  
  // Configure webhook to route to customer's agent
  await configureNumber(poolNumber, {
    voiceUrl: `https://app.com/voice/${customerSubAccountSid}`
  });
  
  return poolNumber;
}
```

## API Endpoints

```bash
# Search available numbers
GET /api/twilio/phone/search
  ?countryCode=US
  &type=Local
  &areaCode=415
  &limit=10

# Purchase number
POST /api/twilio/phone/purchase
{
  "phoneNumber": "+14155551234",
  "subAccountSid": "ACxxx...",
  "friendlyName": "AI Agent"
}

# List purchased numbers
GET /api/twilio/phone/list
  ?subAccountSid=ACxxx...
```

## Complete Flow

```typescript
// 1. Customer signs up
// 2. Create GHL sub-account
// 3. Get Twilio sub-account SID from GHL
// 4. Search & purchase phone number via API ⚡
// 5. Configure AI agent
// 6. Done! No manual intervention.
```

## Why This Works

1. **GHL uses Twilio** for phone numbers
2. When you purchase to GHL's Twilio sub-account SID, **number appears in GHL automatically**
3. No need to "move" or "assign" - it's already there!
4. Fully programmable via Twilio API

## Cost

- **US Local Number**: $1.00 purchase + $1.15/month
- **Voice**: $0.013/minute
- **SMS**: $0.0079/message

Example: 100 agents = ~$115/month for numbers + usage costs

## Gotchas

❌ **Don't** use your main Twilio account SID
✅ **Do** use the GHL sub-account's Twilio SID

❌ **Don't** try to move numbers between accounts via API (not supported)
✅ **Do** purchase directly to the correct sub-account from the start

❌ **Don't** forget to configure webhooks
✅ **Do** set voiceUrl and smsUrl when purchasing

## Next Steps

1. Get Twilio credentials
2. Test with a single number purchase
3. Build automated flow
4. Scale to multiple agents

See full documentation: `/docs/AUTOMATED_AGENT_SETUP.md`
