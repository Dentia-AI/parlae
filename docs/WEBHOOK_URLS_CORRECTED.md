# Webhook URLs - Production Configuration

## ✅ Current Architecture (Frontend API Routes)

**Important**: Webhooks are handled by **Next.js Frontend API Routes**, not the backend. This is because:
1. OAuth callbacks need session/cookie access (which Next.js provides)
2. Frontend routes can integrate directly with frontend features (GHL sync, etc.)
3. Webhooks were already implemented in the frontend before backend routes were created

The frontend middleware (`proxy.ts`) has CSRF bypass for these webhook paths to allow external services to POST data.

---

## 🔗 Production Webhook URLs (All Backend)

Base URL: **`https://app.parlae.ca`**

### 1. Vapi Webhook (AI Voice Agent)
```
POST https://app.parlae.ca/api/vapi/webhook
```

**Purpose**: Receives call events from Vapi
- `assistant-request`: Call starting
- `status-update`: Call status changes
- `end-of-call-report`: Transcript, recording, analytics
- `function-call`: AI function execution

**Handler**: `/apps/frontend/apps/web/app/api/vapi/webhook/route.ts`

**Configure in Vapi Dashboard**:
- Server URL: `https://app.parlae.ca/api/vapi/webhook`
- Add header: `x-vapi-signature` (for verification)

**Environment Variable**: `VAPI_SERVER_SECRET`

---

### 2. Stripe Webhook (Billing/Payments)
```
POST https://app.parlae.ca/api/billing/webhook
```

**Purpose**: Handles Stripe payment events
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `invoice.paid`
- `customer.subscription.updated`

**Handler**: `/apps/frontend/apps/web/app/api/billing/webhook/route.ts`

**Configure in Stripe Dashboard**:
- Go to: Developers → Webhooks
- Add endpoint: `https://app.parlae.ca/api/stripe/webhook`
- Select events to receive
- Copy webhook signing secret

**Environment Variable**: `STRIPE_WEBHOOK_SECRET`

---

### 3. Sikka OAuth Callback (PMS Integration)
```
GET https://app.parlae.ca/api/pms/sikka/oauth/callback
```

**Purpose**: OAuth callback for Sikka Practice Management System authorization

**Handler**: `/apps/frontend/apps/web/app/api/pms/sikka/oauth/callback/route.ts`

**Configure in Sikka Dashboard**:
- Set OAuth redirect URI: `https://app.parlae.ca/api/pms/sikka/oauth/callback`
- This is already configured in your PMS setup wizard

**Environment Variables**:
- `SIKKA_APP_ID`
- `SIKKA_APP_KEY`

---

### 4. Google Calendar Callback (Calendar Integration)
```
GET https://app.parlae.ca/api/google-calendar/callback
```

**Purpose**: OAuth callback for Google Calendar authorization

**Location**: Frontend Next.js API route (OAuth requires session/cookie access)
- `apps/frontend/apps/web/app/api/google-calendar/callback/route.ts`

**Configure in Google Cloud Console**:
- Go to: APIs & Services → Credentials
- Add authorized redirect URI: `https://app.parlae.ca/api/google-calendar/callback`

**Environment Variables**:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

---

## 🔄 Request Flow (How Webhooks Work)

### Traffic Flow

```
External Service (Vapi/Stripe/Sikka)
    ↓ POST/GET https://app.parlae.ca/api/...
    ↓
CloudFront (CDN)
    ↓
ALB (Application Load Balancer)
    ├─ Priority 5: api.parlae.ca/* → Backend ❌ (not used)
    ├─ Priority 8: /api/* → Backend ❌ (only if no host match)
    └─ Priority 10: app.parlae.ca/* → Frontend ✅ (MATCHES FIRST!)
    ↓
Frontend Next.js Container (ECS)
    ↓
Middleware (proxy.ts) → CSRF Bypass for webhooks ✅
    ↓
Next.js API Route (/app/api/.../route.ts) ✅
```

### Why Webhooks Go to Frontend

1. **ALB Rule Matching**: Both host (`app.parlae.ca`) AND path (`/*`) conditions must match
   - Priority 8 only checks path `/api/*` (no host requirement)
   - Priority 10 checks host `app.parlae.ca` AND path `/*` → **Wins!**
   
2. **Frontend Has Handlers**: All webhook routes exist as Next.js API routes  
3. **CSRF Bypass**: Added to `proxy.ts` to allow external POST requests

### ⚠️ Important Notes

- **Webhooks go to Frontend** (not backend) due to ALB rule matching
- **CSRF protection bypassed** for webhook paths in `proxy.ts`
- **OAuth callbacks** require frontend for session/cookie management
- **Backend NestJS** accessible only via `api.parlae.ca` or internal calls

---

## 🧪 Testing Webhooks

### Local Development (via ngrok)

```bash
# Expose local backend
ngrok http 4000

# Use ngrok URL for webhooks
https://[your-ngrok-url].ngrok.io/api/vapi/webhook
https://[your-ngrok-url].ngrok.io/api/stripe/webhook
```

### Production Testing

```bash
# Test Vapi webhook
curl -X POST https://app.parlae.ca/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: test" \
  -d '{"message":{"type":"status-update","call":{"id":"test-123"}}}'

# Test Stripe webhook (requires valid signature)
curl -X POST https://app.parlae.ca/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: test" \
  -d '{"type":"test"}'
```

---

## 📋 Deployment Checklist

After deploying these changes:

1. ✅ Apply Terraform changes:
   ```bash
   cd parlae-infra/infra/ecs
   terraform plan
   terraform apply
   ```

2. ✅ Update webhook URLs in external services:
   - [ ] Vapi: Update server URL
   - [ ] Stripe: Update webhook endpoint
   - [ ] Sikka: Verify OAuth redirect URI
   - [ ] Google: Verify OAuth redirect URI

3. ✅ Verify environment variables are set:
   - [ ] `VAPI_SERVER_SECRET` in backend
   - [ ] `STRIPE_WEBHOOK_SECRET` in backend
   - [ ] `SIKKA_APP_ID` and `SIKKA_APP_KEY` in backend

4. ✅ Test each webhook endpoint
5. ✅ Monitor CloudWatch logs for webhook events

---

## 🔒 Security

All webhooks verify their signatures:
- **Vapi**: `x-vapi-signature` header with `VAPI_SERVER_SECRET`
- **Stripe**: `stripe-signature` header with `STRIPE_WEBHOOK_SECRET`
- **Sikka**: OAuth state parameter
- **Google**: OAuth state parameter

Never expose webhook secrets publicly!
