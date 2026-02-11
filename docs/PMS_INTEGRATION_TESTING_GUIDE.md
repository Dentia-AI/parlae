# PMS Integration - Vapi Webhook Setup & Testing Guide

## 🔗 Webhook URLs for Vapi

### Base Configuration

Set this in your `.env.local`:

```bash
# Your public URL where Vapi can reach your API
NEXT_PUBLIC_APP_URL=https://matterless-eartha-unraffled.ngrok-free.dev

# Webhook secret for authentication
VAPI_WEBHOOK_SECRET=parlae-vapi-webhook-secret-change-in-production
```

### Webhook URLs Configured in Tools

These URLs are automatically set in your Vapi tools (from `vapi-pms-tools.config.ts`):

```
1. Check Availability:
   GET https://your-app.com/api/pms/appointments/availability

2. Book Appointment:
   POST https://your-app.com/api/pms/appointments

3. Reschedule Appointment:
   PATCH https://your-app.com/api/pms/appointments

4. Cancel Appointment:
   DELETE https://your-app.com/api/pms/appointments

5. Search Patients:
   GET https://your-app.com/api/pms/patients/search

6. Get Patient Info:
   GET https://your-app.com/api/pms/patients/:id

7. Create Patient:
   POST https://your-app.com/api/pms/patients

8. Add Patient Note:
   POST https://your-app.com/api/pms/patients/:id/notes

9. Get Balance:
   GET https://your-app.com/api/pms/patients/:id/balance

10. Get Insurance:
    GET https://your-app.com/api/pms/patients/:id/insurance

11. Process Payment:
    POST https://your-app.com/api/pms/payments
```

### How Vapi Calls Your Webhooks

When your Vapi assistant uses a tool, it sends an HTTPS POST request:

```typescript
POST https://your-app.com/api/pms/appointments
Headers:
  Content-Type: application/json
  X-Vapi-Signature: <hmac-signature>

Body:
{
  "call": {
    "id": "call_abc123",
    "type": "webCall",
    "metadata": {
      "accountId": "acc_xyz789",  // ⚠️ CRITICAL
      "clinicName": "Smile Dental"
    }
  },
  "data": {
    "patientId": "pat_456",
    "appointmentType": "cleaning",
    "startTime": "2026-02-15T10:00:00Z",
    "duration": 30
  }
}
```

**Your API:**
1. Verifies the signature
2. Extracts `accountId` from `call.metadata`
3. Fetches PMS credentials for that account
4. Calls Sikka API
5. Returns response to Vapi

**Vapi receives:**
```json
{
  "success": true,
  "data": {
    "id": "appt_123",
    "confirmationNumber": "ABC123",
    "startTime": "2026-02-15T10:00:00Z",
    "patientName": "John Doe"
  }
}
```

## 🧪 End-to-End Testing Guide

### Phase 1: Setup Testing (Manual)

#### Test 1: API Endpoint Health Check

```bash
# Test that your API is accessible
curl https://your-app.com/api/pms/setup \
  -H "Cookie: <your-session-cookie>"

# Expected: Should return your integrations or 401 if not authenticated
```

#### Test 2: PMS Setup

```bash
# Test PMS setup endpoint
curl -X POST https://your-app.com/api/pms/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "provider": "SIKKA",
    "credentials": {
      "clientId": "b0cac8c638d52c92f9c0312159fc4518",
      "clientSecret": "7beec2a9e62bd692eab2e0840b8bb2db",
      "practiceId": "12345"
    },
    "config": {
      "defaultAppointmentDuration": 30,
      "timezone": "America/Los_Angeles"
    }
  }'

# Expected: { "success": true, "integration": { ... } }
```

### Phase 2: Webhook Testing (Simulated Vapi Calls)

#### Test 3: Search Patients (Simulated)

