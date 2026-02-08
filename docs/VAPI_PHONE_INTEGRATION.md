# Vapi Phone Integration & Routing Options

## Overview

This document covers three ways to integrate clinic phone numbers with Vapi, plus conditional availability settings (after-hours, high-volume).

## Phone Integration Options

### Option 1: Port Number to Twilio (Best Quality)

**Description:** Transfer the clinic's phone number from their current carrier to Twilio.

**How It Works:**
```
Patient calls clinic's existing number (e.g., +1-416-555-1234)
  ↓
Call arrives at Twilio (now owns the number)
  ↓
Twilio webhook routes to Vapi
  ↓
AI assistant answers
```

**Pros:**
- ✅ Best call quality (no forwarding hop)
- ✅ Perfect caller ID preservation
- ✅ Full control over routing
- ✅ Can use clinic number for outbound caller ID
- ✅ Supports all Twilio features

**Cons:**
- ❌ Requires LOA (Letter of Authorization) + bill from current carrier
- ❌ 7-14 day porting process
- ❌ Clinic temporarily loses control of number
- ❌ May affect fax lines if sharing the number

**Implementation:**

```typescript
// 1. Submit port request via Twilio API
const portRequest = await twilioClient.incomingPhoneNumbers.portRequests.create({
  phoneNumber: '+14165551234',
  accountSid: twilioAccountSid,
  // ... LOA documents
});

// 2. Once ported, configure webhook
await twilioClient.incomingPhoneNumbers(phoneNumberSid)
  .update({
    voiceUrl: `${baseUrl}/api/twilio/voice`,
    voiceMethod: 'POST'
  });

// 3. In voice webhook, route to Vapi
// /api/twilio/voice
export async function POST(request: Request) {
  const { From, To, CallSid } = await request.formData();
  
  // Get clinic from phone number
  const clinic = await getClinicByTwilioNumber(To);
  
  // Check if AI should answer (settings-based)
  const shouldAIAnswer = await checkAvailabilitySettings(clinic.id);
  
  if (!shouldAIAnswer.available) {
    // Route to clinic's fallback (voicemail, forward to staff, etc.)
    return forwardToClinicFallback(clinic);
  }
  
  // Connect to Vapi
  return connectToVapi(clinic, From);
}
```

**Best for:**
- Clinics wanting full AI receptionist replacement
- Maximum call quality requirements
- Long-term partnerships

---

### Option 2: Call Forwarding (Fastest Setup)

**Description:** Clinic keeps their number and forwards calls to a Twilio number you provide.

**How It Works:**
```
Patient calls clinic's existing number (e.g., +1-416-555-1234)
  ↓
Clinic's carrier forwards to your Twilio number (e.g., +1-647-555-9999)
  ↓
Twilio receives forwarded call
  ↓
Twilio webhook routes to Vapi
  ↓
AI assistant answers
```

**Pros:**
- ✅ Setup in minutes (no porting wait)
- ✅ Clinic keeps their number
- ✅ Easy to disable (just turn off forwarding)
- ✅ No paperwork

**Cons:**
- ❌ Caller ID may show clinic number instead of patient's
- ❌ Extra hop can reduce quality
- ❌ DTMF (press 1/2) may not work
- ❌ Can't control when forwarding happens (carrier-dependent)

**Implementation:**

```typescript
// 1. Purchase Twilio number for clinic
const twilioNumber = await twilioClient.incomingPhoneNumbers.create({
  phoneNumber: '+16475559999',
  friendlyName: `AI Receptionist - ${clinic.name}`
});

// 2. Configure webhook
await twilioClient.incomingPhoneNumbers(twilioNumber.sid)
  .update({
    voiceUrl: `${baseUrl}/api/twilio/voice`,
    voiceMethod: 'POST'
  });

// 3. Give clinic instructions
const instructions = {
  clinicName: clinic.name,
  forwardToNumber: twilioNumber.phoneNumber,
  steps: [
    'Call your phone carrier customer service',
    `Set up call forwarding to ${twilioNumber.phoneNumber}`,
    'Choose "Always Forward" or "Forward When Busy/No Answer"',
    'Test by calling your clinic number'
  ]
};

// 4. In webhook, handle forwarded calls
export async function POST(request: Request) {
  const { From, To, CallSid } = await request.formData();
  
  // 'To' is YOUR Twilio number
  // 'From' might be clinic number OR original caller (depends on carrier)
  
  // Look up clinic by the Twilio number that received the call
  const clinic = await getClinicByTwilioNumber(To);
  
  // Check availability settings
  const shouldAIAnswer = await checkAvailabilitySettings(clinic.id);
  
  if (!shouldAIAnswer.available) {
    return forwardToClinicFallback(clinic);
  }
  
  return connectToVapi(clinic, From);
}
```

