# Vapi Squad Setup - COMPLETE ✅

**Date:** February 9, 2026  
**Status:** ✅ READY TO TEST

---

## What Was Created

### 1. Vapi Squad: "Dental Office Team"
**Squad ID:** `4eaaee84-3e61-430e-bed0-e017f69fce98`

**Members:**
1. **Riley - Receptionist** (Primary)
   - General inquiries
   - Appointment booking
   - Can handoff to specialists
   - Voice: ElevenLabs Rachel

2. **Emergency Handler**
   - Urgent/emergency calls
   - Pain assessment
   - Immediate transfers
   - Voice: ElevenLabs Professional

3. **Scheduler**
   - Focused on appointment booking
   - Efficient time slot management
   - Voice: ElevenLabs Professional

---

## Phone Number Configuration

### Twilio/Vapi Phone
```
Phone: +14156635316
Vapi ID: 2ae93ae3-d93e-435c-9332-78a086e29647
Provider: Twilio
Status: active
```

### Linked To
```
Squad: Dental Office Team (4eaaee84-3e61-430e-bed0-e017f69fce98)
PMS: Sikka (Practice Key: 84A9439BD3627374VGUV)
Account: Test Account
Clinic: Test Dental Clinic - Main Line
```

**Yes, this is the phone number purchased from Twilio and attached to Vapi!**

---

## Complete Architecture

```
Incoming Call to +14156635316
         ↓
    Vapi Squad
         ↓
   Riley (Receptionist)
    /    |    \
   /     |     \
Emergency  |   Scheduler
Handler    |
           ↓
    Transfer to Human
```

### Data Flow

```
1. Patient calls +14156635316
   ↓
2. Vapi identifies:
   - Phone number: +14156635316
   - Squad: Dental Office Team
   - Starts with: Riley (Receptionist)
   ↓
3. Riley uses tools:
   - searchPatients → POST /api/pms/patients/search
   - checkAvailability → GET /api/pms/appointments/availability
   - bookAppointment → POST /api/pms/appointments
   ↓
4. API extracts context from call:
   - Phone: +14156635316
   - Account: Test Account
   - PMS Integration: pms-test-sikka-001
   ↓
5. API calls Sikka with clinic credentials:
   - Practice Key: 84A9439BD3627374VGUV
   - SPU Key: STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=
   - Master Customer ID: D36225
   ↓
6. Returns clinic-specific patient data
```

---

## Tools Configuration

All 5 PMS tools created with Bearer Token authentication:

1. **searchPatients** (`71a579f4-3e93-4fd5-806b-20a87535ce36`)
   - Endpoint: `/api/pms/patients/search`
   - Auth: Bearer Token (credentialId)

2. **checkAvailability** (`85b5d966-f457-47e2-9775-572f377b1681`)
   - Endpoint: `/api/pms/appointments/availability`
   - Auth: Bearer Token

3. **bookAppointment** (`26f7d565-561b-4e5c-8f1f-83d4e3e848f7`)
   - Endpoint: `/api/pms/appointments`
   - Auth: Bearer Token

4. **getPatientInfo** (`58c11990-6542-4b19-bcbe-1133968f9d6c`)
   - Endpoint: `/api/pms/patients`
   - Auth: Bearer Token

5. **createPatient** (`4507a71a-d5cc-4b70-9cb0-3428ca2ede31`)
   - Endpoint: `/api/pms/patients`
   - Auth: Bearer Token

---

## Testing Scenarios

### 1. Regular Appointment Booking
```
Call: +1 (415) 663-5316
Say: "Hi, I'd like to book a cleaning appointment"

Expected Flow:
1. Riley greets you
2. Asks for your name
3. Uses searchPatients to find you
4. Asks preferred date
5. Uses checkAvailability
6. Offers available times
7. Uses bookAppointment
8. Confirms booking
```

### 2. Emergency Situation
```
Call: +1 (415) 663-5316
Say: "I have a dental emergency, severe tooth pain"

Expected Flow:
1. Riley assesses urgency
2. Uses handoff tool
3. Emergency Handler takes over
4. Asks about pain severity
5. Either:
   a) Transfers to dentist (if severe)
   b) Books urgent appointment (if moderate)
```

### 3. Scheduling Focus
```
Call: +1 (415) 663-5316
Say: "I need to reschedule my appointment"

Expected Flow:
1. Riley can handle directly, OR
2. Riley hands off to Scheduler
3. Scheduler efficiently reschedules
```

### 4. Transfer to Human
```
Call: +1 (415) 663-5316
Say: "I need to speak with someone in person"

Expected Flow:
1. Riley acknowledges request
2. Uses transferCall tool
3. Transfers to +14156635316
```

---

## Monitoring

### Check Call Activity
```bash
# Watch audit logs in real-time
./scripts/check-pms-activity.sh

# Check database
psql -h localhost -p 5433 -U parlae -d parlae -c \
  "SELECT action, success, created_at FROM pms_audit_logs ORDER BY created_at DESC LIMIT 10;"
```