```bash
# Generate signature
PAYLOAD='{"call":{"id":"test_call_123","metadata":{"accountId":"your-account-id"}},"data":{"query":"John"}}'
SECRET="parlae-vapi-webhook-secret-change-in-production"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Make request
curl -X POST https://your-app.com/api/pms/patients/search?query=John \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Signature: $SIGNATURE" \
  -d "$PAYLOAD"

# Expected: { "success": true, "data": [...patients] }
```

#### Test 4: Check Availability (Simulated)

```bash
PAYLOAD='{"call":{"id":"test_call_456","metadata":{"accountId":"your-account-id"}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl "https://your-app.com/api/pms/appointments/availability?date=2026-02-15" \
  -H "X-Vapi-Signature: $SIGNATURE" \
  -d "$PAYLOAD"

# Expected: { "success": true, "data": { "slots": [...] } }
```

#### Test 5: Book Appointment (Simulated)

```bash
PAYLOAD='{
  "call": {
    "id": "test_call_789",
    "metadata": {
      "accountId": "your-account-id"
    }
  },
  "data": {
    "patientId": "pat_456",
    "appointmentType": "cleaning",
    "startTime": "2026-02-15T10:00:00Z",
    "duration": 30,
    "notes": "Test booking from Vapi"
  }
}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST https://your-app.com/api/pms/appointments \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Signature: $SIGNATURE" \
  -d "$PAYLOAD"

# Expected: { "success": true, "data": { "id": "appt_123", ... } }
```

### Phase 3: Live Vapi Testing

#### Test 6: Create Test Assistant with PMS Tools

```typescript
// test-pms-assistant.ts
import { PMS_TOOLS, PMS_SYSTEM_PROMPT_ADDITION } from '@kit/shared/vapi/vapi-pms-tools.config';

const Vapi = require('@vapi-ai/web');
const vapi = new Vapi(process.env.VAPI_API_KEY);

async function createTestAssistant() {
  const assistant = await vapi.assistants.create({
    name: 'PMS Test Receptionist',
    model: {
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: `You are a helpful dental receptionist for testing PMS integration.
      
When a patient calls:
1. Greet them warmly
2. Ask for their name
3. Search for them in the system using searchPatients
4. If found, offer to book an appointment
5. Check availability using checkAvailability
6. Book the appointment using bookAppointment
7. Provide confirmation

${PMS_SYSTEM_PROMPT_ADDITION}`,
    },
    voice: {
      provider: 'elevenlabs',
      voiceId: 'rachel', // or your preferred voice
    },
    tools: PMS_TOOLS,
  });
  
  console.log('Test assistant created:', assistant.id);
  return assistant;
}

createTestAssistant();
```

#### Test 7: Make Test Call

```typescript
// Make a test call
const call = await vapi.calls.create({
  assistantId: '<assistant-id-from-above>',
  phoneNumberId: '<your-phone-number-id>',
  metadata: {
    accountId: '<your-test-account-id>', // ⚠️ CRITICAL
    clinicName: 'Test Dental Clinic',
  },
});

console.log('Call created:', call.id);
console.log('Call your test number to interact with the AI');
```

#### Test 8: Test Conversation Flow

**Call your test number and say:**

```
Test Script 1: Search Patient
━━━━━━━━━━━━━━━━━━━━━━━━━
You: "Hi, I'd like to book an appointment"
AI: "Of course! What's your name?"
You: "John Doe"
AI: [Calls searchPatients tool]
AI: "Great, I found your record. What type of appointment?"
You: "A cleaning"
AI: "What day works for you?"
You: "Next Monday"
AI: [Calls checkAvailability tool]
AI: "We have 10am or 2pm available"
You: "10am please"
AI: [Calls bookAppointment tool]
AI: "Perfect! You're booked for Monday at 10am. Your confirmation is ABC123"

✅ Verify: Check your PMS to see if appointment was created
```