**Best for:**
- Quick pilot/trial setups
- Clinics nervous about changing numbers
- After-hours only scenarios

---

### Option 3: PBX/SIP Trunk Integration (Enterprise Grade)

**Description:** Clinic's phone system (PBX) routes calls to you via SIP protocol.

**How It Works:**
```
Patient calls clinic's existing number (e.g., +1-416-555-1234)
  ↓
PBX receives call (RingCentral, 3CX, Bell, Telus, etc.)
  ↓
PBX routes based on rules:
  - After hours → Send to AI via SIP
  - Overflow (staff busy) → Send to AI via SIP
  - Press 1 for AI, 2 for staff
  ↓
SIP call goes to: clinic-123@yourcompany.sip.twilio.com
  ↓
Twilio receives SIP call
  ↓
Twilio webhook routes to Vapi based on clinic-123
  ↓
AI assistant answers
```

**Pros:**
- ✅ Clinic keeps their number
- ✅ Best caller ID preservation
- ✅ Flexible routing (after-hours, overflow, menu)
- ✅ No call forwarding latency
- ✅ Works with existing phone systems
- ✅ Enterprise-grade quality
- ✅ Clinic controls when AI answers

**Cons:**
- ⚠️ Requires PBX admin access
- ⚠️ 10-30 minute setup per clinic
- ⚠️ May need IT assistance

**Architecture: ONE SIP Trunk for ALL Clinics**

```typescript
// ONE-TIME SETUP: Create Elastic SIP Trunk (do this once)
// Via Twilio Console or API:

const sipTrunk = await twilioClient.trunking.v1.trunks.create({
  friendlyName: 'Parlae AI - All Clinics',
  domainName: 'parlae.sip.twilio.com' // Your custom domain
});

// Configure termination URI (where calls go)
await twilioClient.trunking.v1.trunks(sipTrunk.sid)
  .terminationSettings()
  .update({
    callingPermissions: {
      allowedInternationalDestinations: ['CA', 'US']
    }
  });

// Add webhook
await twilioClient.trunking.v1.trunks(sipTrunk.sid)
  .update({
    voiceUrl: `${baseUrl}/api/twilio/sip`,
    voiceMethod: 'POST'
  });
```

**Per-Clinic Setup (No API calls needed!):**

```typescript
// When clinic onboards, just generate their SIP URI string
function generateClinicSIPUri(clinicId: string): string {
  const slug = clinic.slug; // e.g., "smile-dental"
  return `${slug}@parlae.sip.twilio.com`;
}

// Store in database
await db.clinic.update({
  where: { id: clinicId },
  data: {
    sip_uri: 'smile-dental@parlae.sip.twilio.com',
    sip_integration_enabled: true
  }
});

// Give clinic instructions
const setupInstructions = {
  title: 'Connect Your Phone System to Parlae AI',
  sipUri: 'smile-dental@parlae.sip.twilio.com',
  steps: {
    ringcentral: [
      'Go to RingCentral Admin Portal',
      'Navigate to Phone System > Auto-Receptionist',
      'Add External Number or SIP Destination',
      'Paste: smile-dental@parlae.sip.twilio.com',
      'Set routing rule: After Hours → AI Receptionist'
    ],
    generic: [
      'Log into your phone system admin panel',
      'Add a new SIP trunk or external destination',
      'Enter SIP URI: smile-dental@parlae.sip.twilio.com',
      'Configure when calls should route to AI (after-hours, overflow, etc.)',
      'Save and test'
    ]
  }
};
```

**Webhook Handler:**

```typescript
// /api/twilio/sip
export async function POST(request: Request) {
  const formData = await request.formData();
  
  const from = formData.get('From'); // Original caller number
  const to = formData.get('To'); // e.g., "smile-dental@parlae.sip.twilio.com"
  const callSid = formData.get('CallSid');
  
  // Parse clinic identifier from SIP URI
  const clinicSlug = to.split('@')[0]; // "smile-dental"
  
  // Look up clinic
  const clinic = await db.clinic.findUnique({
    where: { slug: clinicSlug }
  });
  
  if (!clinic) {
    return new Response(createTwiMLError('Clinic not found'), {
      headers: { 'Content-Type': 'application/xml' }
    });
  }
  
  // Check availability settings (this is where after-hours/high-volume logic goes)
  const shouldAIAnswer = await checkAvailabilitySettings(clinic.id);
  
  if (!shouldAIAnswer.available) {
    // PBX shouldn't have routed here, but handle gracefully
    return forwardToClinicFallback(clinic);
  }
  
  // Connect to Vapi
  return connectToVapi(clinic, from);
}
```

