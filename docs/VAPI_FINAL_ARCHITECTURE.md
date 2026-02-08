# Vapi Phone Integration - Complete Solution

## Quick Answers to Your Questions

### Q: Is Vapi + Twilio transfer to human supported?
**A: YES!** ✅ Fully supported via two methods:
1. **Vapi native transfer** - Direct phone number transfer
2. **Twilio conference** - Bridge AI and human together

### Q: Can clinic keep their existing number?
**A: YES!** ✅ With all three integration methods:
- **Ported**: Number moves to Twilio (patients dial same number)
- **Forwarded**: Clinic forwards to Twilio (patients dial same number)
- **SIP**: PBX routes to Twilio (patients dial same number)

**Patients ALWAYS dial the clinic's original number!**

### Q: Can clinics change integration method later?
**A: YES!** ✅ Designed for easy upgrades:
- Start with forwarding (5-minute setup)
- Upgrade to SIP (better routing)
- Upgrade to porting (best quality)

### Q: Are Vapi folders supported?
**A: NO via API** ❌ Folders are UI-only in Vapi dashboard
**Alternative:** Use naming prefixes like `Clinic: Smile Dental - Assistant Name`

## Architecture Summary

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│ PATIENT'S PHONE                                              │
│ Dials: +1-416-555-1234 (clinic's original number)           │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ INTEGRATION LAYER (Method-Specific)                         │
├──────────────────────────────────────────────────────────────┤
│  Ported:     Call arrives at Twilio (owns the number)       │
│  Forwarded:  Carrier forwards to Twilio number              │
│  SIP:        PBX routes to clinic-slug@parlae.sip.twilio.com│
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ YOUR WEBHOOK: /api/twilio/voice                             │
│ - Identifies clinic from 'To' number                        │
│ - Checks availability settings                              │
│ - Decides: AI or Fallback                                   │
└──────────────┬───────────────────────────────────────────────┘
               │
               ├─ AI Not Available ──┐
               │                     ▼
               │          ┌──────────────────────┐
               │          │ FALLBACK             │
               │          │ - Voicemail          │
               │          │ - Forward to staff   │
               │          │ - Busy signal        │
               │          └──────────────────────┘
               │
               ├─ AI Available ──────┐
               │                     ▼
               │          ┌──────────────────────────────┐
               │          │ VAPI (AI Assistant)          │
               │          │ Squad answers call           │
               │          └─────────┬────────────────────┘
               │                    │
               │                    │ Emergency Detected
               │                    ▼
               │          ┌──────────────────────────────┐
               │          │ TRANSFER TO HUMAN            │
               │          │ Calls: staff_forward_number  │
               │          │ Bridges: AI + Human + Patient│
               │          └──────────────────────────────┘
               │
               └──────────────────────────────────────────────┘
```

### Database Schema

**New Columns Added:**

```sql
accounts:
  - phone_integration_method: 'none' | 'ported' | 'forwarded' | 'sip' | 'pending'
  - phone_integration_settings: JSONB (method-specific config)
  - ai_availability_settings: JSONB (when AI answers)

vapi_phone_numbers:
  - integration_method: 'ported' | 'forwarded' | 'sip'
  - original_phone_number: Clinic's public number
  - twilio_number: Twilio number (if forwarded or ported)
  - sip_uri: SIP URI (if using SIP)
  - staff_forward_number: Emergency transfer number
  - transfer_enabled: Boolean
  - integration_status: 'pending' | 'testing' | 'active' | 'failed'
```

## UX Flow: Onboarding Wizard

### Step 1: Choose Integration Method

```
┌─────────────────────────────────────────┐
│ How to Connect Your Phone?             │
├─────────────────────────────────────────┤
│                                         │
│  📞 Quick Setup (Call Forwarding)      │
│     Setup in 5 minutes                  │
│     [Choose This] →                     │
│                                         │
│  🏆 Best Quality (Port Number)         │
│     7-14 days setup                     │
│     [Choose This] →                     │
│                                         │
│  🏢 Enterprise (PBX Integration)       │
│     Requires IT assistance              │
│     [Choose This] →                     │
│                                         │
└─────────────────────────────────────────┘
```

### Step 2: Method-Specific Setup

**Forwarding:**
```
┌─────────────────────────────────────────┐
│ Setup Call Forwarding                   │
├─────────────────────────────────────────┤
│                                         │
│ Your clinic number:                     │
│ +1-416-555-1234                        │
│                                         │
│ Forward calls to:                       │
│ ┌─────────────────────────────┐        │
│ │ +1-647-555-9999            │ [Copy] │
│ └─────────────────────────────┘        │
│                                         │
│ Steps:                                  │
│ 1. Call your phone provider            │
│ 2. Enable call forwarding               │
│ 3. Test by calling your number          │
│                                         │
│ [Test Setup] [Next: Configure Hours] → │
└─────────────────────────────────────────┘
```

**SIP:**
```
┌─────────────────────────────────────────┐
│ Connect Your Phone System               │
├─────────────────────────────────────────┤
│                                         │
│ Your SIP URI:                           │
│ ┌───────────────────────────────────┐  │
│ │ smile-dental@parlae.sip.twilio.com│  │
│ └───────────────────────────────────┘  │
│ [Copy]                                  │
│                                         │
│ What's your phone system?               │
│ [ RingCentral ▼ ]                      │
│                                         │
│ Instructions:                           │
│ 1. Open RingCentral Admin Portal       │
│ 2. Add External SIP Destination         │
│ 3. Paste SIP URI above                  │
│ 4. Set route: After Hours → AI         │
│                                         │
│ [Watch Video Guide]                     │
│ [Test Connection] [Next] →              │
└─────────────────────────────────────────┘
```

### Step 3: Configure Availability

```
┌─────────────────────────────────────────┐
│ When Should AI Answer?                  │
├─────────────────────────────────────────┤
│                                         │
│ ⚪ Always (24/7)                        │
│ ⚪ After-Hours Only                     │
│ ⚪ Overflow (When Staff Busy)           │
│ 🔘 Custom Schedule                      │
│                                         │
│ Custom Schedule:                        │
│ Monday:    [09:00] to [17:00] ✅       │
│ Tuesday:   [09:00] to [17:00] ✅       │
│ ...                                     │
│                                         │
│ Emergency Transfer:                     │
│ Staff number: [+1-416-555-5678]        │
│ [✓] Enable transfer to human           │
│                                         │
│ [Save & Complete Setup] →               │
└─────────────────────────────────────────┘
```

### Step 4: Test & Go Live

```
┌─────────────────────────────────────────┐
│ ✅ Setup Complete!                      │
├─────────────────────────────────────────┤
│                                         │
│ Your AI receptionist is live at:       │
│ +1-416-555-1234                        │
│                                         │
│ [Call Test Number]                      │
│                                         │
│ Test Script:                            │
│ • "I need an appointment" → Booking    │
│ • "This is an emergency" → Transfer    │
│ • "What are your hours?" → Info        │
│                                         │
│ [View Dashboard] [Customize AI] →       │
└─────────────────────────────────────────┘
```

## Implementation Files Created

### 1. Database Migration
- **File:** `docs/VAPI_PHONE_INTEGRATION_IMPLEMENTATION.md`
- **What:** Schema for phone integration, availability settings, transfer config

### 2. Server Actions
- **File:** `apps/frontend/packages/shared/src/phone-integration/actions.ts`
- **Functions:**
  - `setupForwardingIntegration()` - Purchase Twilio number, setup forwarding
  - `setupSIPIntegration()` - Generate SIP URI, return PBX instructions
  - `updateAvailabilitySettings()` - Configure when AI answers
  - `testPhoneIntegration()` - Test the setup

### 3. Twilio Webhook
- **File:** `apps/frontend/apps/web/app/api/twilio/voice/route.ts`
- **What:** Handles ALL inbound calls (ported, forwarded, SIP)
- **Logic:**
  1. Identify clinic from 'To' number
  2. Check availability settings
  3. Route to AI or fallback

### 4. Transfer to Human Tool
- **File:** `apps/frontend/apps/web/app/api/vapi/tools/transfer-to-human/route.ts`
- **What:** Vapi calls this when AI needs to transfer to human
- **Features:**
  - Gets staff number from database
  - Alerts staff via SMS
  - Returns transfer instructions to Vapi

### 5. Documentation
- `docs/VAPI_PHONE_INTEGRATION.md` - Three integration methods explained
- `docs/VAPI_PRODUCTION_SQUAD_DESIGN.md` - Squad design with all assistants
- `docs/VAPI_COMPLETE_IMPLEMENTATION_SUMMARY.md` - Overview
- `docs/VAPI_ARCHITECTURE.md` - Updated architecture

## UI Components Needed

### Onboarding Flow
1. `/app/home/[account]/phone-setup/choose-method/page.tsx`
2. `/app/home/[account]/phone-setup/setup-forwarding/page.tsx`
3. `/app/home/[account]/phone-setup/setup-porting/page.tsx`
4. `/app/home/[account]/phone-setup/setup-sip/page.tsx`
5. `/app/home/[account]/phone-setup/configure-availability/page.tsx`
6. `/app/home/[account]/phone-setup/complete/page.tsx`

### Management Pages
7. `/app/home/[account]/phone-settings/page.tsx` - Main settings
8. `/app/home/[account]/phone-settings/availability/page.tsx` - Availability config
9. `/app/home/[account]/phone-settings/change-method/page.tsx` - Switch integration

### Components
- `BusinessHoursEditor` - Configure business hours
- `ScheduleEditor` - Custom schedule builder
- `MethodCard` - Integration method selector
- `ConnectionStatus` - SIP connection tester
- `PhoneNumberInput` - Validated phone input
- `TestCallButton` - Trigger test calls

## Next Implementation Steps

### Phase 1: Core Infrastructure (Week 1)
- [x] Database migration schema designed
- [x] TypeScript types defined
- [x] Server actions for setup
- [x] Twilio webhook handler
- [x] Transfer to human tool
- [ ] Run database migration
- [ ] Test webhook locally
- [ ] Test transfer functionality

### Phase 2: Onboarding UI (Week 2)
- [ ] Choose method page
- [ ] Forwarding setup flow
- [ ] SIP setup flow  
- [ ] Availability configuration
- [ ] Test & complete page
- [ ] Guide videos/screenshots

### Phase 3: Management UI (Week 3)
- [ ] Phone settings dashboard
- [ ] Edit availability settings
- [ ] Change integration method
- [ ] Call analytics
- [ ] Staff alert configuration

### Phase 4: Advanced Features (Week 4)
- [ ] Port number wizard
- [ ] SIP trunk creation (Twilio API)
- [ ] Outbound call system
- [ ] Call recordings management
- [ ] Performance monitoring

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Per-clinic squads** | Zero latency, personalized greeting, no cost penalty |
| **Settings-based availability** | Simpler than routing to different agents |
| **ONE SIP trunk** | Scales to unlimited clinics, no API calls per clinic |
| **Naming prefixes** | Since folders aren't in API, use naming for organization |
| **Transfer via tool** | Vapi handles the actual transfer, you provide staff number |
| **Three integration methods** | Flexibility for different customer segments |

## How Transfer to Human Actually Works

### Scenario: Patient with Emergency

```
1. Patient: "I'm having severe chest pain... err, tooth pain and bleeding"
   ↓
2. AI Emergency Agent recognizes severity
   ↓
3. AI: "I understand this is urgent. Let me connect you to our staff right away."
   ↓
4. AI calls transferToHuman tool with:
   {
     reason: "life-threatening",
     summary: "Patient has severe tooth pain and bleeding",
     patientInfo: { name: "John", phone: "+14165551234" }
   }
   ↓
5. Your webhook receives tool call
   ↓
6. Webhook looks up: staff_forward_number from database
   ↓
7. Webhook sends SMS to staff: "URGENT: Transfer incoming..."
   ↓
8. Webhook returns to Vapi:
   {
     result: {
       action: "transfer",
       transferTo: "+14165555678", // Staff number
       message: "Transferring you now..."
     }
   }
   ↓
9. Vapi transfers the call to staff number
   ↓
10. Staff answers: "Hello, this is Dr. Smith. I understand you have an emergency?"
    ↓
11. Patient is now talking to human staff member
```

### Technical Implementation

Vapi supports transfer via the `transferCall` action in tool responses:

```typescript
// In your webhook when AI calls transferToHuman
return NextResponse.json({
  result: {
    success: true,
    action: 'transfer',
    transferTo: staffPhoneNumber,
    message: 'Transferring you to our staff now. Please hold.'
  }
});
```

Vapi then:
1. Announces the message to the patient
2. Places call to `transferTo` number
3. Bridges patient and staff together
4. AI ends its participation

### Alternative: Conference Bridge

For more control (keep AI on call, supervisor mode):

```typescript
// In Twilio webhook, create conference
const twiml = new VoiceResponse();
const dial = twiml.dial();

dial.conference({
  startConferenceOnEnter: true,
  endConferenceOnExit: false,
  waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient'
}, `clinic-${clinicId}-${callSid}`);

// Dial staff into same conference
await twilioClient.calls.create({
  to: staffNumber,
  from: clinicTwilioNumber,
  url: joinConferenceUrl
});

// Now: Patient + AI + Staff are all on the same call
// AI can drop off or stay to take notes
```

## Files to Create/Update

### Backend Files
1. ✅ `apps/frontend/packages/shared/src/phone-integration/actions.ts`
2. ✅ `apps/frontend/apps/web/app/api/twilio/voice/route.ts`
3. ✅ `apps/frontend/apps/web/app/api/vapi/tools/transfer-to-human/route.ts`
4. ⏳ `apps/frontend/apps/web/app/api/twilio/sip/route.ts` (SIP-specific handler)
5. ⏳ `apps/frontend/apps/web/app/api/twilio/voicemail/route.ts` (Voicemail handler)

### Database
6. ⏳ Migration: Add columns to `accounts` and `vapi_phone_numbers`

### Frontend Components
7. ⏳ Onboarding wizard (6 pages)
8. ⏳ Settings management UI
9. ⏳ Call analytics dashboard

### Services
10. ⏳ Update `vapi.service.ts` - Remove folder methods, keep core
11. ⏳ Update `twilio.service.ts` - Add webhook configuration method

## Testing Checklist

### Test Call Forwarding
- [ ] Purchase Twilio number
- [ ] Configure webhook
- [ ] Forward calls manually
- [ ] Verify AI answers
- [ ] Test transfer to human
- [ ] Test voicemail fallback

### Test SIP Integration
- [ ] Generate SIP URI
- [ ] Configure test PBX
- [ ] Make test call via SIP
- [ ] Verify AI answers
- [ ] Test after-hours routing
- [ ] Test transfer to human

### Test Availability Settings
- [ ] Test "always" mode
- [ ] Test "after-hours-only" mode
- [ ] Test "overflow-only" mode
- [ ] Test custom schedule
- [ ] Test each fallback type

### Test Emergency Transfer
- [ ] Trigger emergency scenario
- [ ] Verify AI calls transferToHuman tool
- [ ] Verify staff receives SMS alert
- [ ] Verify call transfers successfully
- [ ] Verify both parties can hear each other

## Next Actions

Would you like me to:

1. **Run the database migration** - Add the new columns
2. **Create the onboarding wizard UI** - All 6 pages
3. **Build the settings management pages** - Configure availability
4. **Test the transfer functionality** - Verify emergency transfers work
5. **Create setup guides** - PBX-specific instructions with screenshots

The infrastructure is ready - we just need to build the UI and test it! 🚀

---

**All Documentation:**
- `VAPI_ARCHITECTURE.md` - Overall architecture
- `VAPI_PHONE_INTEGRATION.md` - Three integration methods
- `VAPI_PHONE_INTEGRATION_IMPLEMENTATION.md` - Database schema & types
- `VAPI_PRODUCTION_SQUAD_DESIGN.md` - Squad design with tools
- `VAPI_COMPLETE_IMPLEMENTATION_SUMMARY.md` - This summary
- `VAPI_PER_CLINIC_IMPLEMENTATION.md` - Per-clinic setup guide