### Check Squad in Dashboard
- Go to: https://dashboard.vapi.ai/squads
- Find: "Dental Office Team"
- Verify: 3 members, tools attached

### Check Phone Number
- Go to: https://dashboard.vapi.ai/phone-numbers
- Find: +1 (415) 663-5316
- Verify: Squad attached (not individual assistant)

---

## Key Concepts Clarified

### Vapi Phone Numbers

**Q: Where do phone numbers come from?**

A: You have 3 options:

1. **Buy from Twilio directly** ✅ (What you did)
   - Purchase number from Twilio
   - Connect Twilio to Vapi
   - Attach to squad/assistant

2. **Buy through Vapi**
   - Vapi provisions from their Twilio account
   - Managed entirely in Vapi dashboard

3. **BYO Provider**
   - Use your own SIP provider
   - Configure forwarding to Vapi

**Your Setup:**
- Phone: +14156635316
- Purchased from: Twilio
- Connected to: Vapi
- Attached to: Squad (4eaaee84-3e61-430e-bed0-e017f69fce98)

---

## Files Created

1. **Database**
   - ✅ `vapi_phone_numbers` table
   - ✅ Test data with Sikka credentials

2. **API Updates**
   - ✅ `vapi-context.ts` - Extract clinic from call
   - ✅ Updated `patients/route.ts` - Use context

3. **Scripts**
   - ✅ `create-vapi-squad.js` - Squad creation
   - ✅ Verified and working

4. **Documentation**
   - ✅ `PHONE_CLINIC_MAPPING_IMPLEMENTATION.md`
   - ✅ `VAPI_TOOLS_AND_FACILITY_MAPPING.md`
   - ✅ `VAPI_SQUAD_SETUP_COMPLETE.md` (this file)

---

## Production Checklist

When deploying to production:

### 1. Create Production Squad
```bash
node scripts/create-vapi-squad.js production
```

### 2. Update Production Phone Number
```bash
# Get your production phone number ID from Vapi dashboard
curl -X PATCH "https://api.vapi.ai/phone-number/YOUR_PHONE_ID" \
  -H "Authorization: Bearer YOUR_VAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "squadId": "YOUR_PRODUCTION_SQUAD_ID"
  }'
```

### 3. Update Database
```sql
INSERT INTO vapi_phone_numbers (
  id, account_id, vapi_phone_id, phone_number,
  vapi_squad_id, pms_integration_id, name
) VALUES (
  uuid_generate_v4(),
  'PRODUCTION_ACCOUNT_ID',
  'VAPI_PHONE_ID',
  '+1YOURNUMBER',
  'PRODUCTION_SQUAD_ID',
  'PRODUCTION_PMS_INTEGRATION_ID',
  'Production Clinic Main Line'
);
```

### 4. Update Transfer Numbers
Edit `scripts/create-vapi-squad.js`:
- Change `+14156635316` to actual office number
- Recreate squad for production

---

## What's Next?

### Immediate
1. ✅ Squad created
2. ✅ Phone attached
3. ✅ Tools configured
4. ⏭️ **TEST:** Call +1 (415) 663-5316

### Short Term
1. Add remaining PMS tools:
   - Cancel appointment
   - Reschedule appointment
   - Add patient notes
   - View patient notes
   - Get insurance info
   - Process payments

2. Enhance Emergency Handler:
   - Add after-hours routing
   - Integrate with on-call schedule

3. Add SMS capabilities:
   - Appointment reminders
   - Confirmation texts

### Long Term
1. Multi-clinic deployment
2. Analytics dashboard
3. Call quality monitoring
4. Custom voice training

---

## Success Metrics

Monitor these to ensure system is working:

- **Call Success Rate:** % of calls that complete successfully
- **Tool Call Success:** % of PMS API calls that succeed
- **Handoff Rate:** How often Riley transfers to specialists
- **Emergency Response Time:** Time to connect emergency calls
- **Booking Completion:** % of calls that result in bookings

---

## Support

### If calls aren't working:

1. **Check ngrok is running:**
   ```bash
   ngrok http 3000
   # Verify URL matches BASE_URL in squad
   ```

2. **Check database connection:**
   ```bash
   psql -h localhost -p 5433 -U parlae -d parlae -c "SELECT 1;"
   ```

3. **Check PMS audit logs:**
   ```bash
   ./scripts/check-pms-activity.sh
   ```

4. **Check Vapi dashboard:**
   - https://dashboard.vapi.ai/phone-numbers
   - Verify squad is attached
   - Check call logs

---

**Status:** ✅ FULLY CONFIGURED AND READY TO TEST

**Test Number:** +1 (415) 663-5316  
**Squad:** Dental Office Team (3 assistants)  
**PMS:** Sikka (with your test credentials)  
**Authentication:** Bearer Token with credentialId  

**CALL NOW TO TEST!** 🎉
