# ✅ Vapi PMS Tools Configuration Complete!

## 🎉 What Was Configured

Your Vapi assistant now has **5 PMS functions** configured:

| Function | Purpose | Webhook |
|----------|---------|---------|
| `searchPatients` | Find patient by name/phone/email | GET /api/pms/patients/search |
| `checkAvailability` | See available appointment slots | POST /api/pms/appointments/availability |
| `bookAppointment` | Book new appointments | POST /api/pms/appointments |
| `getPatientInfo` | Get patient details & balance | GET /api/pms/patients/:id |
| `createPatient` | Create new patient records | POST /api/pms/patients |

---

## 📍 Environment Configurations

### LOCAL (Active Now) ✅

- **Base URL:** `https://matterless-eartha-unraffled.ngrok-free.dev`
- **Functions:** 5 configured
- **Phone:** +1 (415) 663-5316
- **Status:** READY TO TEST

**Webhooks will call your LOCAL server through ngrok!**

### Production (To Configure)

Run this when ready to deploy:

```bash
node scripts/configure-vapi-pms.js production
```

This will update to:
- **Base URL:** `https://parlae.ca`
- **Functions:** Same 5 functions
- **Webhooks:** Production server

---

## 🧪 Test It Now!

### Option 1: Make a Phone Call (EASIEST)

```
📞 Call: +1 (415) 663-5316

Say: "Hi, I need to book an appointment"

AI will:
1. Ask your name
2. Search for you (searchPatients function)
3. Ask what type of appointment
4. Ask preferred date
5. Check availability (checkAvailability function)
6. Book it (bookAppointment function)
```

### Option 2: Monitor Webhooks in Real-Time

**Terminal 1:**
```bash
./scripts/check-pms-activity.sh
```

**Terminal 2:**
```bash
tail -f logs/frontend.log | grep -i pms
```

### Option 3: Web Interface Test

Open in browser:
```bash
open test-vapi-pms.html
```

Click "Start Test Call" to talk to the AI through your browser!

---

## 🔍 Verify Configuration

Check what's configured in Vapi:

```bash
curl https://api.vapi.ai/assistant/644878a7-429b-4ed1-b850-6a9aefb8176d \
  -H "Authorization: Bearer 75425176-d4b2-4957-9a5d-40b18bcce434" \
  | jq '{
    name,
    serverUrl,
    functions: .model.functions | length,
    functionNames: [.model.functions[].name]
  }'
```

Expected output:
```json
{
  "name": "Parlae Dental Receptionist (PMS Enabled)",
  "serverUrl": "https://matterless-eartha-unraffled.ngrok-free.dev/api/vapi/webhook",
  "functions": 5,
  "functionNames": [
    "searchPatients",
    "checkAvailability", 
    "bookAppointment",
    "getPatientInfo",
    "createPatient"
  ]
}
```

---

## 🔄 Switch Between Local and Production

### For Local Testing (ngrok):
```bash
node scripts/configure-vapi-pms.js local
```

### For Production (parlae.ca):
```bash
node scripts/configure-vapi-pms.js production
```

**Important:** Remember to switch back to production after local testing!

---

## 📊 After Making Test Call

Check the webhook activity:

```bash
./scripts/check-pms-activity.sh
```

Or in database:
```sql
SELECT 
  TO_CHAR(created_at, 'HH24:MI:SS') as time,
  action,
  CASE WHEN success THEN '✅' ELSE '❌' END as status,
  response_time || 'ms' as duration
FROM pms_audit_logs
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

Expected after successful call:
```
  time   |      action       | status | duration
---------|-------------------|--------|----------
 14:23:45 | bookAppointment   | ✅     | 567ms
 14:23:42 | checkAvailability | ✅     | 189ms
 14:23:39 | searchPatients    | ✅     | 245ms
```

---

## 🐛 Troubleshooting

### If Functions Don't Trigger

1. **Check serverUrl is set:**
   ```bash
   curl https://api.vapi.ai/assistant/644878a7-429b-4ed1-b850-6a9aefb8176d \
     -H "Authorization: Bearer 75425176-d4b2-4957-9a5d-40b18bcce434" \
     | jq '.serverUrl'
   ```

2. **Verify ngrok is running:**
   ```bash
   curl https://matterless-eartha-unraffled.ngrok-free.dev/api/health
   ```
   Should return: `{"status":"ok"}`

3. **Check logs for webhook calls:**
   ```bash
   tail -100 logs/frontend.log | grep -i vapi
   ```

### If Webhooks Return Errors

Check audit logs for error messages:
```sql
SELECT 
  action,
  error_message,
  response_status,
  created_at
FROM pms_audit_logs
WHERE success = false
ORDER BY created_at DESC
LIMIT 5;
```

---

## 📝 How It Works

When you call the Vapi phone number:

1. **AI answers** and talks to you
2. **When it needs data**, it calls a function:
   ```
   AI: "What's your name?"
   You: "John Doe"
   AI → Calls: searchPatients("John Doe")
   ```

3. **Vapi sends webhook** to your server:
   ```http
   POST https://matterless-eartha-unraffled.ngrok-free.dev/api/vapi/webhook
   X-Vapi-Signature: abc123...
   
   {
     "message": {
       "type": "function-call",
       "functionCall": {
         "name": "searchPatients",
         "parameters": { "query": "John Doe" }
       },
       "call": {
         "id": "call_123",
         "metadata": {
           "accountId": "beec1af2-309a-42c6-afb6-2feaaf0c74ba"
         }
       }
     }
   }
   ```

4. **Your server routes to PMS API:**
   ```
   /api/vapi/webhook 
   → /api/pms/patients/search
   → Sikka API
   → Returns results
   ```

5. **AI uses the results:**
   ```
   AI: "Great! I found you, John. What type of appointment?"
   ```

---

## 🎯 Quick Test Commands

```bash
# 1. Make sure dev server is running
# (should already be running from ./dev.sh)

# 2. Check PMS integration exists
psql postgresql://parlae:parlae@localhost:5433/parlae \
  -c "SELECT provider, status FROM pms_integrations"

# 3. Call the number
# 📞 +1 (415) 663-5316

# 4. Monitor activity
./scripts/check-pms-activity.sh
```

---

## ✅ Configuration Status

- ✅ Assistant created (ID: 644878a7-429b-4ed1-b850-6a9aefb8176d)
- ✅ Phone number assigned (+1 415-663-5316)
- ✅ 5 PMS functions configured
- ✅ Webhook URL set (local ngrok)
- ✅ Database integration active
- ✅ Test credentials loaded

**🎉 READY TO TEST! Call the number now!**

---

## 📚 Related Documentation

- `docs/VAPI_PMS_TESTING_GUIDE.md` - Complete testing guide
- `docs/PMS_E2E_TEST_RESULTS.md` - E2E test results
- `docs/PMS_SETUP_COMPLETE.md` - Full setup documentation
- `scripts/configure-vapi-pms.js` - Configuration script
- `scripts/check-pms-activity.sh` - Activity monitor

---

**Your Vapi assistant is fully configured with PMS tools! 🚀**
