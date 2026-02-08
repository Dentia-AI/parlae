# Vapi Per-Clinic Squad Implementation Summary

## What We Implemented

This document summarizes the per-clinic squad architecture implementation for Vapi integration.

## Key Decisions

### ✅ Per-Clinic Squad Architecture (Final Choice)

Each clinic gets their own dedicated squad with:
- Personalized greeting: "Welcome to [Clinic Name]!"
- Clinic context injected into assistant prompts
- Zero latency (no API calls during conversation)
- Organized in Vapi folders for easy management

### ❌ Shared Squad Architecture (Rejected)

We initially considered a shared squad approach but rejected it because:
- Generic greeting only: "Hi, I'm Riley"
- ~500ms latency to fetch clinic context via API
- More complex webhook logic
- Worse user experience
- **No cost savings** (Vapi charges per-minute, not per-squad)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ VAPI (Organized by Folders)                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 Clinic: Smile Dental (clinic_123)                      │
│    ├─ Squad: Smile Dental Squad                            │
│    ├─ Assistant: Smile Dental - Triage                     │
│    ├─ Assistant: Smile Dental - Emergency                  │
│    └─ Assistant: Smile Dental - Scheduler                  │
│                                                             │
│  📁 Clinic: Downtown Dentistry (clinic_456)                │
│    └─ (Same structure)                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ├─ Phone: +1-415-555-1234 → Smile Dental Squad
                           └─ Phone: +1-212-555-9999 → Downtown Dentistry Squad
```

## Components Implemented

### 1. Vapi Service Updates (`vapi.service.ts`)

Added folder management:
- ✅ `createFolder(name)` - Create folder for clinic
- ✅ `listFolders()` - List all folders
- ✅ `deleteFolder(folderId)` - Clean up orphaned folders
- ✅ `folderId` parameter support in `VapiAssistantConfig`
- ✅ `folderId` parameter support in `VapiSquadConfig`

### 2. TypeScript Types

Added new interfaces:
- ✅ `VapiFolder` - Folder metadata
- ✅ Updated `VapiAssistantConfig` with optional `folderId`
- ✅ Updated `VapiSquadConfig` with optional `folderId`

### 3. Documentation

Created comprehensive guides:
- ✅ `VAPI_ARCHITECTURE.md` - Updated with per-clinic approach
- ✅ `VAPI_PER_CLINIC_IMPLEMENTATION.md` - Complete implementation guide
- ✅ This summary document

## How It Works

### Setup Flow

```typescript
// 1. Clinic signs up
const clinicData = {
  id: 'clinic_123',
  name: 'Smile Dental',
  businessHours: 'Mon-Fri 9am-6pm',
  address: '123 Main St, San Francisco',
  services: ['Cleanings', 'Fillings', 'Root Canals'],
  insuranceAccepted: ['BlueCross', 'Aetna']
};

// 2. Setup their squad (creates folder, squad, assistants)
const result = await setupClinicSquad(
  clinicData,
  '+14155551234',
  twilioSid,
  twilioToken
);

// 3. Save to database
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

### Call Flow

```
Customer calls +1-415-555-1234
  ↓
Vapi identifies phone → Links to "Smile Dental Squad"
  ↓
Triage Assistant: "Hi, welcome to Smile Dental! I'm Riley. How can I help?"
  ↓
Customer: "I have severe tooth pain"
  ↓
AI detects emergency → Transfers to Emergency Assistant
  ↓
Emergency: "I understand this is urgent. What's your name?"
  ↓
Collects info → Calls bookEmergencyAppointment tool
  ↓
Emergency: "I have you scheduled for today at 2pm. We'll see you soon!"
```

### Webhook Flow

```typescript
// Webhook receives tool call
POST /api/vapi/webhook
{
  call: { phoneNumberId: "phone_abc123" },
  message: {
    type: "function-call",
    functionCall: { 
      name: "bookAppointment",
      parameters: { /* ... */ }
    }
  }
}

// Lookup clinic from phone number
const phoneRecord = await db.vapiPhoneNumber.findUnique({
  where: { vapi_phone_id: "phone_abc123" },
  include: { account: true }
});

// Book appointment for this clinic
const appointment = await bookClinicAppointment(
  phoneRecord.account_id,
  parameters
);

// Return result to AI
return { 
  result: { 
    confirmationNumber: appointment.id,
    message: "Appointment confirmed!"
  } 
};
```

## Database Schema

### Required Table Update

```sql
-- Add folder tracking
ALTER TABLE public.vapi_phone_numbers
ADD COLUMN vapi_folder_id TEXT;

CREATE INDEX idx_vapi_phone_numbers_folder 
ON public.vapi_phone_numbers(vapi_folder_id);

COMMENT ON COLUMN public.vapi_phone_numbers.vapi_folder_id 
IS 'Vapi folder ID for organizing clinic assistants';
```

