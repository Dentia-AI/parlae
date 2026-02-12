# Webhook URLs - Production Configuration

## ✅ Corrected Architecture

After fixing the ALB routing (priority 8 for `/api/*` → Backend), all webhook URLs now correctly route to the **NestJS backend** service.

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

**Controller**: `apps/backend/src/vapi/vapi-webhook.controller.ts`

**Configure in Vapi Dashboard**:
- Server URL: `https://app.parlae.ca/api/vapi/webhook`
- Add header: `x-vapi-signature` (for verification)

**Environment Variable**: `VAPI_SERVER_SECRET`

---

### 2. Stripe Webhook (Billing/Payments)
```
POST https://app.parlae.ca/api/stripe/webhook
```

**Purpose**: Handles Stripe payment events
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `invoice.paid`
- `customer.subscription.updated`

**Controller**: `apps/backend/src/stripe/stripe.controller.ts` (line 84)

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

**Controller**: `apps/backend/src/pms/pms.controller.ts` (line 51)

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

## 🔄 ALB Routing Configuration

### Priority Order (Lower = Higher Priority)

1. **Priority 5**: Backend hostname (if configured)
   - `backend.parlae.ca/*` → Backend

2. **Priority 8**: API routes → **Backend** ✅
   - `/api/*` → Backend NestJS (port 4000)

3. **Priority 10+**: Frontend routes
   - `app.parlae.ca/*` → Frontend Next.js (port 3000)

### ⚠️ Important Notes

- All `/api/*` requests now go to the backend first
- OAuth callbacks use frontend for session/cookie management
- Webhooks use backend for event processing
- Frontend communicates with backend via `BACKEND_API_URL` internally

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
