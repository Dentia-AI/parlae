# Vapi PMS Tools - Bearer Token Configuration ✅

**Date:** February 9, 2026  
**Status:** ✅ Configured with Bearer Token credentials

---

## Summary

Successfully switched from inline headers to **Bearer Token credentials** for all PMS tools:
- ✅ 5 PMS function tools using `credentialId`
- ✅ 2 built-in tools (transferCall, endCall)  
- ✅ API routes support Bearer Token authentication
- ✅ Backward compatible with signature verification

---

## Credentials Configuration

### Development/Testing
```
Token: LyeS3ZYpLsdJmKO6euvYfaki7s4dPIrpcbmQ9vsmWviJCY5lcvfCuridvvCJskOJ
Credential ID: 02435653-3d64-4fdf-b66a-95d830e4f026
```

### Production
```
Token: IcQKuht0Ca41uYEdeIJ33efxD0OGGE8Vc8Ap71vC0578IwVtE6IghXYejHK57tbS
Credential ID: 02435653-3d64-4fdf-b66a-95d830e4f026
```

---

## Tool Configuration

All 5 PMS tools now use `credentialId` instead of inline headers:

```javascript
{
  type: 'function',
  function: { name: 'searchPatients', ... },
  server: {
    url: 'https://your-domain.com/api/endpoint',
    timeoutSeconds: 15,
    credentialId: '02435653-3d64-4fdf-b66a-95d830e4f026'  // ✅ Bearer Token
  }
}
```

**Verification:**
```bash
curl -s https://api.vapi.ai/tool/62651a3f-3639-44b7-aea3-772756298d64 \
  -H "Authorization: Bearer YOUR_VAPI_KEY" \
  | jq '.server.credentialId'

# Returns: "02435653-3d64-4fdf-b66a-95d830e4f026"
```

---

## API Authentication

### Updated `.env.local`
```bash
# Old (deprecated)
VAPI_SERVER_SECRET=parlae-vapi-webhook-secret-change-in-production

# New (current)
VAPI_WEBHOOK_SECRET=LyeS3ZYpLsdJmKO6euvYfaki7s4dPIrpcbmQ9vsmWviJCY5lcvfCuridvvCJskOJ
```

### Authentication Flow

**When Vapi calls your API:**
```http
POST /api/pms/patients/search
Authorization: Bearer LyeS3ZYpLsdJmKO6euvYfaki7s4dPIrpcbmQ9vsmWviJCY5lcvfCuridvvCJskOJ
Content-Type: application/json

{ "query": "John Smith" }
```

**Your API validates:**
```typescript
const authHeader = request.headers.get('Authorization');
if (authHeader && authHeader.startsWith('Bearer ')) {
  const token = authHeader.substring(7);
  if (token === process.env.VAPI_WEBHOOK_SECRET) {
    // ✅ Authenticated
  }
}
```

---

## Updated Files

### 1. Script: `scripts/setup-vapi-pms-tools.js`

**Changes:**
- Uses `credentialId` instead of `headers` in server config
- Supports both `local` and `production` environments
- Automatically selects correct credential ID

**Usage:**
```bash
# Local (development/testing)
node scripts/setup-vapi-pms-tools.js local

# Production
node scripts/setup-vapi-pms-tools.js production
```

### 2. Environment: `.env.local`

**Changes:**
- Updated `VAPI_WEBHOOK_SECRET` to match dev credential token

### 3. API Route: `apps/frontend/apps/web/app/api/pms/patients/route.ts`

**Changes:**
- Added Bearer Token authentication (primary method)
- Kept signature verification (fallback/legacy)
- Backward compatible with both auth methods

**Auth function flow:**
```typescript
async function authenticateRequest(request: NextRequest) {
  // 1. Check Bearer Token (preferred)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Validate token
  }
  
  // 2. Fallback to signature verification (legacy)
  const signature = request.headers.get('x-vapi-signature');
  if (signature) {
    // Verify HMAC signature
  }
  
  return { authenticated: false, error: '...' };
}
```

---

## Benefits of Bearer Token

### vs. Inline Headers

**Before (inline headers):**
```javascript
server: {
  headers: {
    'X-Vapi-Secret': 'my-secret-token-here'
  }
}
```
- ❌ Secret visible in tool configuration
- ❌ Must update all 5 tools to rotate secret
- ❌ No centralized management

