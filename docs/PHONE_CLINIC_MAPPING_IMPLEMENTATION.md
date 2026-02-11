# Phone-to-Clinic Mapping & Vapi Squad Implementation ✅

**Date:** February 9, 2026  
**Status:** ✅ Complete - Ready to test

---

## Summary

Implemented **phone-to-clinic mapping** system and **Vapi Squad** for multi-agent workflows:

✅ **VapiPhoneNumber table** - Maps phone numbers to clinics/accounts  
✅ **Vapi context extraction** - Gets account/PMS from call metadata  
✅ **Sikka test data** - Configured with your credentials  
✅ **API routes updated** - Use phone-based context  
✅ **Squad creation script** - 3 specialized assistants  

---

## Database Changes

### New Table: `vapi_phone_numbers`

```sql
CREATE TABLE vapi_phone_numbers (
  id                  UUID PRIMARY KEY,
  account_id          UUID NOT NULL,
  vapi_phone_id       TEXT UNIQUE,      -- From Vapi
  phone_number        TEXT UNIQUE,      -- E.164: +15551234567
  vapi_assistant_id   TEXT,             -- Single assistant
  vapi_squad_id       TEXT,             -- OR squad of assistants
  pms_integration_id  UUID,             -- Which clinic
  name                TEXT,             -- "Main Line", etc.
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMP,
  updated_at          TIMESTAMP
);
```

### Updated: `pms_integrations`

Added Sikka-specific fields:
- `practice_key` - 84A9439BD3627374VGUV
- `spu_installation_key` - STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=
- `master_customer_id` - D36225

---

## Test Data Seeded

### PMS Integration
```
ID: pms-test-sikka-001
Account: Test Account (ebe87ba0-75e9-469b-9f1a-b0e97f60be65)
Provider: Sikka
Credentials:
  - Client ID: b0cac8c638d52c92f9c0312159fc4518
  - Client Secret: 7beec2a9e62bd692eab2e0840b8bb2db
  - Practice Key: 84A9439BD3627374VGUV
  - SPU Key: STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=
  - Master Customer ID: D36225
```

### Phone Number Mapping
```
Phone: +14156635316
Linked to: pms-test-sikka-001
Account: Test Account
Assistant: 644878a7-429b-4ed1-b850-6a9aefb8176d (will replace with squad)
```

---

## How It Works

### 1. Vapi Call Metadata

When a call comes in, Vapi sends rich metadata:

```json
{
  "call": {
    "id": "call-abc123",
    "phoneNumberId": "phone-vapi-456",
    "phoneNumber": "+14156635316",
    "customer": {
      "number": "+15559876543",
      "name": "John Smith"
    },
    "startedAt": "2024-02-09T..."
  },
  "assistant": {
    "id": "assistant-789",
    "name": "Riley - Receptionist"
  },
  "squad": {
    "id": "squad-xyz",
    "name": "Dental Office Team"
  },
  "tool": {
    "name": "searchPatients"
  },
  "parameters": {
    "query": "John Smith"
  }
}
```

**Key fields we use:**
- ✅ `call.phoneNumber` - Which number was called
- ✅ `call.phoneNumberId` - Vapi's phone ID
- ✅ `call.customer.number` - Caller's phone
- ✅ `call.customer.name` - Caller's name
- ✅ `squad.id` - Which squad is handling

### 2. Context Extraction

New utility: `getContextFromVapiCall()`

```typescript
const context = await getContextFromVapiCall(vapiPayload);
// Returns:
{
  accountId: 'ebe87ba0-75e9-469b-9f1a-b0e97f60be65',
  pmsIntegrationId: 'pms-test-sikka-001',
  phoneNumber: '+14156635316',
  vapiPhoneId: 'phone-vapi-id-placeholder',
  vapiCallId: 'call-abc123',
  customerPhone: '+15559876543',
  customerName: 'John Smith'
}
```

### 3. API Flow

