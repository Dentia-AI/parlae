# Vapi Integration Architecture

## Overview

This document explains the **per-clinic squad architecture** for Vapi integration, where:

✅ **Each clinic gets their own squad** with personalized context and branding
✅ **Zero latency** - All clinic data is injected into assistant prompts
✅ **Folder organization** - Each clinic's assistants are organized in Vapi folders
✅ **Easy updates** - Bulk update squads via API when needed
✅ **Authentication** is required for all API calls

## Why Per-Clinic Squads?

**Benefits:**
- Personalized greeting: "Welcome to Smile Dental!" (not generic)
- Zero latency: No API calls needed to fetch clinic context
- Simpler webhook logic: Clinic data already in prompt
- Better UX: Professional, branded experience
- No cost penalty: Vapi charges per-minute, not per-squad

**Trade-offs:**
- More squads in Vapi (one per clinic)
- Updates require iteration (but automatable via API)
- Behavior changes need propagation across squads

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ VAPI DASHBOARD (Organized by Folders)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 Clinic: Smile Dental (clinic_123)                      │
│    ├─ Squad: Smile Dental Squad                            │
│    ├─ Assistant: Smile Dental - Triage                     │
│    ├─ Assistant: Smile Dental - Emergency                  │
│    └─ Assistant: Smile Dental - Scheduler                  │
│                                                             │
│  📁 Clinic: Downtown Dentistry (clinic_456)                │
│    ├─ Squad: Downtown Dentistry Squad                      │
│    ├─ Assistant: Downtown Dentistry - Triage              │
│    ├─ Assistant: Downtown Dentistry - Emergency           │
│    └─ Assistant: Downtown Dentistry - Scheduler           │
│                                                             │
│  📁 Clinic: Bay Area Dental (clinic_789)                   │
│    ├─ Squad: Bay Area Dental Squad                         │
│    ├─ Assistant: Bay Area Dental - Triage                  │
│    ├─ Assistant: Bay Area Dental - Emergency               │
│    └─ Assistant: Bay Area Dental - Scheduler               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Each phone number links to its clinic's squad
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ CLINIC: Smile Dental (clinic_123)                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Database Record (accounts table):                          │
│  - id: clinic_123                                           │
│  - name: "Smile Dental"                                     │
│  - business_hours: "Mon-Fri 9am-6pm"                        │
│  - services: ["cleanings", "fillings", "root-canals"]      │
│  - insurance_accepted: ["BlueCross", "Aetna"]               │
│                                                             │
│  Phone Number (vapi_phone_numbers table):                   │
│  - phone_number: "+1-415-555-1234"                          │
│  - vapi_phone_id: "phone_abc123"                            │
│  - vapi_squad_id: "squad_smile_dental"                      │
│  - vapi_folder_id: "folder_smile_dental"                    │
│                                                             │
│  Squad in Vapi:                                             │
│  ┌──────────────────────────────────────────┐              │
│  │ Squad: "Smile Dental Squad"              │              │
│  │ Folder: "Clinic: Smile Dental"           │              │
│  ├──────────────────────────────────────────┤              │
│  │ Triage Assistant:                        │              │
│  │ - First message: "Welcome to Smile       │              │
│  │   Dental! I'm Riley..."                  │              │
│  │ - Context: Hours, services, insurance    │              │
│  │   baked into prompt                      │              │
│  │                                          │              │
│  │ Emergency Assistant:                     │              │
│  │ - Handles urgent cases                   │              │
│  │ - Tool: bookEmergencyAppointment         │              │
│  │                                          │              │
│  │ Scheduler Assistant:                     │              │
│  │ - Books routine appointments             │              │
│  │ - Tools: checkAvailability,              │              │
│  │   bookAppointment                        │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Call Flow:
Customer dials +1-415-555-1234
  ↓
Vapi: Identifies phone → Links to "Smile Dental Squad"
  ↓
Triage: "Hi, welcome to Smile Dental! I'm Riley. How can I help?" [Immediate]
  ↓