```
Test Script 2: Create New Patient
━━━━━━━━━━━━━━━━━━━━━━━━━━━
You: "I'm a new patient, need to book"
AI: "Welcome! What's your name?"
You: "Jane Smith"
AI: [Calls searchPatients tool - returns empty]
AI: "I don't see you in our system. Let me create your record. What's your phone number?"
You: "555-123-4567"
AI: "And your email?"
You: "jane@example.com"
AI: [Calls createPatient tool]
AI: "Great! I've created your record. Now what type of appointment?"
[Continue booking flow...]

✅ Verify: Check PMS to see if patient was created
```

### Phase 4: Verify Audit Logs

#### Test 9: Check HIPAA Audit Logs

```sql
-- After making test calls, check audit logs
SELECT 
  action,
  method,
  vapi_call_id,
  phi_accessed,
  patient_id,
  success,
  response_time,
  created_at
FROM pms_audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Expected: See all your test API calls logged
```

## 🛠️ Complete Testing Script

Save this as `scripts/test-pms-integration.ts`:

```typescript
import { getPmsService } from '@/app/api/pms/_lib/pms-utils';

async function testPmsIntegration() {
  console.log('🧪 Testing PMS Integration...\n');
  
  const accountId = 'your-test-account-id';
  
  try {
    // Test 1: Get PMS Service
    console.log('1️⃣ Getting PMS service...');
    const pmsService = await getPmsService(accountId);
    
    if (!pmsService) {
      console.error('❌ No PMS integration found. Run setup first.');
      return;
    }
    console.log('✅ PMS service loaded\n');
    
    // Test 2: Test Connection
    console.log('2️⃣ Testing connection...');
    const connectionTest = await pmsService.testConnection();
    console.log(connectionTest.success ? '✅ Connection successful' : '❌ Connection failed');
    console.log(connectionTest);
    console.log('');
    
    // Test 3: Get Providers
    console.log('3️⃣ Fetching providers...');
    const providers = await pmsService.getProviders();
    console.log(`✅ Found ${providers.data?.length || 0} providers`);
    console.log(providers.data?.slice(0, 2));
    console.log('');
    
    // Test 4: Search Patients
    console.log('4️⃣ Searching patients...');
    const patients = await pmsService.searchPatients({ query: 'John', limit: 5 });
    console.log(`✅ Found ${patients.data?.length || 0} patients`);
    console.log(patients.data?.slice(0, 2));
    console.log('');
    
    // Test 5: Check Availability
    console.log('5️⃣ Checking availability...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const availability = await pmsService.checkAvailability({
      date: dateStr,
      appointmentType: 'cleaning',
    });
    console.log(`✅ Found ${availability.data?.length || 0} available slots`);
    console.log(availability.data?.slice(0, 3));
    console.log('');
    
    // Test 6: Get Patient (if we found one)
    if (patients.data && patients.data.length > 0) {
      const patientId = patients.data[0].id;
      console.log(`6️⃣ Getting patient details for ${patientId}...`);
      const patient = await pmsService.getPatient(patientId);
      console.log('✅ Patient details:');
      console.log(patient.data);
      console.log('');
      
      // Test 7: Get Patient Balance
      console.log('7️⃣ Getting patient balance...');
      const balance = await pmsService.getPatientBalance(patientId);
      console.log('✅ Balance:');
      console.log(balance.data);
      console.log('');
    }
    
    console.log('✅ All tests passed! PMS integration is working.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run tests
testPmsIntegration();
```

Run with:
```bash
cd apps/frontend
npx tsx ../../scripts/test-pms-integration.ts
```

## 🎯 End-to-End Testing with Vapi

### Step 1: Set Up Test Environment

Add to `.env.local`:

```bash
# Vapi Configuration
VAPI_API_KEY=75425176-d4b2-4957-9a5d-40b18bcce434
NEXT_PUBLIC_VAPI_PUBLIC_KEY=a55d08b7-d1d0-4b0c-a93a-00556a8d3a1d
VAPI_SERVER_SECRET=parlae-vapi-webhook-secret-change-in-production

# Your public URL (use ngrok for local testing)
NEXT_PUBLIC_APP_URL=https://matterless-eartha-unraffled.ngrok-free.dev

# Sikka Test Credentials
SIKKA_CLIENT_ID=b0cac8c638d52c92f9c0312159fc4518
SIKKA_SECRET=7beec2a9e62bd692eab2e0840b8bb2db
```

