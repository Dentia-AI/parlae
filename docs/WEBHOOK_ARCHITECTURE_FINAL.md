# Webhook Architecture - FINAL

## ✅ Clean Architecture: `api.parlae.ca` for Backend

**All external webhooks and backend APIs use `api.parlae.ca` subdomain.**

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     External Services                        │
│              (Vapi, Stripe, Sikka, etc.)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              https://api.parlae.ca/vapi/webhook
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                    CloudFront + ALB                          │
│  Priority 5: api.parlae.ca → Backend NestJS                │
│  Priority 10: www.parlae.ca, parlae.ca → Frontend (Marketing)│
│  Priority 11: app.parlae.ca → Frontend (App UI)             │
└─────────────────────────┬───────────────────────────────────┘
                          │
            ┌─────────────┴──────────────┐
            │                            │
            ▼                            ▼
    ┌──────────────┐            ┌──────────────┐
    │   Backend    │            │  Frontend    │
    │  NestJS      │◄───────────│  Next.js     │
    │  (ECS)       │ internal   │  (ECS)       │
    └──────────────┘  calls     └──────────────┘
                                        ▲
                                        │
                                    Browser
                                 (app.parlae.ca)
```

### Request Flows

**1. External Webhook**:
```
Vapi/Stripe → api.parlae.ca/vapi/webhook → Backend NestJS Controller
```

**2. Frontend API Route**:
```
Browser → app.parlae.ca/api/analytics/calls → Next.js API Route
                                              ↓
                              BACKEND_API_URL (api.parlae.ca) → Backend NestJS
```

**3. Frontend UI**:
```
Browser → app.parlae.ca/home → Next.js SSR → HTML
```

---

## 🔗 Production Webhook URLs

Base URL: **`https://api.parlae.ca`**

### 1. Vapi Webhook (AI Voice Agent)
```
POST https://api.parlae.ca/vapi/webhook
```

**Controller**: `apps/backend/src/vapi/vapi-webhook.controller.ts`

```typescript
@Controller('vapi')
export class VapiWebhookController {
  @Post('webhook')
  async handleWebhook(@Body() payload, @Headers('x-vapi-signature') signature) {
    // Handle Vapi call events
  }
}
```

**Configure in Vapi Dashboard**:
- Server URL: `https://api.parlae.ca/vapi/webhook`
- Header: `x-vapi-signature`

---

### 2. Stripe Webhook (Billing/Payments)
```
POST https://api.parlae.ca/stripe/webhook
```

**Controller**: `apps/backend/src/stripe/stripe.controller.ts`

```typescript
@Controller('stripe')
export class StripeController {
  @Post('webhook')
  async handleWebhook(@Req() request: RawBodyRequest<Request>) {
    // Verify Stripe signature and process events
  }
}
```

**Configure in Stripe Dashboard**:
- Endpoint: `https://api.parlae.ca/stripe/webhook`

---

### 3. Sikka OAuth Callback (PMS Integration)
```
GET https://api.parlae.ca/pms/sikka/oauth/callback
```

**Controller**: `apps/backend/src/pms/pms.controller.ts`

```typescript
@Controller('pms')
export class PmsController {
  @Get('sikka/oauth/callback')
  async handleCallback(@Query('code') code, @Query('state') state) {
    // Exchange OAuth code for token
  }
}
```

**Configure in Sikka Dashboard**:
- Redirect URI: `https://api.parlae.ca/pms/sikka/oauth/callback`

---

### 4. Google Calendar Callback (Special Case)
```
GET https://app.parlae.ca/api/google-calendar/callback
```

**Location**: Frontend Next.js API route
- `apps/frontend/apps/web/app/api/google-calendar/callback/route.ts`

**Why Frontend?**: OAuth callbacks need browser session/cookie access for the user's account context.

---

## 🔄 ALB Routing Rules

| Priority | Host | Path | Target | Purpose |
|---------|------|------|--------|---------|
| **5** | **`api.parlae.ca`** | **`/*`** | **Backend** | **All backend APIs/webhooks** ✓ |
| 10 | `www.parlae.ca`, `parlae.ca` | `/*` | Frontend | Marketing site |
| 11 | `app.parlae.ca` | `/*` | Frontend | App UI + Next.js API routes |

**Simplicity**: Only 3 rules needed!

---

## 🌐 Frontend-to-Backend Communication

**Environment Variable** (Frontend):
```bash
BACKEND_API_URL=https://api.parlae.ca
```

