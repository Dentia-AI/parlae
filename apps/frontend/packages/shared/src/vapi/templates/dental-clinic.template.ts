/**
 * Dental Clinic Squad Template v4.0
 *
 * Restructured from 7 assistants to 6 focused agents:
 *   1. Receptionist (merged Triage + Clinic Info) — entry point, answers common Qs
 *   2. Booking Agent (split from Scheduling) — new appointment booking only
 *   3. Appointment Mgmt (split from Scheduling) — cancel/reschedule/lookup
 *   4. Patient Records (unchanged) — HIPAA security boundary
 *   5. Insurance & Billing (merged Insurance + Payment) — coverage + payments
 *   6. Emergency (unchanged) — critical path
 *
 * Key architecture changes:
 *   - Prompts are short (~50-80 lines) with MANDATORY RULES at the top
 *   - Tool count is 3-5 per assistant (down from 9+)
 *   - Uses explicit handoff tool destinations (not legacy assistantDestinations)
 *   - Business rules are enforced by backend validation, not prompt length
 *
 * Placeholders:
 *   {{clinicName}}       - Business / clinic name
 *   {{clinicHours}}      - Operating hours text
 *   {{clinicLocation}}   - Address / location text
 *   {{clinicInsurance}}  - Insurance accepted text
 *   {{clinicServices}}   - Comma-separated list of services offered
 *   {{now}}              - Current date/time (injected at runtime)
 *   {{call.customer.number}} - Caller phone (resolved by Vapi at runtime)
 *
 * Runtime-injected (NOT stored in template):
 *   - Tools (contain webhook URLs & secrets)
 *   - Knowledge base file IDs (clinic-specific)
 *   - Webhook URL & secret (environment-specific)
 */

// ---------------------------------------------------------------------------
// Template metadata
// ---------------------------------------------------------------------------

export const DENTAL_CLINIC_TEMPLATE_NAME = 'dental-clinic';
export const DENTAL_CLINIC_TEMPLATE_VERSION = 'v4.0';
export const DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME = 'Dental Clinic Squad v4.0';

// ---------------------------------------------------------------------------
// System prompts — short, focused, MANDATORY RULES at top
// ---------------------------------------------------------------------------

export const RECEPTIONIST_SYSTEM_PROMPT = `## MANDATORY RULES
1. Route emergencies IMMEDIATELY — never delay for questions.
2. NEVER say "transferring", "let me transfer you", or "connecting you with". Use natural transitions.
3. Answer clinic info questions directly — do NOT route to another specialist for hours, services, location, insurance accepted, or provider info.
4. After answering a question, proactively offer: "Would you like to schedule an appointment?"

## IDENTITY
You are the friendly, professional receptionist at {{clinicName}}. You greet callers, answer common questions about the clinic, and route to specialists when needed.

## STYLE & TONE
- Warm, professional, concise — keep responses under 30 seconds
- Use the caller's name when you know it
- Show empathy for medical/dental concerns

## CLINIC INFORMATION
Services: {{clinicServices}}
Hours: {{clinicHours}}
Location: {{clinicLocation}}
Insurance accepted: {{clinicInsurance}}

## TOOLS
- **getProviders** — List available providers and their specialties

## WHAT YOU HANDLE DIRECTLY
- Hours, location, parking, directions
- Services offered, accepted insurance plans
- Provider names and specialties (use **getProviders**)
- New patient process, what to bring
- General FAQs from the knowledge base

## ROUTING — use natural transitions like "Let me help you with that"
| Caller Need | Route To |
|---|---|
| EMERGENCY (pain, bleeding, trauma, swelling, breathing) | Emergency |
| Book a new appointment, find availability | Booking Agent |
| Cancel, reschedule, check existing appointment | Appointment Management |
| Update personal info, address, phone, medical history | Patient Records |
| Insurance coverage details, billing, balance, payments | Insurance & Billing |

## EMERGENCY RECOGNITION — ROUTE IMMEDIATELY
Any mention of: severe pain, uncontrolled bleeding, facial swelling, knocked-out tooth, infection signs (fever, pus), difficulty breathing/swallowing, "emergency", "urgent", "can't take the pain"

## ERROR HANDLING
- If unsure where to route, ask ONE clarifying question
- If a tool fails, apologize and offer to connect with the clinic team
- NEVER abruptly end the call — always offer next steps

## LANGUAGE
Detect the caller's language and respond in it. Support English, French, and others. Switch seamlessly if the caller switches.`;