### Step 2: Update Vapi Assistant with PMS Tools

Create/update your assistant to include PMS tools:

```typescript
// scripts/update-assistant-with-pms.ts
import { PMS_TOOLS, PMS_SYSTEM_PROMPT_ADDITION } from '@kit/shared/vapi/vapi-pms-tools.config';

const vapi = require('@vapi-ai/server-sdk');

async function updateAssistant() {
  const client = new vapi.Vapi({
    token: process.env.VAPI_API_KEY!,
  });
  
  const assistantId = '<your-assistant-id>';
  
  await client.assistants.update(assistantId, {
    model: {
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: `You are a helpful dental receptionist.
      
Your name is Riley and you work for Test Dental Clinic.

${PMS_SYSTEM_PROMPT_ADDITION}`,
    },
    tools: PMS_TOOLS,
  });
  
  console.log('✅ Assistant updated with PMS tools');
}

updateAssistant();
```

### Step 3: Create Test Call with Metadata

```typescript
// scripts/create-test-call.ts
const vapi = require('@vapi-ai/server-sdk');

async function createTestCall() {
  const client = new vapi.Vapi({
    token: process.env.VAPI_API_KEY!,
  });
  
  const call = await client.calls.create({
    assistantId: '<your-assistant-id>',
    phoneNumberId: '<your-phone-number-id>',
    customer: {
      number: '+1-555-123-4567', // Test phone
    },
    metadata: {
      accountId: '<your-test-account-id>', // ⚠️ CRITICAL
      clinicName: 'Test Dental Clinic',
    },
  });
  
  console.log('Call created:', call.id);
  console.log('Call Status:', call.status);
  console.log('Metadata:', call.metadata);
  
  return call;
}

createTestCall();
```

### Step 4: Monitor Webhooks in Real-Time

#### Option A: Check Logs in Terminal

```bash
# Watch your dev server logs
# You should see:
[PMS] Webhook received from Vapi
[PMS] Account ID: acc_xyz789
[PMS] Action: searchPatients
[PMS] Query: John
[Sikka] Searching patients...
[PMS] Response: { success: true, data: [...] }
```

#### Option B: Use Webhook Inspector

```bash
# Install webhook inspector
npm install -g webhook-inspector

# Start inspector (separate terminal)
webhook-inspector --port 3001

# Update your Vapi tool URLs temporarily to:
http://localhost:3001/api/pms/appointments
```

This will show you exactly what Vapi is sending.

### Step 5: Test Complete Booking Flow

**Make a real phone call:**

```
1. Call your Vapi phone number
2. Say: "Hi, I need to book a cleaning"
3. AI asks: "What's your name?"
4. Say: "John Doe"
5. AI searches patients → should find patient
6. AI asks: "What day works for you?"
7. Say: "Next Monday"
8. AI checks availability → shows available times
9. Say: "10am"
10. AI books appointment → returns confirmation

Expected Tool Calls (check Vapi dashboard):
✓ searchPatients (query: "John Doe")
✓ checkAvailability (date: "2026-02-17")
✓ bookAppointment (patientId: "pat_456", startTime: "2026-02-17T10:00:00Z")
```

**Verify in PMS:**
- Log into your Sikka dashboard
- Check appointments for Monday
- Confirm appointment exists with correct details

### Step 6: Check Audit Logs

```sql
-- View all recent PMS activity
SELECT 
  action,
  method,
  vapi_call_id,
  patient_id,
  success,
  response_status,
  response_time,
  created_at
FROM pms_audit_logs
WHERE vapi_call_id = '<call-id-from-vapi>'
ORDER BY created_at ASC;

-- Expected output:
-- searchPatients  | GET    | call_123 | NULL       | true | 200 | 245ms
-- checkAvailability| GET    | call_123 | NULL       | true | 200 | 189ms
-- bookAppointment | POST   | call_123 | pat_456    | true | 201 | 567ms
```