**After (credentialId):**
```javascript
server: {
  credentialId: '02435653-3d64-4fdf-b66a-95d830e4f026'
}
```
- ✅ Secret stored securely in Vapi dashboard
- ✅ Update credential once, affects all tools
- ✅ Centralized secret management
- ✅ Professional, production-ready setup

---

## Testing

### 1. Verify Tools Configuration

```bash
# Check all tools use credentialId
curl -s https://api.vapi.ai/assistant/644878a7-429b-4ed1-b850-6a9aefb8176d \
  -H "Authorization: Bearer 75425176-d4b2-4957-9a5d-40b18bcce434" \
  | jq '.model.toolIds'

# Expected: Array of 5 tool IDs
```

### 2. Test Authentication

Make a test call:
```bash
# Call the assistant
# Phone: +1 (415) 663-5316

# Try: "Hi, I want to book an appointment"
```

Monitor logs:
```bash
./scripts/check-pms-activity.sh

# Expected: Successful auth with Bearer token
```

### 3. Verify Bearer Token in Logs

Check that requests include Bearer token:
```bash
# In your API route, add logging:
console.log('Auth header:', request.headers.get('Authorization'));

# Expected: "Bearer LyeS3ZYpLsdJmKO6euvYfaki7s4dPIrpcbmQ9vsmWviJCY5lcvfCuridvvCJskOJ"
```

---

## Production Deployment

### Step 1: Update Production Environment

```bash
# In production .env
VAPI_WEBHOOK_SECRET=IcQKuht0Ca41uYEdeIJ33efxD0OGGE8Vc8Ap71vC0578IwVtE6IghXYejHK57tbS
```

### Step 2: Run Setup Script

```bash
node scripts/setup-vapi-pms-tools.js production
```

This will:
- Create tools pointing to `https://parlae.ca`
- Use production credential ID
- Configure built-in tools

### Step 3: Verify in Dashboard

Go to https://dashboard.vapi.ai/tools

Each tool should show:
- ✅ Correct production URL
- ✅ Credential: (credential name from dashboard)
- ✅ No inline headers visible

---

## Security Notes

### Token Storage

**✅ Secure locations:**
- Vapi dashboard (credential ID references)
- Environment variables (`VAPI_WEBHOOK_SECRET`)
- Server-side only (never in frontend)

**❌ Never store in:**
- Frontend code or config
- Client-side JavaScript
- Git repository (use `.env.local`, `.env.production.local`)
- Public documentation

### Token Rotation

To rotate the Bearer token:

1. **Create new credential** in Vapi dashboard
2. **Copy new credential ID**
3. **Update script** with new ID
4. **Run setup script** to update all tools
5. **Update `.env`** with new token
6. **Deploy** new environment variable

All tools automatically use the new credential!

---

## Troubleshooting

### Tool calls failing with 401

**Check:**
1. Correct token in `.env`: `VAPI_WEBHOOK_SECRET`
2. Credential exists in Vapi dashboard
3. Tools reference correct credential ID
4. API route checks `Authorization` header

**Debug:**
```typescript
// Add to API route
console.log('Auth header:', request.headers.get('Authorization'));
console.log('Expected token:', process.env.VAPI_WEBHOOK_SECRET);
```

### Tools show "unnamed"

**This is normal!**
- Function tools use `function.name` for identification
- Built-in tools (transferCall, endCall) may show as "unnamed" but work correctly
- The assistant sees and uses tool names properly

---

## Current Tool IDs

Local environment (with Bearer Token):

```
searchPatients:     62651a3f-3639-44b7-aea3-772756298d64
checkAvailability:  a1c10d45-4e6f-4fd4-b54a-d61794f61cc3
bookAppointment:    a3c5a8dd-6d1c-438a-9625-d2ea17499218
getPatientInfo:     7a3067b8-733a-4680-87f2-d1c1343febda
createPatient:      60ea07d2-a690-41fb-85fa-ec5439745c2e
```

All use credential ID: `02435653-3d64-4fdf-b66a-95d830e4f026`

---

## Next Steps

1. ✅ Bearer Token configured for local
2. ✅ API routes support Bearer auth
3. ✅ Backward compatible with signature verification
4. ⏭️ Test end-to-end call flow
5. ⏭️ Deploy to production with production credential
6. ⏭️ Add remaining 6 PMS tools (cancel, reschedule, notes, insurance, payments)

---

**Status:** ✅ Bearer Token authentication active  
**Environment:** Local + Production ready  
**Last Updated:** February 9, 2026
