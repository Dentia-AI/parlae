# Vapi PMS Tools Configured ✅

## Summary

Successfully configured **7 tools** with proper authentication for the Vapi dental receptionist assistant.

**Date:** February 9, 2026  
**Assistant ID:** `644878a7-429b-4ed1-b850-6a9aefb8176d`  
**Assistant Name:** Parlae Dental Receptionist (PMS Enabled)  
**Phone Number:** +1 (415) 663-5316

---

## Tools Configured

### 1. PMS Function Tools (5)

All function tools use:
- **Type:** `function` (correct Vapi tool type)
- **Authentication:** `server.secret` with HMAC verification
- **Base URL (local):** `https://matterless-eartha-unraffled.ngrok-free.dev`
- **Base URL (production):** `https://parlae.ca`

| Tool | Function | Endpoint | Purpose |
|------|----------|----------|---------|
| searchPatients | `searchPatients` | `/api/pms/patients/search` | Find patients by name/phone/email |
| checkAvailability | `checkAvailability` | `/api/pms/appointments/availability` | Check available appointment slots |
| bookAppointment | `bookAppointment` | `/api/pms/appointments` | Book new appointments |
| getPatientInfo | `getPatientInfo` | `/api/pms/patients` | Get patient details and balance |
| createPatient | `createPatient` | `/api/pms/patients` | Create new patient records |

### 2. Transfer Call Tool (1)

- **Type:** `transferCall`
- **Destination:** +1 (415) 663-5316 (main office)
- **Message:** "Let me transfer you to our office. One moment please."

### 3. End Call Tool (1)

- **Type:** `endCall`
- **Message:** "Thank you for calling! Have a great day!"

---

## Authentication & Security

### Webhook Secret
- **Header:** `X-Vapi-Secret`
- **Value:** `parlae-vapi-webhook-secret-change-in-production`
- **Verification:** HMAC-SHA256 signature check in API routes
- **Applied to:** All 5 PMS function tools

### Server Configuration
Each function tool includes:
```json
{
  "server": {
    "url": "https://your-domain.com/api/endpoint",
    "timeoutSeconds": 15-20,
    "secret": "parlae-vapi-webhook-secret-change-in-production"
  }
}
```

---

## Tool Type Comparison

### ❌ Previous Incorrect Approach
```javascript
// WRONG - These were rejected by Vapi API
{
  type: 'apiRequest',  // Does not exist for assistants
  apiRequest: { ... }
}

{
  type: 'function',
  function: { ... }
  // Missing server configuration
}
```

### ✅ Correct Approach
```javascript
// RIGHT - Function tool with server authentication
{
  type: 'function',
  function: {
    name: 'searchPatients',
    description: '...',
    parameters: { ... }
  },
  server: {
    url: 'https://your-api.com/endpoint',
    secret: 'your-secret',
    timeoutSeconds: 15
  },
  async: false,
  messages: [
    { type: 'request-start', content: '...' }
  ]
}

// RIGHT - Built-in tools
{
  type: 'transferCall',
  destinations: [{ ... }]
}

{
  type: 'endCall'
}
```

---

## Assistant Configuration

The assistant now includes a system prompt that guides tool usage:

```
You are Riley, a friendly dental receptionist.

AVAILABLE TOOLS:
- searchPatients: Find patients
- checkAvailability: Check appointment slots
- bookAppointment: Book appointments
- getPatientInfo: Get patient details
- createPatient: Create new patients
- transferCall: Transfer to office staff
- endCall: End the call

WORKFLOW:
1. Greet warmly
2. Ask patient name
3. Use searchPatients
4. If not found, use createPatient
5. Ask appointment type
6. Ask preferred date
7. Use checkAvailability
8. Use bookAppointment
9. Confirm details
```

---

## Scripts

### Setup Script
```bash
# Create/update tools for local environment
node scripts/setup-vapi-pms-tools.js local

# Create/update tools for production
node scripts/setup-vapi-pms-tools.js production
```

### Monitor PMS Activity
```bash
# Watch audit logs in real-time
./scripts/check-pms-activity.sh
```

---

## Testing

### 1. Check Tools in Dashboard
Visit: https://dashboard.vapi.ai/tools

You should see:
- 5 function tools with server URLs
- 1 transfer call tool
- 1 end call tool

### 2. Make a Test Call
Call: +1 (415) 663-5316

Try saying:
- "I want to book an appointment"
- "What's my balance?"
- "I'm a new patient"
- "Transfer me to someone"

### 3. Monitor Backend
```bash
# Watch PMS audit logs
./scripts/check-pms-activity.sh

# Check webhook calls
tail -f apps/frontend/apps/web/app/api/vapi/webhook/route.ts.log
```

---

## Production Setup

When deploying to production:

1. **Update Base URL:**
   ```bash
   node scripts/setup-vapi-pms-tools.js production
   ```

2. **Update Vapi Secret:**
   - Set `VAPI_WEBHOOK_SECRET` environment variable
   - Update script if needed

3. **Configure Phone Number:**
   - In Vapi dashboard, assign assistant to production phone number
   - Set server URL: `https://parlae.ca/api/vapi/webhook`

4. **Update Transfer Destination:**
   - Edit `setup-vapi-pms-tools.js`
   - Change `destinations[0].number` to actual office line

---

## Key Learnings

1. **Tool Types:**
   - Use `type: 'function'` for custom API calls, not `apiRequest`
   - `apiRequest` is for workflows, not assistant tools

2. **Authentication:**
   - Set `server.secret` in tool configuration
   - Verify using `X-Vapi-Secret` header in your API routes

3. **Tool Discovery:**
   - Vapi shows tools in dashboard once properly configured
   - Tools appear in assistant's `model.toolIds` array

4. **Best Practices:**
   - Keep tool names descriptive and verb-based
   - Include clear descriptions for LLM understanding
   - Add user-facing messages for better UX
   - Set appropriate timeouts (15-20s)

---

## Files Modified

- `scripts/setup-vapi-pms-tools.js` - Tool creation/configuration script
- `scripts/check-pms-activity.sh` - Monitoring script (already exists)
- `apps/frontend/apps/web/app/api/pms/**/*.ts` - API routes with auth
- `docs/VAPI_PMS_TOOLS_FINAL.md` - This documentation

---

## Next Steps

1. ✅ Tools configured with authentication
2. ✅ Transfer and end call tools added
3. ⏭️ Add remaining 6 tools (cancel, reschedule, notes, insurance, payments)
4. ⏭️ Test end-to-end call flow
5. ⏭️ Deploy to production

---

**Last Updated:** February 9, 2026  
**Script Location:** `/scripts/setup-vapi-pms-tools.js`
