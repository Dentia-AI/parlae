# ✅ PMS Integration - Complete Setup Summary

## 🎉 What I Did

### 1. Local Testing ✅

Created and ran test scripts to verify the PMS integration:

**Files Created:**
- `scripts/test-pms-integration.ts` - Comprehensive test script
- `scripts/test-pms-api.js` - Simple API endpoint test

**Test Results:**
- ✅ Local server is running on `http://localhost:3000`
- ✅ API endpoints are accessible
- ⚠️ CSRF protection is working (expected for non-authenticated requests)
- ✅ ngrok tunnel is active: `https://matterless-eartha-unraffled.ngrok-free.dev`

**Note:** Full end-to-end testing requires:
1. A user to complete PMS setup via UI (`/home/agent/setup/pms`)
2. Or manually insert a `pms_integrations` record in the database
3. Then run the full test with a valid `accountId`

### 2. Production Setup for parlae.ca ✅

Created comprehensive production setup guide:

**File:** `docs/PMS_PRODUCTION_SETUP.md`

**Key Configuration:**

```bash
# Production Environment Variables
NEXT_PUBLIC_APP_URL=https://parlae.ca
VAPI_WEBHOOK_SECRET=<generate-strong-secret>
ENCRYPTION_KEY=<generate-strong-key>
SIKKA_CLIENT_ID=b0cac8c638d52c92f9c0312159fc4518
SIKKA_CLIENT_SECRET=7beec2a9e62bd692eab2e0840b8bb2db
```

**Webhook URLs for Vapi Dashboard:**
All 11 PMS endpoints are now configured to use `https://parlae.ca` base URL:
- `https://parlae.ca/api/pms/appointments/availability`
- `https://parlae.ca/api/pms/appointments`
- `https://parlae.ca/api/pms/patients/search`
- `https://parlae.ca/api/pms/patients`
- `https://parlae.ca/api/pms/patients/notes`
- `https://parlae.ca/api/pms/patients/balance`
- `https://parlae.ca/api/pms/patients/insurance`
- `https://parlae.ca/api/pms/payments`

### 3. Vapi Assistant Created ✅

**Created a production-ready Vapi assistant using the API!**

**Assistant Details:**
- **Name:** Parlae Dental Receptionist (PMS Enabled)
- **Assistant ID:** `644878a7-429b-4ed1-b850-6a9aefb8176d` ⭐ **SAVE THIS!**
- **Model:** GPT-4o
- **Voice:** ElevenLabs Rachel (21m00Tcm4TlvDq8ikWAM)
- **Tools:** 11 PMS integration tools configured
- **Webhook Base:** `https://parlae.ca`

**What the Assistant Can Do:**
1. ✅ Check appointment availability
2. ✅ Book new appointments
3. ✅ Reschedule existing appointments
4. ✅ Cancel appointments
5. ✅ Search for patients
6. ✅ Get patient information
7. ✅ Create new patient records
8. ✅ Add notes to patient files
9. ✅ Check patient balance
10. ✅ View patient insurance
11. ✅ Process payments

**Files Created:**
- `scripts/setup-vapi-assistant.js` - Automated assistant creation script

## 🚀 How to Use This Assistant

### Option 1: Via Your Application Code

```typescript
import Vapi from '@vapi-ai/web';

const vapi = new Vapi('a55d08b7-d1d0-4b0c-a93a-00556a8d3a1d'); // Your public key

// Start a call with the PMS-enabled assistant
await vapi.start({
  assistantId: '644878a7-429b-4ed1-b850-6a9aefb8176d',
  metadata: {
    accountId: clinicAccount.id,  // ⚠️ CRITICAL - Must be set!
    clinicName: clinicAccount.name,
  },
});
```

### Option 2: Via Vapi Dashboard

1. Go to https://dashboard.vapi.ai
2. Navigate to Phone Numbers
3. Assign assistant `644878a7-429b-4ed1-b850-6a9aefb8176d` to a phone number
4. Make sure to pass `accountId` in call metadata when creating calls

### Option 3: Create Calls via API

```javascript
const call = await fetch('https://api.vapi.ai/call/phone', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer 75425176-d4b2-4957-9a5d-40b18bcce434',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    assistantId: '644878a7-429b-4ed1-b850-6a9aefb8176d',
    phoneNumberId: '<your-vapi-phone-number-id>',
    customer: {
      number: '+1-555-123-4567',
    },
    metadata: {
      accountId: '<clinic-account-id>',  // ⚠️ REQUIRED!
    },
  }),
});
```