[AI routes to Emergency or Scheduler based on conversation]
```

## Database Schema

### 1. Preset Templates (Shared)

#### `vapi_squad_templates`
- Created by admin ONCE
- Shared by all accounts
- Contains squad configuration
- Examples: dental-clinic, sales-pipeline, support-triage

#### `vapi_assistant_templates`
- Created by admin ONCE
- Shared by all accounts
- Contains assistant configuration
- Examples: customer-support, sales-agent

### 2. Account-Specific Resources

#### `vapi_phone_numbers`
- Each account can have multiple phone numbers
- Each phone number links to ONE template (squad OR assistant)
- Phone number uses account-specific knowledge base

#### `vapi_account_knowledge`
- Account-specific business information
- Automatically used by all phone numbers for that account
- Content: hours, services, policies, etc.

#### `vapi_call_logs`
- Logs of all calls for each account
- Includes transcript, analysis, recording

## Authentication

### How It Works

All API endpoints require authentication using **Supabase Auth**:

1. User logs in (gets session cookie)
2. API route extracts user from session
3. API route gets user's account(s)
4. API route filters data by account

### Example: Authenticated Request

```typescript
// Frontend (Next.js Server Action or API Route)
import { getSupabaseServerClient } from '@kit/supabase/server-client';

async function assignPhoneNumber(squadTemplateId: string, areaCode: string) {
  const supabase = getSupabaseServerClient();
  
  // User is already authenticated (has session)
  const response = await fetch('/api/vapi/phone-numbers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      squadTemplateId,
      areaCode,
      friendlyName: 'Main Office Line'
    })
  });
  
  return response.json();
}
```

**No API key needed in request!** Authentication is handled via session cookie.

### Example: Testing with cURL

For testing, you need to get an access token:

```bash
# 1. Login to get access token (one-time)
curl -X POST https://your-app.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Response includes: { "access_token": "eyJ..." }

# 2. Use access token in API calls
curl -X POST https://your-app.com/api/vapi/phone-numbers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." \
  -d '{
    "squadTemplateId": "squad_dental_clinic",
    "areaCode": "415"
  }'
```

## API Endpoints

### 1. List Available Templates

**GET /api/vapi/templates**

Returns all available squad and assistant templates.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "squads": [
    {
      "id": "squad_dental_clinic",
      "name": "dental-clinic",
      "display_name": "Dental Clinic (Triage + Emergency + Scheduler)",
      "description": "Complete dental clinic workflow...",
      "squad_type": "dental_clinic",
      "status": "active",
      "is_default": true
    }
  ],
  "assistants": [
    {
      "id": "asst_customer_support",
      "name": "customer-support",
      "display_name": "Customer Support Agent",
      "description": "General purpose customer support...",
      "assistant_type": "support",
      "voice_provider": "elevenlabs",
      "voice_name": "Rachel",
      "status": "active",
      "is_default": true
    }
  ]
}
```

### 2. Assign Phone Number to Account

**POST /api/vapi/phone-numbers**

Purchases a phone number and links it to a squad/assistant template.

**Authentication**: Required

**Request Body**:
```json
{
  "squadTemplateId": "squad_dental_clinic",  // OR assistantTemplateId
  "areaCode": "415",  // Optional: will purchase new number
  "phoneNumber": "+14155551234",  // Optional: use existing number
  "friendlyName": "Main Office Line",
  "customConfig": {  // Optional: account-specific overrides
    "maxCallDuration": 300
  }
}
```

**Response**:
```json
{
  "success": true,
  "phoneNumber": {
    "id": "phone_123",
    "phoneNumber": "+14155551234",
    "friendlyName": "Main Office Line",
    "status": "active",
    "templateType": "squad",
    "templateName": "Dental Clinic (Triage + Emergency + Scheduler)"
  },
  "message": "Phone number setup successfully"
}
```

### 3. List Account's Phone Numbers

**GET /api/vapi/phone-numbers**

Returns all phone numbers for the authenticated user's account.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "phoneNumbers": [
    {
      "id": "phone_123",
      "phone_number": "+14155551234",
      "friendly_name": "Main Office Line",
      "status": "active",
      "squad_template": {
        "display_name": "Dental Clinic",
        "squad_type": "dental_clinic"
      },
      "total_calls": 45,
      "total_minutes": 123.5,
      "last_call_at": "2026-01-30T10:30:00Z",
      "created_at": "2026-01-15T08:00:00Z"
    }
  ]
}
```

## Complete Setup Flow

### Step 1: Clinic Onboarding

When a clinic signs up and wants to set up their AI phone agent:

```typescript
import { setupClinicSquad } from '@kit/shared/vapi/setup-clinic-squad';

// Get clinic data from your database
const clinic = await getClinic(clinicId);

// Setup their dedicated squad
const result = await setupClinicSquad(
  {
    id: clinic.id,
    name: clinic.name,
    businessHours: clinic.business_hours,
    address: clinic.address,
    phone: clinic.phone,
    services: clinic.services,
    insuranceAccepted: clinic.insurance_accepted,
    pricingInfo: clinic.pricing_info
  },
  phoneNumber, // Twilio phone number
  twilioAccountSid,
  twilioAuthToken
);

