# Vapi PMS Tools - Complete Configuration ✅

**Date:** February 9, 2026  
**Status:** ✅ All tools configured with proper authentication

---

## Summary

Successfully configured **7 Vapi tools** with proper authentication for the dental receptionist assistant:
- ✅ 5 PMS function tools with webhook authentication
- ✅ 1 transfer call tool  
- ✅ 1 end call tool

**Assistant:** Parlae Dental Receptionist (PMS Enabled)  
**ID:** `644878a7-429b-4ed1-b850-6a9aefb8176d`  
**Phone:** +1 (415) 663-5316

---

## Tools Configured

### PMS Function Tools (with Authentication)

| # | Tool | Endpoint | Auth Header | Timeout |
|---|------|----------|-------------|---------|
| 1 | `searchPatients` | `/api/pms/patients/search` | ✅ X-Vapi-Secret | 15s |
| 2 | `checkAvailability` | `/api/pms/appointments/availability` | ✅ X-Vapi-Secret | 20s |
| 3 | `bookAppointment` | `/api/pms/appointments` | ✅ X-Vapi-Secret | 20s |
| 4 | `getPatientInfo` | `/api/pms/patients` | ✅ X-Vapi-Secret | 15s |
| 5 | `createPatient` | `/api/pms/patients` | ✅ X-Vapi-Secret | 20s |

### Built-in Tools

| # | Tool | Type | Purpose |
|---|------|------|---------|
| 6 | `transferCall` | transferCall | Transfer to human (+1 415-663-5316) |
| 7 | `endCall` | endCall | End the call gracefully |

---

## Authentication Configuration

### Header-Based Authentication ✅

All function tools now include the authentication header:

```json
{
  "type": "function",
  "server": {
    "url": "https://your-domain.com/api/endpoint",
    "timeoutSeconds": 15,
    "headers": {
      "X-Vapi-Secret": "parlae-vapi-webhook-secret-change-in-production"
    }
  }
}
```

### Why This Works

1. **Vapi Server Schema:**
   - The `server` object supports `headers` (key-value pairs)
   - Does NOT support `secret` field (was incorrect in initial attempt)
   - Can also use `credentialId` to reference Vapi dashboard credentials

2. **Our Implementation:**
   - Added `X-Vapi-Secret` header to all PMS tools
   - Backend API routes verify this header
   - HMAC signature verification as secondary auth layer

3. **Security:**
   - Header is sent with every tool call
   - Backend validates before executing PMS operations
   - Audit logs track all authenticated requests

---

## Tool Type Corrections

### ❌ What Didn't Work

**Attempt 1: apiRequest type**
```javascript
// REJECTED - apiRequest is for workflows, not assistant tools
{
  type: 'apiRequest',
  apiRequest: { url, method, headers }
}
```

**Attempt 2: Using `secret` field**
```javascript
// REJECTED - `secret` field doesn't exist in Server schema
{
  server: {
    url: '...',
    secret: 'my-secret'  // ❌ Invalid field
  }
}
```

### ✅ What Works

**Correct: function type with headers**
```javascript
{
  type: 'function',
  function: {
    name: 'searchPatients',
    description: '...',
    parameters: { ... }
  },
  server: {
    url: 'https://your-api.com/endpoint',
    timeoutSeconds: 15,
    headers: {                    // ✅ Correct way
      'X-Vapi-Secret': 'your-secret'
    }
  },
  async: false
}
```

**Correct: Built-in tool types**
```javascript
// Transfer call
{
  type: 'transferCall',
  destinations: [
    {
      type: 'number',
      number: '+14156635316',
      message: 'Transferring you now...'
    }
  ]
}

// End call
{
  type: 'endCall',
  messages: [
    {
      type: 'request-complete',
      content: 'Thank you for calling!'
    }
  ]
}
```

---

## Backend API Authentication

### Vapi Webhook Verification

Each PMS API route checks two things:

```typescript
// 1. Check X-Vapi-Secret header
const secret = request.headers.get('X-Vapi-Secret');
if (secret !== process.env.VAPI_WEBHOOK_SECRET) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

// 2. Verify HMAC signature (optional but recommended)
const signature = request.headers.get('X-Vapi-Signature');
if (signature) {
  const isValid = verifyVapiSignature(body, signature);
  if (!isValid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }
}
```

### Environment Variable

```bash
# .env.local
VAPI_WEBHOOK_SECRET=parlae-vapi-webhook-secret-change-in-production
```

---

## Scripts

### Setup Tools

```bash
# Local environment (ngrok)
node scripts/setup-vapi-pms-tools.js local

# Production environment
node scripts/setup-vapi-pms-tools.js production
```

This script:
1. Creates 7 tools via Vapi API
2. Configures authentication headers
3. Attaches all tools to assistant
4. Verifies configuration

### Monitor Activity

```bash
# Watch PMS operations in real-time
./scripts/check-pms-activity.sh
```

---

## Testing

### 1. Verify in Vapi Dashboard

Visit https://dashboard.vapi.ai/tools

You should see all 7 tools with:
- ✅ Correct URLs pointing to your domain
- ✅ Authentication headers configured
- ✅ Proper timeouts set