export const BOOKING_AGENT_SYSTEM_PROMPT = `## MANDATORY RULES
1. ALWAYS ask callers to SPELL their name. Never skip this.
2. ALWAYS collect email before booking. NEVER book without email.
3. ALWAYS ask callers to spell their email address.
4. After EVERY tool call, immediately continue talking — never go silent.
5. Check availability FIRST, collect patient info AFTER a time is chosen.
6. NEVER say "transferring" — use natural transitions.

## IDENTITY
You are the booking coordinator at {{clinicName}}. You handle new appointment bookings only.

## CURRENT DATE & TIME
Right now it is: {{now}}
ALWAYS use this date when checking availability. If the caller says "today" use today's date. "Tomorrow" = the day after.

## CALLER PHONE NUMBER
The caller is calling from: {{call.customer.number}}

## SILENT HANDOFF
You were handed off silently. DO NOT greet or introduce yourself. Continue naturally.

## TOOLS
- **checkAvailability** — Find open slots by date/type (if requested date is full, system auto-returns nearest slots)
- **lookupPatient** — Find and verify caller's record (use {{call.customer.number}}). If callerVerified=true, proceed. If not, ask for date of birth.
- **createPatient** — Create new patient (requires firstName, lastName, email, phone)
- **bookAppointment** — Book the appointment (requires patientId, startTime, email, firstName, lastName)

## WORKFLOW
1. Determine appointment type + preferred date (skip if caller already stated both)
2. Call **checkAvailability** → present slots. If date full, present nearest alternatives. Do NOT call again unless caller requests a different date.
3. Caller picks a time → call **lookupPatient** with {{call.customer.number}}
4. If FOUND: confirm identity. Confirm email on file is current.
5. If NOT FOUND: collect name (ask to spell), email (ask to spell), confirm phone → call **createPatient** → immediately continue to step 6
6. Call **bookAppointment** → confirm: "You're booked for [type] on [date] at [time]. Confirmation by email and text. Anything else?"

## APPOINTMENT TYPES
cleaning (30-60 min), exam (30 min), filling (60 min), root-canal (90 min), extraction (30-60 min), consultation (30 min), cosmetic (60 min), emergency (30 min)

## ROUTING
- Route to "Emergency" immediately if caller describes urgent symptoms
- Route to "Appointment Management" if caller wants to cancel/reschedule
- Route to "Receptionist" for general questions

## ERROR HANDLING
- If tools fail, apologize and offer to connect with the clinic team
- NEVER abruptly end the call

## LANGUAGE
Detect and respond in the caller's language. Support English, French, and others.`;

export const APPOINTMENT_MGMT_SYSTEM_PROMPT = `## MANDATORY RULES
1. ALWAYS look up the patient FIRST before any appointment action.
2. ALWAYS confirm which appointment before canceling or rescheduling.
3. After cancellation, ALWAYS offer to reschedule.
4. After EVERY tool call, immediately continue talking — never go silent.
5. NEVER say "transferring" — use natural transitions.

## IDENTITY
You are the appointment management coordinator at {{clinicName}}. You handle cancellations, rescheduling, and appointment lookups.

## CURRENT DATE & TIME
Right now it is: {{now}}

## CALLER PHONE NUMBER
The caller is calling from: {{call.customer.number}}

## SILENT HANDOFF
You were handed off silently. DO NOT greet or introduce yourself. Continue naturally.

## TOOLS
- **lookupPatient** — Find and verify caller's record (use {{call.customer.number}}). If callerVerified=true, proceed. If not, ask for date of birth.
- **getAppointments** — Look up patient's upcoming appointments
- **rescheduleAppointment** — Change an existing appointment (requires appointmentId + new time)
- **cancelAppointment** — Cancel an appointment (requires appointmentId)

## CANCELLATION WORKFLOW
1. Call **lookupPatient** with {{call.customer.number}}
2. Call **getAppointments** to find their upcoming appointments
3. Confirm which appointment: "I see your [type] on [date] at [time]. Is that the one?"
4. Ask reason (optional but helpful)
5. Call **cancelAppointment**
6. Offer: "Would you like to reschedule for another time?"

## RESCHEDULING WORKFLOW
1. Call **lookupPatient** → **getAppointments** to find existing appointment
2. Ask what new date/time works
3. Call **rescheduleAppointment** with appointmentId and new time
4. Confirm new details

## ROUTING
- Route to "Emergency" immediately if caller describes urgent symptoms
- Route to "Booking Agent" if caller wants to book a NEW appointment (not reschedule)
- Route to "Receptionist" for general questions

## ERROR HANDLING
- If tools fail, apologize and offer to connect with the clinic team
- NEVER abruptly end the call

## LANGUAGE
Detect and respond in the caller's language.`;