if (result.success) {
  // Save to database
  await db.vapiPhoneNumber.create({
    data: {
      account_id: clinic.id,
      phone_number: result.phoneNumber,
      vapi_phone_id: result.vapiPhoneId,
      vapi_squad_id: result.squadId,
      vapi_folder_id: result.folderId,
      friendly_name: `${clinic.name} Main Line`,
      status: 'active'
    }
  });
}
```

### Step 2: Test the Phone Number

```bash
# Just call the number!
# Customer hears: "Hi, welcome to [Clinic Name]! I'm Riley. How can I help you today?"

# Test emergency routing:
Customer: "I have severe tooth pain and bleeding"
  → AI routes to Emergency assistant
  → Emergency: "I understand this is urgent. Let me find you the earliest time..."
  → Calls bookEmergencyAppointment tool
  → Emergency: "I have you scheduled for today at 2pm."

# Test routine booking:
Customer: "I need to schedule a cleaning"
  → AI routes to Scheduler assistant
  → Scheduler: "I can help with that! What's your name?"
  → Collects info, calls checkAvailability tool
  → Scheduler: "We have Monday at 10am or Wednesday at 2pm available..."
  → Calls bookAppointment tool
  → Scheduler: "Perfect! Your cleaning is booked for Monday at 10am."
```

### Step 3: Update Clinic Information

When clinic details change (hours, services, etc.):

```typescript
import { updateClinicSquad } from '@kit/shared/vapi/update-clinic-squad';

// Update clinic squad with new information
await updateClinicSquad(clinicId, {
  id: clinic.id,
  name: clinic.name,
  businessHours: 'Mon-Sat 8am-7pm', // Updated hours
  // ... other updated fields
});

// Squad assistants now have updated context in their prompts
```

## Key Benefits

### 1. User Experience
- ✅ **Instant personalized greeting** - "Welcome to [Clinic Name]!"
- ✅ **Zero latency** - No API calls during conversation
- ✅ **Professional branding** - Each clinic sounds unique
- ✅ **Context-aware responses** - AI knows clinic details immediately

### 2. Development Experience
- ✅ **Simpler webhook logic** - No need to fetch clinic context
- ✅ **Organized Vapi dashboard** - Folders keep everything clean
- ✅ **Easy debugging** - Clear separation between clinics
- ✅ **Straightforward updates** - Iterate through squads to update behavior

### 3. Scalability
- ✅ **No cost penalty** - Vapi charges per-minute, not per-squad
- ✅ **Automated updates** - Bulk update via API
- ✅ **Self-contained** - Each clinic's squad is independent
- ✅ **Easy to test** - Test one clinic without affecting others

### 4. Maintenance
- ✅ **Clear ownership** - Each squad belongs to one clinic
- ✅ **Audit trails** - Know exactly which squad handled which call
- ✅ **Rollback capability** - Revert individual clinics if needed
- ✅ **A/B testing** - Test new prompts on subset of clinics

## Cost Implications

### Per-Clinic Squad Approach

**Vapi Resources:**
- 100 clinics = **100 squads** (each with 3 assistants)
- Total: **300 assistants** across all clinics

**Cost Analysis:**
- Vapi charges **per-minute of call time** (~$0.05-0.10/min)
- Creating squads/assistants is **FREE**
- No cost difference between 1 squad vs 100 squads
- You only pay for actual call usage

**Example:**
```
Clinic with 100 calls/month at 3 min average:
- Call time: 300 minutes
- Cost: 300 × $0.07 = $21/month
- Number of squads: Irrelevant to cost
```

### Shared Squad Approach (For Comparison)

**Vapi Resources:**
- 100 clinics = **1 shared squad** (with 3 assistants)
- Total: **3 assistants** total

**Cost Analysis:**
- Same per-minute rate (~$0.05-0.10/min)
- Same total cost for same call volume
- No cost savings

**Trade-offs:**
- ❌ Generic greeting ("Hi, I'm Riley" vs "Welcome to [Clinic]!")
- ❌ ~500ms latency to fetch clinic context
- ❌ Complex webhook logic
- ❌ Worse user experience

### Conclusion

**Per-clinic squads cost the same but provide better UX!** 🎉

There's no financial reason to use shared squads. The per-clinic approach is superior in every way except management complexity (which we solve with folders and bulk update APIs).

## Migration Guide

If you have existing code that needs updating:

### From Shared Template Approach

If you previously started with a shared template approach, migrate to per-clinic squads:

```typescript
// OLD: Shared template approach
// ❌ Don't do this anymore
const sharedSquad = await createSharedTemplate();
await linkPhoneToSharedSquad(phoneNumber, sharedSquad.id);