### Complete Schema

```sql
CREATE TABLE public.vapi_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  vapi_phone_id TEXT NOT NULL UNIQUE,
  vapi_squad_id TEXT,
  vapi_assistant_id TEXT,
  vapi_folder_id TEXT, -- NEW COLUMN
  friendly_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Benefits

### User Experience
- ✅ Instant personalized greeting
- ✅ Zero latency
- ✅ Professional branding
- ✅ Context-aware from first word

### Developer Experience
- ✅ Simpler webhook (no context fetching)
- ✅ Organized Vapi dashboard (folders)
- ✅ Easy debugging (clear separation)
- ✅ Straightforward updates (bulk API)

### Cost
- ✅ Same per-minute rate as shared approach
- ✅ No penalty for creating multiple squads
- ✅ Only pay for call time, not squad creation

## Implementation Checklist

### Phase 1: Core Setup
- [x] Add folder management to `VapiService`
- [x] Update TypeScript types
- [x] Document architecture decision
- [x] Create implementation guide
- [ ] Add `vapi_folder_id` to database schema
- [ ] Implement `setupClinicSquad` function
- [ ] Build webhook handler for tools

### Phase 2: Testing
- [ ] Test clinic squad setup
- [ ] Test phone number calling
- [ ] Test assistant routing (triage → emergency/scheduler)
- [ ] Test tool calls (booking, availability)
- [ ] Verify folder organization in Vapi dashboard

### Phase 3: Management
- [ ] Build admin UI for squad management
- [ ] Implement `updateClinicSquad` function
- [ ] Add bulk update capabilities
- [ ] Create monitoring dashboard
- [ ] Build audit/cleanup tools

### Phase 4: Production
- [ ] Migrate existing clinics (if any)
- [ ] Set up monitoring and alerts
- [ ] Document clinic customization options
- [ ] Train support team on troubleshooting

## Key Files

### Implementation
- `apps/frontend/packages/shared/src/vapi/vapi.service.ts` - Vapi service with folder support
- `apps/frontend/packages/shared/src/vapi/server.ts` - Server exports
- `apps/frontend/packages/shared/src/vapi/setup-clinic-squad.ts` - Squad setup function (to be created)
- `apps/frontend/apps/web/app/api/vapi/webhook/route.ts` - Webhook handler (to be created)

### Documentation
- `docs/VAPI_ARCHITECTURE.md` - Architecture overview (updated)
- `docs/VAPI_PER_CLINIC_IMPLEMENTATION.md` - Implementation guide (new)
- `docs/VAPI_IMPLEMENTATION_SUMMARY.md` - This summary (new)

## Next Steps

1. **Database Migration**
   ```bash
   # Create migration for vapi_folder_id column
   pnpm --filter web supabase:db:diff -f add_vapi_folder_id
   ```

2. **Implement Setup Function**
   - Create `apps/frontend/packages/shared/src/vapi/setup-clinic-squad.ts`
   - Follow the guide in `VAPI_PER_CLINIC_IMPLEMENTATION.md`

3. **Build Webhook Handler**
   - Create `apps/frontend/apps/web/app/api/vapi/webhook/route.ts`
   - Handle `checkAvailability`, `bookAppointment`, `bookEmergencyAppointment`

4. **Test End-to-End**
   - Set up one test clinic
   - Call the number and verify complete flow
   - Check Vapi dashboard for folder organization

## Questions & Answers

### Q: Why not use Vapi workflows?
**A:** Workflows are being deprecated by Vapi in favor of squads. We use squads with well-structured prompts and tools instead.

### Q: How do we handle knowledge base per clinic?
**A:** Clinic-specific information is injected directly into assistant system prompts. This is faster than using Vapi's file-based knowledge base and can't be dynamically switched per call anyway.

### Q: What about updating all squads when behavior changes?
**A:** We build bulk update functions that iterate through all squads and update specific assistants. This is automatable via API.

### Q: Can clinics have multiple phone numbers?
**A:** Yes! Each phone number links to the clinic's squad. Multiple numbers can use the same squad.

### Q: How do we clean up old squads/folders?
**A:** We build audit functions that compare Vapi folders with active clinics in our database, then delete orphaned folders.

## Related Resources

- [Vapi Documentation](https://docs.vapi.ai/)
- [Vapi API Reference](https://docs.vapi.ai/api-reference)
- [Vapi Discord](https://discord.gg/vapi) - For support and updates
- Internal docs:
  - `VAPI_ARCHITECTURE.md`
  - `VAPI_PER_CLINIC_IMPLEMENTATION.md`
  - `VAPI_TESTING_GUIDE.md`
  - `VAPI_ADVANCED_FEATURES.md`

---

**Last Updated:** 2024-02-04  
**Status:** Ready for implementation  
**Next Action:** Database migration and squad setup function