**Next.js API Route Example**:
```typescript
// apps/frontend/apps/web/app/api/analytics/calls/route.ts

export async function GET(request: Request) {
  const backendUrl = process.env.BACKEND_API_URL;
  
  // Call backend from server-side
  const response = await fetch(`${backendUrl}/analytics/calls`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return response.json();
}
```

**Note**: Browser NEVER calls `api.parlae.ca` directly - only Next.js server-side code does.

---

## 🔒 Security

### 1. External Webhooks
- **Vapi**: Signature verification via `x-vapi-signature` + `VAPI_SERVER_SECRET`
- **Stripe**: Signature verification via `stripe-signature` + `STRIPE_WEBHOOK_SECRET`
- **Sikka**: OAuth state parameter validation

### 2. Frontend-to-Backend
- Internal calls use `BACKEND_API_URL` (server-side only)
- No browser exposure
- Can use internal tokens/secrets

### 3. CORS
- Backend CORS allows frontend origin: `app.parlae.ca`
- Browser never calls backend directly, so CORS is minimal concern

---

## 🧪 Testing

### Test Backend Health
```bash
curl https://api.parlae.ca/health
```

**Expected**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T18:55:00.000Z"
}
```

### Test Vapi Webhook
```bash
curl -X POST https://api.parlae.ca/vapi/webhook \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: test-signature" \
  -d '{
    "message": {
      "type": "status-update",
      "call": {"id": "test-123"}
    }
  }'
```

**Expected**: Backend logs showing webhook received

### Test Stripe Webhook
```bash
curl -X POST https://api.parlae.ca/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: test-signature" \
  -d '{"type": "test.event", "id": "evt_123"}'
```

---

## 📋 Deployment Checklist

### 1. Backend Changes (Already Done)
- ✅ Backend has NO `/api` prefix
- ✅ Routes are clean: `/vapi/webhook`, `/health`, etc.

### 2. ALB Configuration (Already Done)
- ✅ Priority 5: `api.parlae.ca → Backend`
- ✅ Priority 8: Deleted (not needed)
- ✅ Priority 11: `app.parlae.ca → Frontend`

### 3. Deploy Backend
```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
git add apps/backend/src/main.ts
git commit -m "Backend: use clean routes without /api prefix for api.parlae.ca"
git push origin main
```

### 4. Update External Services

**Vapi Dashboard**:
- Server URL: `https://api.parlae.ca/vapi/webhook`

**Stripe Dashboard**:
- Webhook endpoint: `https://api.parlae.ca/stripe/webhook`

**Sikka Dashboard**:
- OAuth redirect: `https://api.parlae.ca/pms/sikka/oauth/callback`

### 5. Verify Environment Variables

**Frontend** (`/parlae/frontend/...`):
```bash
BACKEND_API_URL=https://api.parlae.ca
```

**Backend** (`/parlae/backend/...`):
```bash
VAPI_SERVER_SECRET=<secret>
STRIPE_WEBHOOK_SECRET=<secret>
SIKKA_APP_ID=<id>
SIKKA_APP_KEY=<key>
```

---

## 📊 Why This Architecture?

### ✅ Advantages

1. **Clean Separation**:
   - `api.parlae.ca` = Backend APIs (webhooks, server-to-server)
   - `app.parlae.ca` = Frontend UI (browser, Next.js)
   - Clear responsibility boundaries

2. **Simpler Routes**:
   - Backend routes: `/vapi/webhook` (not `/api/vapi/webhook`)
   - No global prefix needed

3. **Better Caching**:
   - CloudFront can apply different rules per subdomain
   - Backend: no caching
   - Frontend: aggressive caching for static assets

4. **Security**:
   - Backend not exposed to browser
   - All browser requests go through Next.js (rate limiting, validation)

5. **Scalability**:
   - Can scale backend and frontend independently
   - Can add more backend services at `api.parlae.ca/*`

6. **Industry Standard**:
   - Stripe uses `api.stripe.com`
   - GitHub uses `api.github.com`
   - Twilio uses `api.twilio.com`

---

## 🎯 Summary

### Request Patterns

| From | To | Example |
|------|-----|---------|
| External Service | `api.parlae.ca/...` | Vapi → `/vapi/webhook` |
| Browser | `app.parlae.ca/...` | User → `/home` |
| Next.js API | `api.parlae.ca/...` | Server → `/analytics/calls` |

### Key Points

- ✅ Browser NEVER calls backend directly
- ✅ All webhooks use `api.parlae.ca`
- ✅ Frontend server-side calls use `BACKEND_API_URL`
- ✅ Clean, simple, industry-standard architecture
