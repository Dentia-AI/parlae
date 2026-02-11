# Sikka PMS Test Account Credentials

## 🧪 Test Account Details

Use these credentials for testing the PMS integration with Sikka's test environment:

### Practice Information

| Field | Value |
|-------|-------|
| **Master Customer ID** | D36225 |
| **Practice ID** | 1 |
| **Practice Name** | Test_Sheetal 4 |
| **Practice Key** | 84A9439BD3627374VGUV |
| **SPU Installation Key** | STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0= |

### API Credentials

| Field | Value |
|-------|-------|
| **Application ID** | b0cac8c638d52c92f9c0312159fc4518 |
| **Application Secret Key** | 7beec2a9e62bd692eab2e0840b8bb2db |

## 🔧 How to Use for Testing

### Option 1: Via UI Setup

1. Go to `http://localhost:3000/home/agent/setup/pms` (or production URL)
2. Click "Connect PMS"
3. The system will guide you through Sikka marketplace connection
4. For testing, you can manually insert credentials (see below)

### Option 2: Manual Database Insert (Testing Only)

```sql
-- Insert test PMS integration
INSERT INTO pms_integrations (
  id,
  account_id,
  provider,
  status,
  credentials,
  config,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<your-test-account-id>',  -- Replace with your account ID
  'SIKKA',
  'ACTIVE',
  jsonb_build_object(
    'clientId', 'b0cac8c638d52c92f9c0312159fc4518',
    'clientSecret', '7beec2a9e62bd692eab2e0840b8bb2db',
    'practiceId', '1'
  ),
  jsonb_build_object(
    'defaultAppointmentDuration', 30,
    'timezone', 'America/Los_Angeles',
    'masterCustomerId', 'D36225',
    'practiceKey', '84A9439BD3627374VGUV'
  ),
  NOW(),
  NOW()
);
```

### Option 3: Via API

```bash
curl -X POST http://localhost:3000/api/pms/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "provider": "SIKKA",
    "credentials": {
      "clientId": "b0cac8c638d52c92f9c0312159fc4518",
      "clientSecret": "7beec2a9e62bd692eab2e0840b8bb2db",
      "practiceId": "1"
    },
    "config": {
      "defaultAppointmentDuration": 30,
      "timezone": "America/Los_Angeles",
      "masterCustomerId": "D36225",
      "practiceKey": "84A9439BD3627374VGUV"
    }
  }'
```

## 📞 Testing with Vapi

When creating test calls with your Vapi assistant, use these credentials:

```typescript
// 1. First, set up PMS integration for a test account (via API or database)
// 2. Then create a Vapi call with that account ID

const call = await vapi.calls.create({
  assistantId: '644878a7-429b-4ed1-b850-6a9aefb8176d',
  metadata: {
    accountId: '<test-account-id>',  // Account that has PMS integration
    clinicName: 'Test Dental Clinic',
  },
});
```

## 🧪 Test Scenarios

### Test 1: Search for Patients

```bash
# Call your Vapi phone number and say:
"Hi, I'm looking for patient John Doe"

# Expected: AI searches in Sikka test database
# Webhook called: POST /api/pms/patients/search
```

### Test 2: Check Availability

```bash
# Say:
"What appointments are available next Monday?"

# Expected: AI checks Sikka for available slots
# Webhook called: GET /api/pms/appointments/availability
```

### Test 3: Book Appointment

```bash
# Say:
"I'd like to book a cleaning for 10am on Monday"

# Expected: AI books in Sikka test system
# Webhook called: POST /api/pms/appointments
```

### Test 4: Create New Patient

```bash
# Say:
"I'm a new patient, Jane Smith"

# Expected: AI creates patient in Sikka
# Webhook called: POST /api/pms/patients
```

## 🔍 Verify Test Results

### Check Audit Logs

```sql
-- View all PMS API calls made during testing
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
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Check Sikka Dashboard

1. Log into Sikka test portal
2. Navigate to the test practice (Test_Sheetal 4)
3. Verify appointments/patients were created

## ⚠️ Important Notes

### Test vs Production

**These are TEST credentials only!** For production:

1. Each clinic gets their own Sikka credentials
2. They connect via Sikka marketplace
3. Credentials are delivered via webhook
4. Never hardcode production credentials

### Authentication Flow

Sikka uses OAuth 2.0 Client Credentials:

```typescript
POST https://api.sikkasoft.com/api/v1/auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=b0cac8c638d52c92f9c0312159fc4518
&client_secret=7beec2a9e62bd692eab2e0840b8bb2db
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

This is handled automatically by `SikkaPmsService`.

## 🐛 Troubleshooting

### Error: "Authentication failed"

**Check:**
- Client ID and secret are correct
- Sikka API is accessible from your server
- Network connectivity

### Error: "Practice not found"

**Check:**
- Practice ID is "1" (from credentials above)
- Master Customer ID is "D36225"

### Error: "No permissions"

**Check:**
- Practice Key is correct: `84A9439BD3627374VGUV`
- API credentials have write-back permissions

### Error: "No PMS integration found"

**Check:**
- Account ID in Vapi call metadata is correct
- PMS integration exists for that account:
  ```sql
  SELECT * FROM pms_integrations WHERE account_id = '<account-id>';
  ```

## 📚 Additional Resources

- **Sikka API Docs**: https://apidocs.sikkasoft.com
- **Write-back API**: https://documenter.getpostman.com/view/1842814/TzCHCWFT
- **Your Implementation**: `apps/frontend/packages/shared/src/pms/sikka.service.ts`

## 🔒 Security Reminder

- ⚠️ **Never commit these credentials to git!**
- ⚠️ **These are test credentials only**
- ⚠️ **Production credentials come from Sikka marketplace webhook**
- ⚠️ **Always encrypt credentials in database** (handled automatically)

---

**Need Help?** Check `docs/PMS_INTEGRATION_TESTING_GUIDE.md` for detailed testing instructions.