**Security Options:**

```typescript
// Option A: IP Allowlist (Simplest)
// Add clinic's PBX IP to allowlist
await twilioClient.trunking.v1.trunks(sipTrunk.sid)
  .ipAccessControlLists()
  .create({
    ipAccessControlListSid: aclSid
  });

// Option B: SIP Authentication (More Secure)
// Generate credentials per clinic
await twilioClient.trunking.v1.trunks(sipTrunk.sid)
  .credentialLists()
  .create({
    credentialListSid: credListSid
  });

const credentials = {
  username: `clinic-${clinic.id}`,
  password: generateSecurePassword()
};
```

**Best for:**
- Clinics with existing PBX systems
- After-hours only scenarios
- Overflow when staff is busy
- Press 1 for AI, 2 for staff menus
- Enterprise clients

---

## Availability Settings (Not Routing)

Instead of routing to "after-hours agent," you control **when the squad is available to answer**.

### Database Schema

```sql
-- Add to clinics or vapi_phone_numbers table
ALTER TABLE public.accounts 
ADD COLUMN ai_availability_settings JSONB DEFAULT '{
  "mode": "always",
  "afterHours": {
    "enabled": false
  },
  "highVolume": {
    "enabled": false,
    "threshold": 5
  },
  "customSchedule": {
    "enabled": false,
    "rules": []
  }
}'::jsonb;
```

### Availability Modes

```typescript
type AvailabilityMode = 
  | 'always'           // AI always answers
  | 'after-hours-only' // AI only when clinic closed
  | 'overflow-only'    // AI only when staff busy
  | 'scheduled'        // AI based on custom schedule
  | 'disabled';        // AI never answers

interface AvailabilitySettings {
  mode: AvailabilityMode;
  
  // After-hours config
  afterHours: {
    enabled: boolean;
    businessHours: {
      timezone: string;
      schedule: {
        monday: { open: string; close: string } | null;
        tuesday: { open: string; close: string } | null;
        // ... rest of week
      };
      holidays: string[]; // ISO dates when closed
    };
  };
  
  // High volume config
  highVolume: {
    enabled: boolean;
    threshold: number; // Max concurrent calls before AI kicks in
    estimatedWaitMinutes: number; // When to offer callback
  };
  
  // Custom schedule
  customSchedule: {
    enabled: boolean;
    rules: Array<{
      dayOfWeek: number; // 0-6
      startTime: string; // "09:00"
      endTime: string; // "17:00"
      action: 'enable' | 'disable';
    }>;
  };
  
  // Fallback when AI is not available
  fallback: {
    type: 'voicemail' | 'forward' | 'busy-signal';
    forwardNumber?: string;
    voicemailGreeting?: string;
  };
}
```

### Check Availability Function

```typescript
async function checkAvailabilitySettings(clinicId: string) {
  const clinic = await db.account.findUnique({
    where: { id: clinicId },
    select: {
      ai_availability_settings: true,
      business_hours: true
    }
  });
  
  const settings = clinic.ai_availability_settings as AvailabilitySettings;
  const now = new Date();
  
  // Check mode
  switch (settings.mode) {
    case 'always':
      return { available: true, reason: 'always-on' };
      
    case 'disabled':
      return { available: false, reason: 'disabled' };
      
    case 'after-hours-only':
      const isAfterHours = !isWithinBusinessHours(now, settings.afterHours.businessHours);
      return {
        available: isAfterHours,
        reason: isAfterHours ? 'after-hours' : 'business-hours'
      };
      
    case 'overflow-only':
      const activeCallsCount = await getActiveCallsCount(clinicId);
      const isOverThreshold = activeCallsCount >= settings.highVolume.threshold;
      return {
        available: isOverThreshold,
        reason: isOverThreshold ? 'overflow' : 'under-capacity',
        activeCallsCount,
        threshold: settings.highVolume.threshold
      };
      
    case 'scheduled':
      const isScheduledTime = checkCustomSchedule(now, settings.customSchedule.rules);
      return {
        available: isScheduledTime,
        reason: isScheduledTime ? 'scheduled-on' : 'scheduled-off'
      };
  }
}

function isWithinBusinessHours(
  now: Date,
  businessHours: AvailabilitySettings['afterHours']['businessHours']
): boolean {
  const timezone = businessHours.timezone;
  const localNow = toZonedTime(now, timezone);
  
  const dayOfWeek = format(localNow, 'EEEE').toLowerCase();
  const daySchedule = businessHours.schedule[dayOfWeek];
  
  if (!daySchedule) return false; // Closed this day
  
  const currentTime = format(localNow, 'HH:mm');
  return currentTime >= daySchedule.open && currentTime < daySchedule.close;
}

async function getActiveCallsCount(clinicId: string): Promise<number> {
  // Count active calls for this clinic
  const count = await db.vapiCallLog.count({
    where: {
      account_id: clinicId,
      status: 'in-progress',
      created_at: {
        gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
      }
    }
  });
  
  return count;
}
```