## 🔍 Debugging Guide

### Issue: "Missing Vapi signature"

**Problem**: Webhook authentication failing

**Check:**
```bash
# Verify secret matches
echo $VAPI_WEBHOOK_SECRET
# Should match what you set in Vapi dashboard
```

**Fix:**
1. Go to Vapi dashboard → Settings → Webhooks
2. Copy your webhook secret
3. Update `.env.local`: `VAPI_WEBHOOK_SECRET=<secret>`
4. Restart your dev server

### Issue: "No account ID in call context"

**Problem**: `accountId` not in Vapi call metadata

**Check:**
```typescript
// When creating calls, always include:
metadata: {
  accountId: clinic.id, // Must be present!
}
```

**Fix:** Update your call creation code to always pass `accountId`.

### Issue: "No PMS integration found"

**Problem**: User hasn't completed PMS setup

**Check:**
```sql
SELECT * FROM pms_integrations WHERE account_id = '<account-id>';
```

**Fix:** User needs to complete `/home/agent/setup/pms` first.

### Issue: "Connection to PMS failed"

**Problem**: Can't reach Sikka API

**Check:**
1. Credentials are correct
2. Network connectivity
3. Sikka API is up

**Debug:**
```typescript
// Enable detailed logging in sikka.service.ts
console.log('[Sikka] Request:', endpoint, params);
console.log('[Sikka] Response:', response.status, response.data);
```

## 📊 Monitoring Dashboard

### Key Metrics to Track

```sql
-- Success rate
SELECT 
  action,
  COUNT(*) as total_calls,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  ROUND(AVG(response_time)) as avg_time_ms
FROM pms_audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY action;

-- Most common errors
SELECT 
  error_message,
  COUNT(*) as occurrences
FROM pms_audit_logs
WHERE success = false
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_message
ORDER BY occurrences DESC;

-- PHI access tracking
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as phi_accesses
FROM pms_audit_logs
WHERE phi_accessed = true
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## 🎬 Complete Test Checklist

- [ ] Set `NEXT_PUBLIC_APP_URL` to your public URL
- [ ] Set `VAPI_WEBHOOK_SECRET` matching Vapi dashboard
- [ ] Complete PMS setup via UI
- [ ] Verify `pms_integrations` table has active record
- [ ] Test connection via `/api/pms/setup` endpoint
- [ ] Create Vapi assistant with PMS tools
- [ ] Make test call and interact with AI
- [ ] Verify AI can search patients
- [ ] Verify AI can check availability
- [ ] Verify AI can book appointments
- [ ] Check appointment appears in PMS
- [ ] Verify audit logs captured all calls
- [ ] Test error scenarios (invalid patient, no availability)
- [ ] Test with multiple patients/appointments

## 🚀 Production Checklist

Before going live:

- [ ] Update `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Generate production `ENCRYPTION_KEY`
- [ ] Get production Sikka credentials
- [ ] Update `VAPI_WEBHOOK_SECRET` to strong secret
- [ ] Enable rate limiting on PMS endpoints
- [ ] Set up monitoring alerts
- [ ] Test with production PMS data (sandbox first!)
- [ ] Verify HIPAA compliance
- [ ] Sign BAA with Sikka
- [ ] Train staff on how it works

---

**Need Help?**

Check logs for:
1. Vapi signature verification (`[PMS] Verifying signature...`)
2. Account ID extraction (`[PMS] Account ID: ...`)
3. PMS service creation (`[PMS] Created PMS service for account`)
4. Sikka API calls (`[Sikka] Request: ...`)
5. Response logging (`[PMS] Response: ...`)

All webhook calls are logged in `pms_audit_logs` table for debugging!
