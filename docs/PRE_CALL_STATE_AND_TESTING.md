# Pre-Call State & Testing Guide

**Date:** February 9, 2026  
**Status:** Ready to test with monitoring

---

## Current System State

### Database Configuration ✅

**Phone Mapping:**
```
Phone: +14156635316
  ↓
Account: Test Account (ebe87ba0-75e9-469b-9f1a-b0e97f60be65)
  ↓
PMS Integration: pms-test-sikka-001 (Sikka)
  ↓
Squad: Dental Office Team (479728e2-4227-4036-92df-e8f61a530512)
```

**Sikka Credentials (Test):**
```
Client ID: b0cac8c638d52c92f9c0312159fc4518
Client Secret: 7beec2a9e62bd692eab2e0840b8bb2db
Practice Key: 84A9439BD3627374VGUV
SPU Installation Key: STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=
Master Customer ID: D36225
```

**Note:** Sikka OAuth endpoint returns 404 - these appear to be sandbox credentials that may not connect to a live Sikka instance yet. The system will still work and log all activity.

---

## How to Test

### Step 1: Start Monitoring (Terminal 1)

```bash
./scripts/monitor-call-activity.sh
```

This will watch for:
- PMS API calls
- Tool executions
- Database changes
- Success/failure status

### Step 2: Make Test Call (Your Phone)

Call: **+1 (415) 663-5316**

### Step 3: Test Scenarios

**Scenario 1: Regular Appointment**
```
You: "Hi, I want to book a cleaning appointment"

Expected Flow:
1. Riley answers
2. Riley: "What's your name?"
3. You: "John Smith"
4. Riley uses searchPatients tool → API call logged
5. Riley: "When would you like to come in?"
6. You: "Next Tuesday at 2pm"
7. Riley uses checkAvailability → API call logged
8. Riley uses bookAppointment → API call logged
```

**Scenario 2: Emergency**
```
You: "I have a dental emergency!"

Expected Flow:
1. Riley detects urgency
2. Riley hands off to Emergency Handler
3. Emergency Handler assesses severity
4. Either transfers to dentist OR books urgent appointment
```

**Scenario 3: New Patient**
```
You: "I'm a new patient"

Expected Flow:
1. Riley: "Welcome! Let me get your information"
2. Riley uses searchPatients → Not found
3. Riley uses createPatient → API call logged
4. Continues with booking
```

---

## What You'll See in Monitor

### When Riley Uses a Tool

```
🎉 NEW ACTIVITY DETECTED!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   time    |      action       | success | status | time_ms 
-----------+-------------------+---------+--------+---------
 14:23:15  | SEARCH_PATIENTS   | t       |    200 |     150
 14:23:18  | CHECK_AVAILABILITY| t       |    200 |     220
 14:23:25  | BOOK_APPOINTMENT  | t       |    201 |     180

📋 Details of latest call:
      action       |      request_summary       | success | error_message 
-------------------+---------------------------+---------+---------------
 BOOK_APPOINTMENT | {"patientId":"123",...}   | t       | 
```

### Real Data Flow

```
1. Call comes in to +14156635316
   ↓
2. Vapi identifies:
   - Phone: +14156635316
   - Squad: Dental Office Team
   - First: Riley - Receptionist
   ↓
3. Riley uses tool: searchPatients
   ↓
4. Vapi sends:
   POST /api/pms/patients/search
   Authorization: Bearer LyeS3ZYpLsdJmKO6euvYfaki7s4dPIrpcbmQ9vsmWviJCY5lcvfCuridvvCJskOJ
   Body: {"query": "John Smith"}
   ↓
5. Your API:
   - Validates Bearer token ✅
   - Extracts phone from call.phoneNumber
   - Looks up: +14156635316 → pms-test-sikka-001
   - Gets Sikka credentials for that clinic
   - Calls Sikka API (if endpoint is working)
   - Logs to pms_audit_logs
   ↓
6. Returns data to Vapi → Riley speaks result
```

---

## Sikka API Status

### Current Issue
- OAuth endpoint `/api/v1/auth/token` returns 404
- This suggests the credentials are for a different environment or sandbox

### Possible Reasons
1. **Test credentials** - Not connected to live Sikka instance
2. **Different API base** - Might need different URL for test environment
3. **Pending setup** - Sikka integration might need activation

### What This Means for Testing

✅ **You can still test everything:**
- Vapi squad works
- Tool calls are made
- API routes execute
- Authentication validates
- Audit logs are created

❌ **Sikka API calls will fail:**
- searchPatients will not return real data
- bookAppointment won't create real appointments
- But you'll see the attempts in audit logs

---

## Expected Monitor Output

### Successful Tool Call (API working)
```
   time    |      action       | success | status | time_ms 
-----------+-------------------+---------+--------+---------
 14:23:15  | SEARCH_PATIENTS   | t       |    200 |     150
```

### Failed Sikka Connection
```
   time    |      action       | success | status | time_ms 
-----------+-------------------+---------+--------+---------
 14:23:15  | SEARCH_PATIENTS   | f       |    500 |      50

error_message: Failed to authenticate with Sikka API
```

**Both are useful!** - You can see that:
- ✅ Vapi squad is working
- ✅ Tools are being called
- ✅ Bearer token auth is working
- ✅ Phone-to-clinic mapping is working
- ❌ Sikka API connection needs configuration

---

## Testing Right Now

### Terminal 1: Start Monitor
```bash
./scripts/monitor-call-activity.sh
```

### Your Phone: Make Call
Call: **+1 (415) 663-5316**

Try: "Hi, I'm John Smith and I want to book an appointment"

### What to Watch For

**In Monitor:**
- New entries appear in pms_audit_logs
- Action = SEARCH_PATIENTS
- Contains your call details

**On Phone:**
- Riley greets you
- Asks for information
- Attempts to use tools (you'll hear "Let me search..." etc.)
- May report "system unavailable" if Sikka API fails

---

## Next Steps After Testing

### If Sikka API Works
✅ You'll see successful tool calls  
✅ Real patient data returns  
✅ Appointments get booked

### If Sikka API Fails (Current State)
✅ You'll see tool attempts in audit logs  
✅ Verify squad handoffs work  
✅ Verify authentication works  
📧 Contact Sikka to activate test API access

---

## Files Created

- ✅ `scripts/monitor-call-activity.sh` - Real-time monitoring
- ✅ `scripts/fetch-sikka-current-state.js` - Data fetcher (needs working API)
- ✅ `docs/PRE_CALL_STATE_AND_TESTING.md` - This guide

---

**Ready to test!** Start the monitor and make your call! 🎉