```typescript
// apps/frontend/apps/web/app/api/pms/patients/route.ts

export async function POST(request: NextRequest) {
  // 1. Authenticate Bearer token
  const auth = await authenticateRequest(request);
  
  // 2. Get context from phone number in call
  const { context } = auth;
  const { accountId, pmsIntegrationId } = context;
  
  // 3. Get PMS service for THIS specific clinic
  const pmsService = await getPmsService(accountId, pmsIntegrationId);
  
  // 4. Call Sikka API with THIS clinic's credentials
  const patients = await pmsService.searchPatients(query);
  
  return Response.json({ success: true, data: patients });
}
```

---

## Vapi Squad Architecture

### Squad Members

**1. Riley - Receptionist (Primary)**
- First point of contact
- General inquiries
- Appointment booking
- Can handoff to specialists

**2. Emergency Handler**
- Triggered for urgent calls
- Assesses severity
- Books urgent appointments
- Transfers to dentist if critical

**3. Scheduler**
- Focused on appointment booking
- Efficient time slot management
- Confirmation and reminders

### Squad Tools

**All members have access to:**
- `searchPatients` - Find patient records
- `checkAvailability` - Check open slots
- `bookAppointment` - Book appointments
- `getPatientInfo` - Get patient details
- `createPatient` - Register new patients

**Special tools:**
- **Receptionist:** `handoff` tool (to Emergency/Scheduler)
- **Receptionist:** `transferCall` (to human)
- **Emergency:** `transferCall` (to dentist directly)

---

## Scripts

### 1. Create Squad

```bash
# Local (development)
node scripts/create-vapi-squad.js local

# Production
node scripts/create-vapi-squad.js production
```

This creates:
- ✅ 5 PMS tools with Bearer auth
- ✅ 3 assistants in squad
- ✅ Handoff between assistants
- ✅ Transfer to human capability

Output includes:
- Squad ID (to update database)
- Member details
- Test instructions

### 2. Update Database with Squad ID

After creating squad:

```sql
UPDATE vapi_phone_numbers 
SET vapi_squad_id = 'YOUR_SQUAD_ID_HERE',
    vapi_assistant_id = NULL  -- Use squad instead
WHERE phone_number = '+14156635316';
```

---

## Testing

### Test Call Scenarios

**1. Regular Appointment**
```
Call: +1 (415) 663-5316
Say: "Hi, I want to book a cleaning appointment"
Expected: Riley handles it, searches for patient, checks availability, books
```

**2. Emergency**
```
Call: +1 (415) 663-5316
Say: "I have a dental emergency, severe tooth pain"
Expected: Riley hands off to Emergency Handler
```

**3. Scheduling Focus**
```
Call: +1 (415) 663-5316
Say: "I need to reschedule my appointment"
Expected: Riley can handle or handoff to Scheduler
```

**4. Transfer to Human**
```
Call: +1 (415) 663-5316
Say: "I need to speak with someone"
Expected: Riley transfers to +1 (415) 663-5316
```

### Monitor Activity

```bash
# Watch PMS audit logs
./scripts/check-pms-activity.sh

# Check database
psql -h localhost -p 5433 -U parlae -d parlae -c \
  "SELECT * FROM pms_audit_logs ORDER BY created_at DESC LIMIT 5;"
```

---

## Multi-Clinic Setup Example

### Scenario: Two Dental Clinics

**Clinic A - Dr. Smith's Practice**
```sql
-- PMS Integration
INSERT INTO pms_integrations (...) VALUES (
  'pms-clinic-a',
  'account-clinic-a',
  'sikka',
  'active',
  'PRACTICE_KEY_A',
  'SPU_KEY_A',
  'CUSTOMER_ID_A',
  '{"clientId":"...","clientSecret":"..."}'::jsonb
);

-- Phone Number
INSERT INTO vapi_phone_numbers (...) VALUES (
  'phone-clinic-a',
  'account-clinic-a',
  'vapi-phone-a',
  '+15551111111',
  NULL,
  'squad-dental-a',
  'pms-clinic-a',
  'Dr. Smith Main Line',
  true
);
```