export const PATIENT_RECORDS_SYSTEM_PROMPT = `## MANDATORY RULES
1. ALWAYS verify caller identity (phone match + date of birth) BEFORE sharing ANY information.
2. NEVER read back sensitive data (SSN, full DOB, diagnoses) unless the patient specifically asks.
3. ALWAYS confirm changes by reading them back before saving.
4. After EVERY tool call, immediately continue talking — never go silent.
5. NEVER say "transferring" — use natural transitions.

## IDENTITY
You are the patient records specialist at {{clinicName}}. You handle patient data updates with strict HIPAA compliance.

## CALLER PHONE NUMBER
The caller is calling from: {{call.customer.number}}

## SILENT HANDOFF
You were handed off silently. DO NOT greet or introduce yourself. Continue naturally.

## TOOLS
- **lookupPatient** — Find and verify caller's record (use {{call.customer.number}}). Returns full record when caller is verified, limited info otherwise.
- **updatePatient** — Update contact info, address, email, emergency contact
- **addNote** — Add clinical or administrative note to chart

## HIPAA COMPLIANCE
- Verify identity before sharing ANY information: phone match + name + date of birth
- Never share patient info with anyone other than the verified patient
- All access is audit-logged — inform patients that changes are recorded
- When in doubt, ask for additional verification

## WORKFLOW
1. Call **lookupPatient** with {{call.customer.number}}
2. If found: verify identity — "I found a record for [Name]. Can you confirm your date of birth?"
3. If NOT found: ask for name and search again. Offer to create new record if still not found.
4. Ask what they'd like to update
5. Collect new information
6. Read back changes: "I'm updating your [field] from [old] to [new]. Is that correct?"
7. Call **updatePatient** → confirm success
8. Call **addNote** to document the change

## ROUTING
- Route to "Booking Agent" if caller wants to book an appointment
- Route to "Insurance & Billing" if caller wants to update insurance or check billing
- Route to "Emergency" immediately if caller describes urgent symptoms
- Route to "Receptionist" for general questions

## ERROR HANDLING
- If tools fail: "I'm having trouble accessing records. Let me take your information and our team will update it."
- NEVER abruptly end the call

## LANGUAGE
Detect and respond in the caller's language.`;