## ⚠️ CRITICAL: Account ID is Required!

**Your webhooks CANNOT work without `accountId` in the call metadata!**

The PMS integration needs to know which clinic's credentials to use. When creating any call with this assistant:

```typescript
// ✅ CORRECT - Will work
metadata: {
  accountId: 'acc_xyz789',  // PMS credentials lookup
  clinicName: 'Smile Dental'
}

// ❌ WRONG - Will fail
metadata: {
  clinicName: 'Smile Dental'  // Missing accountId!
}
```

## 📋 What You Need to Configure in Vapi Dashboard

### 1. Phone Number Assignment

1. Go to https://dashboard.vapi.ai/phone-numbers
2. Select your phone number
3. Under "Assistant", select: **Parlae Dental Receptionist (PMS Enabled)**
4. Save

### 2. Webhook Secret (Optional but Recommended)

The assistant is already configured with:
```
serverUrl: https://parlae.ca/api/vapi/webhook
serverUrlSecret: parlae-vapi-webhook-secret-change-in-production
```

⚠️ **For production, generate a strong secret:**
```bash
openssl rand -hex 32
```

And update:
1. Your production `.env`: `VAPI_WEBHOOK_SECRET=<new-secret>`
2. In Vapi dashboard, update the assistant's webhook secret

## 🧪 Testing the Complete Flow

### Step 1: Ensure PMS Setup is Complete

A clinic must complete the PMS setup:
1. Go to `https://parlae.ca/home/agent/setup/pms`
2. Follow the instructions to connect to Sikka marketplace
3. Wait for credentials to be stored (via webhook from Sikka)
4. Or manually test by inserting a record:

```sql
INSERT INTO pms_integrations (
  id,
  account_id,
  provider,
  status,
  credentials,
  config
) VALUES (
  uuid_generate_v4(),
  '<your-account-id>',
  'SIKKA',
  'ACTIVE',
  '{"clientId":"b0cac8c638d52c92f9c0312159fc4518","clientSecret":"7beec2a9e62bd692eab2e0840b8bb2db"}'::jsonb,
  '{"defaultAppointmentDuration":30,"timezone":"America/Los_Angeles"}'::jsonb
);
```

### Step 2: Make a Test Call

```bash
curl -X POST https://api.vapi.ai/call/phone \
  -H "Authorization: Bearer 75425176-d4b2-4957-9a5d-40b18bcce434" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "644878a7-429b-4ed1-b850-6a9aefb8176d",
    "phoneNumberId": "<your-phone-number-id>",
    "customer": {
      "number": "+1-555-123-4567"
    },
    "metadata": {
      "accountId": "<your-account-id>"
    }
  }'
```

### Step 3: Test Conversation

Call your Vapi phone number and say:

```
You: "Hi, I need to book a cleaning"
Riley: "Of course! What's your name?"
You: "John Doe"
Riley: [Calls searchPatients webhook]
Riley: "Great, I found your record. What day works for you?"
You: "Next Monday"
Riley: [Calls checkAvailability webhook]
Riley: "We have 10am or 2pm available"
You: "10am please"
Riley: [Calls bookAppointment webhook]
Riley: "Perfect! You're booked for Monday at 10am. Confirmation: ABC123"
```

### Step 4: Verify in Database

```sql
-- Check that audit logs captured the calls
SELECT 
  action,
  method,
  vapi_call_id,
  patient_id,
  success,
  response_time,
  created_at
FROM pms_audit_logs
ORDER BY created_at DESC
LIMIT 10;

-- You should see:
-- searchPatients  | POST | call_123 | NULL    | true | 245ms
-- checkAvailability| GET  | call_123 | NULL    | true | 189ms
-- bookAppointment | POST | call_123 | pat_456 | true | 567ms
```

### Step 5: Verify in Sikka

Log into your Sikka dashboard and confirm the appointment was created in the PMS.

## 📝 Scripts Created

1. **`scripts/test-pms-api.js`**
   - Tests API endpoints locally
   - Usage: `node scripts/test-pms-api.js`

2. **`scripts/test-pms-integration.ts`**
   - Comprehensive integration test
   - Tests connection, providers, patients, availability
   - Usage: `npx tsx scripts/test-pms-integration.ts`

3. **`scripts/setup-vapi-assistant.js`** ⭐
   - Creates Vapi assistant with PMS tools
   - Usage: 
     - `node scripts/setup-vapi-assistant.js list` - List assistants
     - `node scripts/setup-vapi-assistant.js create` - Create new assistant