// NEW: Per-clinic squad approach
// ✅ Do this instead
const result = await setupClinicSquad(
  clinicData,
  phoneNumber,
  twilioSid,
  twilioToken
);

// Store IDs in database
await db.vapiPhoneNumber.create({
  data: {
    account_id: clinicData.id,
    vapi_phone_id: result.vapiPhoneId,
    vapi_squad_id: result.squadId,
    vapi_folder_id: result.folderId,
    phone_number: result.phoneNumber,
    status: 'active'
  }
});
```

### Database Migration

Add folder tracking:

```sql
-- Add folder ID column
ALTER TABLE public.vapi_phone_numbers
ADD COLUMN vapi_folder_id TEXT;

-- Add index for faster lookups
CREATE INDEX idx_vapi_phone_numbers_folder 
ON public.vapi_phone_numbers(vapi_folder_id);

-- Add comment
COMMENT ON COLUMN public.vapi_phone_numbers.vapi_folder_id 
IS 'Vapi folder ID for organizing clinic assistants';
```

### Migrating Existing Clinics

If you have clinics already using a shared squad:

```typescript
async function migrateClinicToPersonalSquad(clinicId: string) {
  // 1. Get existing phone record
  const phoneRecord = await db.vapiPhoneNumber.findFirst({
    where: { account_id: clinicId },
    include: { account: true }
  });

  if (!phoneRecord) {
    throw new Error('No phone number found for clinic');
  }

  // 2. Create new per-clinic squad
  const result = await setupClinicSquad(
    phoneRecord.account,
    phoneRecord.phone_number,
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  if (!result.success) {
    throw new Error('Failed to create new squad');
  }

  // 3. Update phone record with new squad
  await db.vapiPhoneNumber.update({
    where: { id: phoneRecord.id },
    data: {
      vapi_squad_id: result.squadId,
      vapi_folder_id: result.folderId,
      updated_at: new Date()
    }
  });

  // 4. Update Vapi phone number to point to new squad
  await vapiService.updatePhoneNumber(
    phoneRecord.vapi_phone_id,
    result.squadId,
    true // isSquad
  );

  // 5. Delete old shared squad reference (optional)
  // Keep shared squad if other clinics still use it
  
  return { success: true };
}

// Migrate all clinics
const clinics = await db.account.findMany({
  where: { type: 'clinic' }
});

for (const clinic of clinics) {
  await migrateClinicToPersonalSquad(clinic.id);
  console.log(`Migrated ${clinic.name}`);
}
```

## Next Steps

1. **Update database schema** - Add `vapi_folder_id` column
2. **Implement setup function** - Create `setupClinicSquad` server action
3. **Build webhook handler** - Handle tool calls (booking, availability)
4. **Test with one clinic** - Verify complete call flow
5. **Build admin UI** - Interface for managing clinic squads
6. **Add monitoring** - Track squad health and call analytics
7. **Document customization** - Clinic-specific voice, prompts, tools

## Troubleshooting

### Issue: "Folder not found"
**Solution**: Check that folders are enabled in your Vapi account. Some older accounts may not have this feature.

### Issue: "Assistant not found in squad"
**Solution**: Verify assistant names match exactly in `assistantDestinations`. Names are case-sensitive.

### Issue: "Squad not routing correctly"
**Solution**: 
1. Check assistant destination descriptions - make them very specific
2. Review system prompts - ensure routing rules are clear
3. Test with explicit phrases: "I have an emergency" vs vague requests

### Issue: "Tool call timeout"
**Solution**: 
1. Check webhook URL is accessible from Vapi servers
2. Increase `timeoutSeconds` in tool config (max 20s)
3. Optimize your API response time

### Issue: "Phone number not working"
**Solution**: 
1. Check `vapi_phone_numbers` table - status should be 'active'
2. Verify phone is imported in Vapi dashboard
3. Confirm phone number is active in Twilio
4. Check webhook secret matches between env and Vapi config

---

**For implementation details**: See [VAPI_PER_CLINIC_IMPLEMENTATION.md](./VAPI_PER_CLINIC_IMPLEMENTATION.md)  
**For testing guide**: See [VAPI_TESTING_GUIDE.md](./VAPI_TESTING_GUIDE.md)  
**For advanced features**: See [VAPI_ADVANCED_FEATURES.md](./VAPI_ADVANCED_FEATURES.md)