### 2. Test via API

```bash
# Check one tool's configuration
curl -s https://api.vapi.ai/tool/32517a8a-3816-4e81-82a4-667459914c31 \
  -H "Authorization: Bearer YOUR_VAPI_KEY" \
  | jq '.server.headers'

# Should return:
# {
#   "X-Vapi-Secret": "parlae-vapi-webhook-secret-change-in-production"
# }
```

### 3. Make a Test Call

**Call:** +1 (415) 663-5316

**Test scenarios:**
```
1. Existing patient booking:
   "Hi, I'm John Smith, I want to book a cleaning appointment"

2. New patient:
   "I'm a new patient, my name is Jane Doe"

3. Check balance:
   "What's my account balance?"

4. Transfer:
   "I need to speak with someone"

5. End call:
   "Okay thanks, goodbye"
```

### 4. Monitor Logs

```bash
# Watch audit logs
./scripts/check-pms-activity.sh

# Expected output for successful tool call:
# 2026-02-09 | TOOL_CALL | searchPatients | {"query":"John Smith"}
# 2026-02-09 | SUCCESS | Found 1 patient
```

---

## Production Deployment

### Step 1: Update Environment

```bash
# Production .env
VAPI_WEBHOOK_SECRET=<strong-production-secret>
NEXT_PUBLIC_APP_URL=https://parlae.ca
```

### Step 2: Run Setup Script

```bash
node scripts/setup-vapi-pms-tools.js production
```

This will:
- Create tools pointing to `https://parlae.ca`
- Use production secret
- Update assistant configuration

### Step 3: Update Phone Number

In Vapi dashboard:
1. Go to Phone Numbers
2. Select your production number
3. Set server URL: `https://parlae.ca/api/vapi/webhook`
4. Assign assistant: Parlae Dental Receptionist (PMS Enabled)

### Step 4: Update Transfer Destination

Edit `scripts/setup-vapi-pms-tools.js`:

```javascript
{
  type: 'transferCall',
  destinations: [{
    type: 'number',
    number: '+1234567890',  // Your actual office number
    message: 'Transferring you to our office...'
  }]
}
```

Then re-run: `node scripts/setup-vapi-pms-tools.js production`

---

## Key Learnings

### 1. Tool Types Matter

- ✅ Use `function` for custom webhooks, not `apiRequest`
- ✅ `apiRequest` is for Vapi Workflows, not assistants
- ✅ Use built-in types: `transferCall`, `endCall`

### 2. Authentication Methods

Vapi supports two auth methods:

**A. Headers (what we use):**
```javascript
server: {
  headers: {
    'X-Vapi-Secret': 'your-secret'
  }
}
```

**B. Credential ID (recommended for production):**
```javascript
server: {
  credentialId: 'cred_abc123'  // Created in Vapi dashboard
}
```

### 3. Server Schema

The Vapi `Server` schema includes:
- ✅ `url` - endpoint URL
- ✅ `headers` - custom headers (including auth)
- ✅ `credentialId` - reference to dashboard credential
- ✅ `timeoutSeconds` - request timeout
- ❌ `secret` - DOES NOT EXIST

### 4. Best Practices

1. **Use descriptive tool names:** `searchPatients` not `search`
2. **Add user messages:** Keep users informed during tool execution
3. **Set appropriate timeouts:** 15-20s for most operations
4. **Enable audit logging:** Track all PMS operations
5. **Use credentialId in production:** Better security than inline headers

---

## Current Tool IDs

Local environment (ngrok):

```
searchPatients:     32517a8a-3816-4e81-82a4-667459914c31
checkAvailability:  d16caab1-6951-4122-bb51-d0ad5d321195
bookAppointment:    1d2ba352-8633-4a3b-8c08-f15ac3f35d7d
getPatientInfo:     a1ee3bc5-bcb1-4fa3-bb51-cc0b9dae5040
createPatient:      9c95e4be-7322-4e24-8c05-a3d7bbaff421
transferCall:       b4a0ea1e-1b7d-41ad-959d-9bbb23e3137d
endCall:            f7b8b6a3-985f-4cdc-93d5-98e5ca1cbd98
```

---

## Next Steps

1. ✅ Basic tools configured with authentication
2. ✅ Transfer and end call tools added
3. ⏭️ Add 6 more tools:
   - Cancel appointment
   - Reschedule appointment
   - Add patient note
   - View patient notes
   - Get insurance info
   - Process payment
4. ⏭️ Create Vapi Custom Credential for production
5. ⏭️ End-to-end testing with actual PMS data
6. ⏭️ Deploy to production

---

## Files

- **Setup Script:** `/scripts/setup-vapi-pms-tools.js`
- **API Routes:** `/apps/frontend/apps/web/app/api/pms/**/*.ts`
- **Monitor Script:** `/scripts/check-pms-activity.sh`
- **Documentation:** `/docs/VAPI_PMS_TOOLS_COMPLETE.md` (this file)

---

**Status:** ✅ Authentication working correctly  
**Last Updated:** February 9, 2026  
**Next:** Add remaining 6 PMS tools