### Implementation in Webhook

```typescript
export async function POST(request: Request) {
  const { From, To, CallSid } = await request.formData();
  
  // Identify clinic (varies by integration method)
  const clinic = await identifyClinic(To);
  
  // Check if AI should answer based on settings
  const availability = await checkAvailabilitySettings(clinic.id);
  
  if (!availability.available) {
    logger.info({
      clinicId: clinic.id,
      reason: availability.reason,
      callSid: CallSid
    }, 'AI not available - routing to fallback');
    
    // Route to fallback
    return routeToFallback(clinic, availability.reason);
  }
  
  // AI is available - connect to Vapi
  logger.info({
    clinicId: clinic.id,
    reason: availability.reason,
    callSid: CallSid
  }, 'AI answering call');
  
  return connectToVapi(clinic, From, CallSid);
}

function routeToFallback(
  clinic: Clinic,
  reason: string
): Response {
  const settings = clinic.ai_availability_settings as AvailabilitySettings;
  const fallback = settings.fallback;
  
  const twiml = new VoiceResponse();
  
  switch (fallback.type) {
    case 'voicemail':
      twiml.say(fallback.voicemailGreeting || `Thank you for calling ${clinic.name}. Please leave a message.`);
      twiml.record({
        maxLength: 300,
        recordingStatusCallback: `${baseUrl}/api/twilio/voicemail`,
        recordingStatusCallbackEvent: ['completed']
      });
      break;
      
    case 'forward':
      twiml.say(`Connecting you now.`);
      twiml.dial(fallback.forwardNumber);
      break;
      
    case 'busy-signal':
      twiml.say(`We're unable to take your call right now. Please try again later.`);
      twiml.hangup();
      break;
  }
  
  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'application/xml' }
  });
}
```

## Routing Decision Matrix

| Integration Method | How Clinic Identified | Caller ID Preserved | Best Use Case |
|--------------------|----------------------|---------------------|---------------|
| **Ported** | `To` = Clinic's number | ✅ Always | Full replacement |
| **Forwarded** | `To` = Your Twilio number | ⚠️ Sometimes | Quick setup |
| **SIP** | Parse from SIP URI | ✅ Usually | Enterprise |

## Implementation Priority

### Phase 1: Call Forwarding (Quick Wins)
- Easy setup for pilots
- Minimal technical requirements
- Quick revenue

### Phase 2: Number Porting (Best Experience)
- Better for serious customers
- Full feature support
- Higher retention

### Phase 3: SIP Trunking (Enterprise)
- Target larger clinics
- Flexible routing options
- Premium pricing tier

## Next Steps

1. ✅ Implement webhook handlers for all three methods
2. ✅ Build availability settings UI
3. ✅ Add business hours configuration
4. ✅ Test high-volume overflow logic
5. ✅ Create setup guides for each integration method
6. ✅ Build fallback routing (voicemail, forward, busy)

---

**Related Documentation:**
- [VAPI_ARCHITECTURE.md](./VAPI_ARCHITECTURE.md) - Overall architecture
- [VAPI_PRODUCTION_SQUAD_DESIGN.md](./VAPI_PRODUCTION_SQUAD_DESIGN.md) - Squad design
- [VAPI_PER_CLINIC_IMPLEMENTATION.md](./VAPI_PER_CLINIC_IMPLEMENTATION.md) - Setup guide
