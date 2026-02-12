# Webhook Architecture - CORRECTED

## ✅ Proper Architecture (Backend Handles Webhooks)

**ALL external webhooks and API requests now go to the NestJS backend.**

---

## 🔧 Changes Made

### 1. Backend - Added `/api` Global Prefix

**File**: `/apps/backend/src/main.ts`

```typescript
app.setGlobalPrefix('api');
```

**Effect**: All NestJS routes now have `/api` prefix:
- `/vapi/webhook` → `/api/vapi/webhook`
- `/stripe/webhook` → `/api/stripe/webhook`  
- `/health` → `/api/health`

### 2. ALB Routing - Fixed Priority

**Changed ALB listener rules**:

| Priority | Host | Path | Target | Purpose |
|---------|------|------|--------|---------|
| 5 | `api.parlae.ca` | `/*` | Backend | Direct backend access |
| **8** | **`app.parlae.ca`** | **`/api/*`** | **Backend** | **API/Webhooks** ✓ |
| 10 | `www.parlae.ca`, `parlae.ca` | `/*` | Frontend | Marketing site |
| 11 | `app.parlae.ca` | `/*` | Frontend | App UI |

**Key Fix**: Priority 8 (lower number = higher priority) matches `/api/*` paths BEFORE Priority 11's catch-all `/*`.

---

## 🔗 Production Webhook URLs

Base URL: **`https://app.parlae.ca`**

All webhooks are handled by **NestJS Backend controllers**.

### 1. Vapi Webhook (AI Voice Agent)
```
POST https://app.parlae.ca/api/vapi/webhook
```

**Controller**: `apps/backend/src/vapi/vapi-webhook.controller.ts`

**Configure in Vapi Dashboard**:
- Server URL: `https://app.parlae.ca/api/vapi/webhook`
- Header: `x-vapi-signature` (for verification)

**Environment Variable**: `VAPI_SERVER_SECRET`

---

### 2. Stripe Webhook (Billing/Payments)
```
POST https://app.parlae.ca/api/stripe/webhook
```

**Controller**: `apps/backend/src/stripe/stripe.controller.ts`

**Configure in Stripe Dashboard**:
- Endpoint: `https://app.parlae.ca/api/stripe/webhook`
- Copy webhook signing secret

**Environment Variable**: `STRIPE_WEBHOOK_SECRET`

---

### 3. Sikka OAuth Callback (PMS Integration)
```
GET https://app.parlae.ca/api/pms/sikka/oauth/callback
```

**Controller**: `apps/backend/src/pms/pms.controller.ts`

**Configure in Sikka Dashboard**:
- Redirect URI: `https://app.parlae.ca/api/pms/sikka/oauth/callback`

**Environment Variables**:
- `SIKKA_APP_ID`
- `SIKKA_APP_KEY`

---

### 4. Google Calendar Callback (Calendar Integration)
```
GET https://app.parlae.ca/api/google-calendar/callback
```

**Location**: Frontend Next.js API route (OAuth requires session/cookie access)
- `apps/frontend/apps/web/app/api/google-calendar/callback/route.ts`

**Note**: This is the ONLY `/api/*` route that remains in the frontend because OAuth callbacks need browser session/cookie access.

---

## 🔄 Request Flow

```
External Service (Vapi/Stripe/Sikka)
    ↓
    POST https://app.parlae.ca/api/vapi/webhook
    ↓
CloudFront (CDN)
    ↓
ALB (Application Load Balancer)
    ├─ Priority 5: api.parlae.ca → Backend (if using api subdomain)
    ├─ Priority 8: app.parlae.ca + /api/* → Backend ✓
    └─ Priority 11: app.parlae.ca + /* → Frontend (UI only)
    ↓
Backend NestJS Container (ECS)
    ↓
Controller (vapi-webhook.controller.ts)
    ↓
Webhook Handler
```

---

## 🧪 Testing

### Test Backend Health
```bash
curl https://api.parlae.ca/api/health
# or
curl https://app.parlae.ca/api/health
```

**Expected**: `{"status":"ok","timestamp":"..."}`

### Test Vapi Webhook
```bash
curl -X POST https://app.parlae.ca/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: test" \
  -d '{"message":{"type":"status-update","call":{"id":"test-123"}}}'
```

**Expected**: Backend logs showing webhook received (not CSRF error)

### Test Stripe Webhook
```bash
curl -X POST https://app.parlae.ca/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: test" \
  -d '{"type":"test.event"}'
```

**Expected**: Backend processing (signature validation error is OK)

---

## 📋 Deployment Checklist

### 1. Deploy Backend Changes
```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
git add apps/backend/src/main.ts
git commit -m "Add /api global prefix to backend for proper webhook routing"
git push origin main
```

### 2. Monitor Deployment
```bash
# Watch backend logs
aws logs tail /ecs/parlae-backend --follow --region us-east-2 --profile parlae

# Check health
curl https://app.parlae.ca/api/health
```

### 3. Test Webhooks
```bash
# After deployment, test with actual webhook events from:
# - Vapi dashboard (test call)
# - Stripe dashboard (send test webhook)
# - Sikka OAuth flow
```

### 4. Update External Services

Once backend is deployed and tested, update webhook URLs in:

1. **Vapi Dashboard**
   - Server URL → `https://app.parlae.ca/api/vapi/webhook`
   
2. **Stripe Dashboard**
   - Webhook endpoint → `https://app.parlae.ca/api/stripe/webhook`
   
3. **Sikka Dashboard** 
   - OAuth redirect → `https://app.parlae.ca/api/pms/sikka/oauth/callback`

---

## 🔒 Security

- **Backend webhook handlers** verify signatures:
  - Vapi: `x-vapi-signature` header with `VAPI_SERVER_SECRET`
  - Stripe: `stripe-signature` header with `STRIPE_WEBHOOK_SECRET`
  - Sikka: OAuth state parameter

- **NO CSRF tokens required** for webhooks (they're external services)

---

## 📝 Summary

### Before (Incorrect)
- Webhooks went to frontend Next.js API routes
- CSRF protection blocking external services
- Architectural violation: frontend handling external integrations

### After (Correct)  
- **All webhooks go to backend NestJS controllers**
- ALB routes `/api/*` to backend (Priority 8)
- Proper separation: frontend = UI, backend = APIs/webhooks
- Clean architecture following best practices ✓
