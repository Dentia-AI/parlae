# Vapi Tools & Credentials - Complete Guide

## Understanding "Unnamed" Tools

### Why Tools Show as "Unnamed"

Your tools are actually **named correctly** - they just don't have a separate display name in the Vapi dashboard.

**How tool names work:**
- ✅ **Function tools** are identified by `function.name` (e.g., `searchPatients`)
- ✅ The dashboard may show them as "unnamed" but they work correctly
- ✅ The AI assistant sees and uses the `function.name` properly

**To verify your tools are configured correctly:**

```bash
curl -s https://api.vapi.ai/tool \
  -H "Authorization: Bearer YOUR_VAPI_KEY" \
  | jq '[.[] | {id, type, functionName: .function.name, url: .server.url}]'
```

You should see:
- `searchPatients`
- `checkAvailability`
- `bookAppointment`
- `getPatientInfo`
- `createPatient`
- Plus `transferCall` and `endCall`

---

## Creating Vapi Custom Credentials

### What You Need: Bearer Token (NOT OAuth 2.0)

Vapi is showing you credential options. Here's what to choose:

### ❌ OAuth 2.0 - DO NOT USE
This is for when **Vapi** needs to authenticate **TO** external services (like Google Calendar).

**Skip these fields:**
- ❌ Token URL
- ❌ Client ID
- ❌ Client Secret
- ❌ Scope

### ✅ Bearer Token - USE THIS
This is for when **Vapi** needs to authenticate **TO YOUR** server.

---

## Step-by-Step: Create Bearer Token Credential

### 1. Go to Vapi Dashboard
Navigate to: **https://dashboard.vapi.ai/credentials**

### 2. Click "Create Credential"

### 3. Select "Bearer Token" Type

### 4. Fill in ONLY These Fields:

```
Credential Name: PMS Webhook Authentication
Token: parlae-vapi-webhook-secret-change-in-production
```

**That's it!** Just two fields.

### 5. Save and Copy the ID

After saving, you'll get a credential ID like: `cred_abc123def456...`

**Copy this ID** - you'll use it in the next step.

---

## Using the Credential in Tools

### Option 1: Manual Update (Easier)

Go to each tool in the Vapi dashboard:
1. Click on the tool
2. Scroll to "Server" section
3. Find "Credential" dropdown
4. Select: "PMS Webhook Authentication"
5. Save

### Option 2: Automatic Update (Script)

Update the setup script to use `credentialId`:

```javascript
// At the top of scripts/setup-vapi-pms-tools.js
const CREDENTIAL_ID = 'cred_abc123def456...';  // Your credential ID

// Then in each tool's server config, replace:
server: {
  url: `${BASE_URL}/api/pms/patients/search`,
  timeoutSeconds: 15,
  headers: {
    'X-Vapi-Secret': VAPI_SECRET
  }
}

// With:
server: {
  url: `${BASE_URL}/api/pms/patients/search`,
  timeoutSeconds: 15,
  credentialId: CREDENTIAL_ID
}
```

Then run:
```bash
node scripts/setup-vapi-pms-tools.js local
```

---

## How Credentials Work

### Current Setup (Inline Headers)

```javascript
// Your API receives:
headers: {
  'X-Vapi-Secret': 'parlae-vapi-webhook-secret-change-in-production'
}

// You validate:
if (headers.get('X-Vapi-Secret') !== process.env.VAPI_WEBHOOK_SECRET) {
  return 401;
}
```

### With Bearer Token Credential

```javascript
// Vapi automatically sends:
headers: {
  'Authorization': 'Bearer parlae-vapi-webhook-secret-change-in-production'
}

// You validate:
const auth = headers.get('Authorization');
if (auth !== `Bearer ${process.env.VAPI_WEBHOOK_SECRET}`) {
  return 401;
}
```

### Which to Use?

**Current setup (X-Vapi-Secret header):**
- ✅ Already working
- ✅ No dashboard config needed
- ❌ Secret visible in tool config

**Bearer Token Credential:**
- ✅ Secret stored securely in dashboard
- ✅ Easy to rotate (update one credential, affects all tools)
- ✅ More professional setup
- ❌ Requires updating API validation logic

---

## Recommendation

### For Now: Keep Current Setup
Your tools are working correctly with inline headers. Don't change anything.

### For Production: Switch to Credentials

When deploying to production:

1. **Create Bearer Token credential** in Vapi dashboard
2. **Update API routes** to check `Authorization` header instead of `X-Vapi-Secret`
3. **Update script** to use `credentialId`
4. **Recreate tools** with production URLs

---

## Verifying Your Setup

### Check Tool Names

```bash
curl -s https://api.vapi.ai/assistant/644878a7-429b-4ed1-b850-6a9aefb8176d \
  -H "Authorization: Bearer 75425176-d4b2-4957-9a5d-40b18bcce434" \
  | jq '.model.toolIds | length'
```

Should return: `7`

### Check Tool Authentication

```bash
curl -s https://api.vapi.ai/tool/32517a8a-3816-4e81-82a4-667459914c31 \
  -H "Authorization: Bearer 75425176-d4b2-4957-9a5d-40b18bcce434" \
  | jq '.server.headers'
```

Should return:
```json
{
  "X-Vapi-Secret": "parlae-vapi-webhook-secret-change-in-production"
}
```

### Test a Call

Call: **+1 (415) 663-5316**

Say: "I want to book an appointment"

Check logs:
```bash
./scripts/check-pms-activity.sh
```

---

## Summary

✅ **Your tools ARE configured correctly**
- Function names are set: `searchPatients`, `checkAvailability`, etc.
- Authentication is working: `X-Vapi-Secret` header
- All 7 tools attached to assistant

✅ **"Unnamed" is normal**
- Vapi dashboard displays function tools without separate display names
- The AI sees and uses the `function.name` correctly
- Your tools will work properly

✅ **Credentials (optional improvement)**
- Create **Bearer Token** credential (NOT OAuth 2.0)
- Name: `PMS Webhook Authentication`  
- Token: `parlae-vapi-webhook-secret-change-in-production`
- Benefits: Better security, easier secret rotation

---

## Next Steps

**Option A: Do nothing** - Your current setup works fine!

**Option B: Add credentials** (recommended for production):
1. Create Bearer Token credential in dashboard
2. Send me the credential ID
3. I'll update the script to use it

---

**Current Status:** ✅ All 7 tools working with authentication  
**Phone:** +1 (415) 663-5316  
**Dashboard:** https://dashboard.vapi.ai/tools