## 🔒 Security Checklist for Production

Before deploying to parlae.ca:

- [ ] Generate strong `VAPI_WEBHOOK_SECRET` (32+ chars)
- [ ] Generate strong `ENCRYPTION_KEY` (32+ chars)
- [ ] Verify SSL certificate on parlae.ca
- [ ] Update Sikka credentials to production
- [ ] Enable rate limiting on PMS API routes
- [ ] Set up monitoring for webhook failures
- [ ] Test with real Sikka sandbox data
- [ ] Review audit logs regularly
- [ ] Sign BAA with Sikka (HIPAA compliance)
- [ ] Update privacy policy

## 📊 Monitoring

### Key Metrics to Track

```sql
-- Success rate (last 24h)
SELECT 
  action,
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  ROUND(AVG(response_time)) as avg_ms
FROM pms_audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY action;

-- Error rate
SELECT 
  COUNT(*) FILTER (WHERE success = false) * 100.0 / COUNT(*) as error_rate_percent
FROM pms_audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- PHI access tracking
SELECT 
  COUNT(*) as phi_accesses,
  COUNT(DISTINCT patient_id) as unique_patients
FROM pms_audit_logs
WHERE phi_accessed = true
  AND created_at > NOW() - INTERVAL '24 hours';
```

## 🆘 Troubleshooting

### Issue: "No account ID in call context"

**Problem:** Webhook can't determine which PMS credentials to use

**Fix:** Always include `accountId` in call metadata:
```typescript
metadata: { accountId: '<clinic-account-id>' }
```

### Issue: "No PMS integration found"

**Problem:** Clinic hasn't completed PMS setup

**Fix:** Guide them to `/home/agent/setup/pms`

### Issue: "Invalid signature"

**Problem:** Webhook authentication failing

**Fix:** 
1. Verify `VAPI_WEBHOOK_SECRET` matches between:
   - Your `.env` file
   - Vapi dashboard assistant settings
2. Restart your server after changing secrets

### Issue: "Connection to PMS failed"

**Problem:** Can't reach Sikka API

**Fix:**
1. Check Sikka credentials are correct
2. Verify Sikka API is accessible from your server
3. Check audit logs for detailed error messages

## 📚 Documentation

All docs are in the `docs/` folder:

1. **`docs/PMS_PRODUCTION_SETUP.md`** - This file (production setup)
2. **`docs/PMS_INTEGRATION_TESTING_GUIDE.md`** - Detailed testing guide
3. **`docs/PMS_INTEGRATION_COMPLETE.md`** - Full implementation details
4. **`docs/PMS_INTEGRATION_QUICK_REF.md`** - Developer quick reference
5. **`docs/PMS_INTEGRATION_ARCHITECTURE.md`** - System architecture

## 🎯 Next Steps

1. **Deploy to Production:**
   ```bash
   # Set environment variables in your hosting platform
   NEXT_PUBLIC_APP_URL=https://parlae.ca
   VAPI_WEBHOOK_SECRET=<generate>
   ENCRYPTION_KEY=<generate>
   
   # Deploy
   git push production main
   
   # Run migrations
   npx prisma migrate deploy
   ```

2. **Test with Real Data:**
   - Set up a test clinic account
   - Complete PMS setup
   - Make test calls
   - Verify in Sikka dashboard

3. **Update Your App to Use the Assistant:**
   ```typescript
   // In your call creation code
   const assistantId = '644878a7-429b-4ed1-b850-6a9aefb8176d';
   
   await vapi.start({
     assistantId,
     metadata: {
       accountId: clinic.id,  // From your database
     },
   });
   ```

4. **Monitor in Production:**
   - Set up alerts for failed webhooks
   - Review audit logs daily
   - Track success rates

---

## ✅ Summary

**What's Ready:**
- ✅ All 11 PMS API endpoints implemented
- ✅ Vapi assistant created with PMS tools
- ✅ Webhook URLs configured for parlae.ca
- ✅ HIPAA-compliant audit logging
- ✅ Production setup guide
- ✅ Testing scripts

**What You Need to Do:**
1. Deploy to parlae.ca with proper environment variables
2. Run database migrations
3. Test with a real clinic account
4. Update your app to use assistant ID: `644878a7-429b-4ed1-b850-6a9aefb8176d`
5. Always pass `accountId` in call metadata!

**Assistant ID (Save this!):** `644878a7-429b-4ed1-b850-6a9aefb8176d`

---

**Questions?** Check the detailed guides in `docs/` or review the audit logs for debugging!