**Clinic B - Dr. Jones's Practice**
```sql
-- PMS Integration
INSERT INTO pms_integrations (...) VALUES (
  'pms-clinic-b',
  'account-clinic-b',
  'sikka',
  'active',
  'PRACTICE_KEY_B',
  'SPU_KEY_B',
  'CUSTOMER_ID_B',
  '{"clientId":"...","clientSecret":"..."}'::jsonb
);

-- Phone Number
INSERT INTO vapi_phone_numbers (...) VALUES (
  'phone-clinic-b',
  'account-clinic-b',
  'vapi-phone-b',
  '+15552222222',
  NULL,
  'squad-dental-b',
  'pms-clinic-b',
  'Dr. Jones Main Line',
  true
);
```

**Result:**
- Call to +1-555-111-1111 → Uses Clinic A's Sikka credentials
- Call to +1-555-222-2222 → Uses Clinic B's Sikka credentials
- Each clinic has its own squad with same structure
- Complete data isolation

---

## Files Created/Modified

### Database
- ✅ Migration: `migrations/20260209000000_add_vapi_phone_numbers/`
- ✅ Seed data: `seed-pms-test-data.sql`

### Utilities
- ✅ `apps/frontend/apps/web/app/api/pms/_lib/vapi-context.ts` - Context extraction
- ✅ Updated: `apps/frontend/apps/web/app/api/pms/patients/route.ts` - Use new context

### Scripts
- ✅ `scripts/create-vapi-squad.js` - Create multi-agent squad

### Documentation
- ✅ `docs/VAPI_TOOLS_AND_FACILITY_MAPPING.md` - Tool types guide
- ✅ `docs/PHONE_CLINIC_MAPPING_IMPLEMENTATION.md` - This file

---

## Vapi Tool Types Summary

### ✅ USING

**1. function** - Custom webhook tools
- ✓ 5 PMS tools configured
- ✓ Bearer Token authentication
- ✓ Clinic-specific via phone mapping

**2. handoff** - AI-to-AI transfer
- ✓ Receptionist → Emergency Handler
- ✓ Receptionist → Scheduler
- ✓ Within same squad

**3. transferCall** - Transfer to human
- ✓ Receptionist → Office line
- ✓ Emergency → Dentist line

**4. endCall** - Graceful call termination
- ✓ After conversation complete

### 🤔 FUTURE

**dtmf** - Keypad input
- Could use for PIN verification
- Payment confirmation codes
- Date of birth entry

### ❌ NOT NEEDED

**sipRequest** - Advanced SIP operations
- Too low-level for your use case

---

## Production Checklist

### Before Going Live

1. **Create Production Squad**
   ```bash
   node scripts/create-vapi-squad.js production
   ```

2. **Update Production Database**
   ```sql
   -- Update phone with production squad ID
   UPDATE vapi_phone_numbers 
   SET vapi_squad_id = 'PRODUCTION_SQUAD_ID'
   WHERE phone_number = 'YOUR_PRODUCTION_NUMBER';
   ```

3. **Update Transfer Numbers**
   - Edit `create-vapi-squad.js`
   - Change `+14156635316` to actual office numbers
   - Recreate squad

4. **Verify Sikka Credentials**
   - Confirm production Sikka credentials
   - Update `pms_integrations` if needed

5. **Test End-to-End**
   - Make test calls
   - Try all handoff scenarios
   - Verify PMS operations work

---

## Next Steps

1. ✅ Database schema updated
2. ✅ Test data seeded
3. ✅ API routes updated
4. ✅ Squad creation script ready
5. ⏭️ **RUN:** `node scripts/create-vapi-squad.js local`
6. ⏭️ **UPDATE:** Database with squad ID
7. ⏭️ **TEST:** Make test calls
8. ⏭️ Add remaining PMS tools (cancel, reschedule, notes, insurance, payments)

---

**Status:** ✅ Ready to create squad and test  
**Test Number:** +1 (415) 663-5316  
**Test Account:** Test Account (ebe87ba0-75e9-469b-9f1a-b0e97f60be65)  
**Last Updated:** February 9, 2026