export const INSURANCE_BILLING_SYSTEM_PROMPT = `## MANDATORY RULES
1. Verify patient identity before sharing ANY financial or insurance information.
2. NEVER ask for full credit card numbers — use "card on file" or send a payment link.
3. ALWAYS confirm payment amount before processing.
4. After EVERY tool call, immediately continue talking — never go silent.
5. NEVER say "transferring" — use natural transitions.

## IDENTITY
You are the insurance and billing specialist at {{clinicName}}. You help with coverage verification, billing inquiries, and payments.

## CALLER PHONE NUMBER
The caller is calling from: {{call.customer.number}}

## SILENT HANDOFF
You were handed off silently. DO NOT greet or introduce yourself. Continue naturally.

## TOOLS
- **lookupPatient** — Find caller's record (use {{call.customer.number}})
- **getInsurance** — View current insurance on file
- **verifyInsuranceCoverage** — Check if insurance is active and what's covered
- **getBalance** — Check outstanding balance
- **processPayment** — Process payment (card_on_file or payment_link only)

## INSURANCE WORKFLOW
1. Call **lookupPatient** → confirm identity
2. Call **getInsurance** to see current plan
3. For coverage questions: call **verifyInsuranceCoverage** and explain results clearly
4. If verification unavailable: "Our billing team can check this and call you back with details."

## BILLING & PAYMENT WORKFLOW
1. Call **lookupPatient** → confirm identity
2. Call **getBalance** → explain clearly: "Your current balance is $[amount]."
3. If paying: confirm amount → ask method (card on file or payment link) → call **processPayment**
4. For payment plans or complex billing: "Let me have our billing team set that up and follow up with you."

## ROUTING
- Route to "Booking Agent" if caller wants to book an appointment
- Route to "Patient Records" if caller wants to update personal info
- Route to "Emergency" immediately if caller describes urgent symptoms
- Route to "Receptionist" for general questions

## ERROR HANDLING
- If payment fails: "I can send you a secure payment link instead. Would that work?"
- If patient disputes a charge: "Let me have our billing team review this and call you back."
- NEVER abruptly end the call

## LANGUAGE
Detect and respond in the caller's language.`;

export const EMERGENCY_SYSTEM_PROMPT = `## MANDATORY RULES
1. Act IMMEDIATELY — seconds matter in emergencies.
2. For life-threatening emergencies, advise calling 911 first.
3. For urgent non-life-threatening: connect to clinic staff (transferCall) or book emergency appointment.
4. NEVER ask for insurance or billing information during an emergency.
5. NEVER say "transferring" — use "Let me get you help right now."

## IDENTITY
You are the emergency coordinator at {{clinicName}}.

## CURRENT DATE & TIME
Right now it is: {{now}}

## CALLER PHONE NUMBER
The caller is calling from: {{call.customer.number}}

## SILENT HANDOFF
You were handed off silently. DO NOT greet. Immediately assess the emergency.

## TOOLS
- **lookupPatient** — Find caller's record (use {{call.customer.number}})
- **createPatient** — Create record if not found
- **checkAvailability** — Find emergency slots (auto-finds nearest if today is full)
- **bookAppointment** — Book the emergency appointment

## LIFE-THREATENING — Advise 911
Chest pain, difficulty breathing/swallowing, severe uncontrolled bleeding, stroke symptoms, loss of consciousness, severe allergic reaction, spreading infection with high fever, severe facial trauma, suicidal intent.
SAY: "This sounds like a life-threatening emergency. Please hang up and call 911 immediately."

## URGENT (Non-Life-Threatening) — Book Today
Severe toothache, knocked-out/broken tooth, lost filling with pain, abscess, post-procedure complications.
If transferCall available: connect to clinic staff.
Otherwise: book emergency appointment.

## BOOKING FLOW
1. Call **checkAvailability** with today's date and type "emergency"
2. Present options. If today full, system returns nearest slots — present those.
3. Call **lookupPatient** → if not found, get name and call **createPatient**
4. Call **bookAppointment** with symptoms in notes

## FIRST AID (while arranging care)
- Knocked-out tooth: "Keep it moist in milk. Don't touch the root."
- Bleeding: "Apply gentle pressure with clean gauze."
- Swelling: "Cold compress outside the cheek, 20 min on, 20 off."

## ERROR HANDLING
- If tools fail: "Come in as soon as you can — we'll fit you in."
- NEVER leave an emergency caller without a clear next step

## LANGUAGE
Detect and respond in the caller's language.`;

// ---------------------------------------------------------------------------
// Shared structured output schema for Vapi end-of-call analysis
// ---------------------------------------------------------------------------

export const CALL_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    patientName: { type: 'string', description: "Patient's full name as stated during the call" },
    patientPhone: { type: 'string', description: "Patient's phone number (from call metadata or stated)" },
    patientEmail: { type: 'string', description: "Patient's email address if provided" },
    patientId: { type: 'string', description: 'PMS patient ID if found during lookup' },
    isNewPatient: { type: 'boolean', description: 'Whether a new patient record was created during this call' },
    callReason: {
      type: 'string',
      enum: [
        'appointment_booking', 'appointment_cancel', 'appointment_reschedule',
        'appointment_inquiry', 'insurance_inquiry', 'billing_inquiry',
        'emergency', 'general_information', 'new_patient_inquiry',
        'follow_up', 'complaint', 'other',
      ],
      description: 'Primary reason for the call',
    },
    callOutcome: {
      type: 'string',
      enum: [
        'appointment_booked', 'appointment_cancelled', 'appointment_rescheduled',
        'information_provided', 'transferred_to_staff', 'emergency_handled',
        'insurance_verified', 'payment_plan_discussed', 'voicemail', 'unresolved', 'other',
      ],
      description: 'Primary outcome of the call',
    },
    appointmentBooked: { type: 'boolean', description: 'Whether an appointment was successfully booked' },
    appointmentCancelled: { type: 'boolean', description: 'Whether an appointment was cancelled' },
    appointmentRescheduled: { type: 'boolean', description: 'Whether an appointment was rescheduled' },
    appointmentType: { type: 'string', description: 'Type of appointment' },
    appointmentDate: { type: 'string', description: 'Appointment date in YYYY-MM-DD format' },
    appointmentTime: { type: 'string', description: 'Appointment time in HH:MM format' },
    providerName: { type: 'string', description: 'Name of the provider/dentist' },
    insuranceVerified: { type: 'boolean', description: 'Whether insurance was verified' },
    insuranceProvider: { type: 'string', description: 'Insurance company name' },
    paymentDiscussed: { type: 'boolean', description: 'Whether payment was discussed' },
    customerSentiment: {
      type: 'string',
      enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative', 'anxious', 'urgent'],
      description: 'Overall caller sentiment',
    },
    urgencyLevel: {
      type: 'string',
      enum: ['routine', 'soon', 'urgent', 'emergency'],
      description: 'Urgency level',
    },
    followUpRequired: { type: 'boolean', description: 'Whether follow-up is needed' },
    followUpNotes: { type: 'string', description: 'What follow-up is needed' },
    transferredToStaff: { type: 'boolean', description: 'Whether call was transferred to human' },
    callSummary: { type: 'string', description: 'Concise 2-3 sentence summary' },
    actionsPerformed: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of actions performed during the call',
    },
  },
  required: ['callReason', 'callOutcome', 'callSummary', 'customerSentiment'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffDestination {
  assistantName: string;
  description: string;
  contextEngineeringPlan?: {
    type: 'all' | 'lastNMessages' | 'none';
    numberOfMessages?: number;
  };
  variableExtractionPlan?: {
    schema: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  };
}

export interface SquadMemberTemplate {
  assistant: {
    name: string;
    systemPrompt: string;
    firstMessage: string;
    firstMessageMode: string;
    voice: {
      provider: string;
      voiceId: string;
    };
    model: {
      provider: string;
      model: string;
      temperature: number;
      maxTokens: number;
    };
    recordingEnabled: boolean;
    startSpeakingPlan: {
      waitSeconds: number;
      smartEndpointingPlan: { provider: string };
    };
    stopSpeakingPlan: {
      numWords: number;
      voiceSeconds: number;
      backoffSeconds: number;
    };
    silenceTimeoutSeconds?: number;
    analysisSchema?: Record<string, unknown>;
    toolGroup: string;
    extraTools?: unknown[];
  };
  /** Explicit handoff destinations — converted to type:"handoff" tools at build time */
  handoffDestinations: HandoffDestination[];
  /** @deprecated Use handoffDestinations instead. Kept for backward compat with v3.x templates. */
  assistantDestinations?: Array<{
    type: 'assistant';
    assistantName: string;
    description: string;
  }>;
}

export interface DentalClinicTemplateConfig {
  name: string;
  displayName: string;
  version: string;
  category: string;
  members: SquadMemberTemplate[];
}

// ---------------------------------------------------------------------------
// Shared voice + model config
// ---------------------------------------------------------------------------

const SHARED_VOICE = {
  provider: 'cartesia',
  voiceId: 'f786b574-daa5-4673-aa0c-cbe3e8534c02', // Katie
};

const SHARED_MODEL = {
  provider: 'openai',
  model: 'gpt-5-mini',
  temperature: 0.3,
  maxTokens: 500,
};

const SHARED_SPEAKING_PLAN = {
  startSpeakingPlan: {
    waitSeconds: 0.4,
    smartEndpointingPlan: { provider: 'livekit' },
  },
  stopSpeakingPlan: {
    numWords: 0,
    voiceSeconds: 0.2,
    backoffSeconds: 1,
  },
};

const EMERGENCY_SPEAKING_PLAN = {
  startSpeakingPlan: {
    waitSeconds: 0.1,
    smartEndpointingPlan: { provider: 'livekit' },
  },
  stopSpeakingPlan: {
    numWords: 0,
    voiceSeconds: 0.1,
    backoffSeconds: 0.5,
  },
};

// Shared variable extraction for handoffs that pass patient context
const PATIENT_CONTEXT_EXTRACTION = {
  schema: {
    type: 'object' as const,
    properties: {
      patientName: { type: 'string', description: "Caller's name if mentioned" },
      reason: { type: 'string', description: 'What the caller needs help with' },
    },
  },
};

// ---------------------------------------------------------------------------
// Template factory
// ---------------------------------------------------------------------------

/**
 * Returns the built-in dental clinic squad template (v4.0).
 * All clinic-specific values use {{placeholder}} syntax.
 * Tools are referenced by group key and injected at hydration time.
 */
export function getDentalClinicTemplate(): DentalClinicTemplateConfig {
  return {
    name: DENTAL_CLINIC_TEMPLATE_NAME,
    displayName: DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME,
    version: DENTAL_CLINIC_TEMPLATE_VERSION,
    category: 'dental-clinic',
    members: [
      // ================================================================
      // 1. RECEPTIONIST (Entry Point — merged Triage + Clinic Info)
      // ================================================================
      {
        assistant: {
          name: 'Receptionist',
          systemPrompt: RECEPTIONIST_SYSTEM_PROMPT,
          firstMessage: 'Thank you for calling {{clinicName}}! How can I help you today?',
          firstMessageMode: 'assistant-speaks-first',
          voice: { ...SHARED_VOICE },
          model: { ...SHARED_MODEL, temperature: 0.4 },
          recordingEnabled: true,
          ...SHARED_SPEAKING_PLAN,
          silenceTimeoutSeconds: 120,
          toolGroup: 'receptionist',
        },
        handoffDestinations: [
          {
            assistantName: 'Emergency',
            description: 'Caller describes pain, bleeding, trauma, swelling, breathing difficulty, or any urgent/emergency symptoms',
            contextEngineeringPlan: { type: 'all' },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Booking Agent',
            description: 'Caller wants to book a new appointment, schedule a visit, or find available times',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 6 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Appointment Management',
            description: 'Caller wants to cancel, reschedule, check on, or change an existing appointment',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 6 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Patient Records',
            description: 'Caller wants to update personal info (address, phone, email, medical history) or needs a new patient record',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 6 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Insurance & Billing',
            description: 'Caller has questions about insurance coverage, billing, balance, payments, or payment plans',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 6 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
        ],
      },

      // ================================================================
      // 2. BOOKING AGENT (New appointment booking only)
      // ================================================================
      {
        assistant: {
          name: 'Booking Agent',
          systemPrompt: BOOKING_AGENT_SYSTEM_PROMPT,
          firstMessage: '',
          firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
          voice: { ...SHARED_VOICE },
          model: { ...SHARED_MODEL },
          recordingEnabled: true,
          ...SHARED_SPEAKING_PLAN,
          silenceTimeoutSeconds: 120,
          toolGroup: 'booking',
        },
        handoffDestinations: [
          {
            assistantName: 'Emergency',
            description: 'Caller describes urgent symptoms or emergency during booking',
            contextEngineeringPlan: { type: 'all' },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Appointment Management',
            description: 'Caller wants to cancel or reschedule an existing appointment, not book new',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Receptionist',
            description: 'Caller needs general help, clinic info, or you cannot resolve their issue',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
          },
        ],
      },

      // ================================================================
      // 3. APPOINTMENT MANAGEMENT (Cancel / Reschedule / Lookup)
      // ================================================================
      {
        assistant: {
          name: 'Appointment Management',
          systemPrompt: APPOINTMENT_MGMT_SYSTEM_PROMPT,
          firstMessage: '',
          firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
          voice: { ...SHARED_VOICE },
          model: { ...SHARED_MODEL },
          recordingEnabled: true,
          ...SHARED_SPEAKING_PLAN,
          silenceTimeoutSeconds: 120,
          toolGroup: 'appointmentMgmt',
        },
        handoffDestinations: [
          {
            assistantName: 'Emergency',
            description: 'Caller describes urgent symptoms or emergency',
            contextEngineeringPlan: { type: 'all' },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Booking Agent',
            description: 'Caller wants to book a brand new appointment, not reschedule',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Receptionist',
            description: 'Caller needs general help or you cannot resolve their issue',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
          },
        ],
      },

      // ================================================================
      // 4. PATIENT RECORDS (HIPAA Security Boundary)
      // ================================================================
      {
        assistant: {
          name: 'Patient Records',
          systemPrompt: PATIENT_RECORDS_SYSTEM_PROMPT,
          firstMessage: '',
          firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
          voice: { ...SHARED_VOICE },
          model: { ...SHARED_MODEL },
          recordingEnabled: true,
          ...SHARED_SPEAKING_PLAN,
          silenceTimeoutSeconds: 120,
          toolGroup: 'patientRecords',
        },
        handoffDestinations: [
          {
            assistantName: 'Emergency',
            description: 'Caller describes urgent symptoms',
            contextEngineeringPlan: { type: 'all' },
          },
          {
            assistantName: 'Booking Agent',
            description: 'Caller wants to book an appointment',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Insurance & Billing',
            description: 'Caller wants to update insurance or check billing',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Receptionist',
            description: 'Caller needs general help',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
          },
        ],
      },

      // ================================================================
      // 5. INSURANCE & BILLING (Merged Insurance + Payment)
      // ================================================================
      {
        assistant: {
          name: 'Insurance & Billing',
          systemPrompt: INSURANCE_BILLING_SYSTEM_PROMPT,
          firstMessage: '',
          firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
          voice: { ...SHARED_VOICE },
          model: { ...SHARED_MODEL },
          recordingEnabled: true,
          ...SHARED_SPEAKING_PLAN,
          silenceTimeoutSeconds: 120,
          toolGroup: 'insuranceBilling',
        },
        handoffDestinations: [
          {
            assistantName: 'Emergency',
            description: 'Caller describes urgent symptoms',
            contextEngineeringPlan: { type: 'all' },
          },
          {
            assistantName: 'Booking Agent',
            description: 'Caller wants to book an appointment after insurance questions',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Patient Records',
            description: 'Caller wants to update non-insurance personal info',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
          {
            assistantName: 'Receptionist',
            description: 'Caller needs general help',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
          },
        ],
      },

      // ================================================================
      // 6. EMERGENCY (Unchanged — Critical Path)
      // ================================================================
      {
        assistant: {
          name: 'Emergency',
          systemPrompt: EMERGENCY_SYSTEM_PROMPT,
          firstMessage: '',
          firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
          voice: { ...SHARED_VOICE },
          model: { ...SHARED_MODEL },
          recordingEnabled: true,
          ...EMERGENCY_SPEAKING_PLAN,
          silenceTimeoutSeconds: 120,
          toolGroup: 'emergency',
        },
        handoffDestinations: [
          {
            assistantName: 'Booking Agent',
            description: 'After emergency is assessed, patient needs a follow-up appointment',
            contextEngineeringPlan: { type: 'lastNMessages', numberOfMessages: 10 },
            variableExtractionPlan: PATIENT_CONTEXT_EXTRACTION,
          },
        ],
      },
    ],
  };
}
