/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │              EVAL CONFIGURATION — EDIT HERE                │
 * │                                                             │
 * │  Change the provider, model, temperature, and prompt        │
 * │  overrides below to experiment. Re-run the tests after      │
 * │  each change to see how the results differ.                 │
 * └─────────────────────────────────────────────────────────────┘
 */

// =====================================================================
// 1. API CREDENTIALS
// =====================================================================

export const VAPI_API_KEY = process.env.VAPI_API_KEY ?? '';
export const VAPI_SQUAD_ID = process.env.VAPI_SQUAD_ID ?? '';
export const VAPI_BASE_URL = 'https://api.vapi.ai';

if (!VAPI_API_KEY) {
  throw new Error('VAPI_API_KEY environment variable is required. Set it before running evals.');
}
if (!VAPI_SQUAD_ID) {
  throw new Error('VAPI_SQUAD_ID environment variable is required. Set it before running evals.');
}

// =====================================================================
// 2. AI MODEL SELECTION — Pick one by uncommenting
//
//    Change this to compare models. After changing, re-run your tests.
//    The selected model will be applied to ALL squad members before
//    running evals (via PATCH to the squad).
// =====================================================================

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'custom-llm';

interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  label: string;
}

// ── Uncomment ONE of these blocks ──────────────────────────────────

// --- OpenAI Models ---
// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'openai',
//   model: 'gpt-5-mini',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'gpt-5-mini',
// };

export const ACTIVE_MODEL: ModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 500,
  label: 'gpt-4o',
};

// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'openai',
//   model: 'gpt-5.2-chat-latest',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'gpt-5.2-chat-latest',
// };

// --- Anthropic Models ---
// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'anthropic',
//   model: 'claude-sonnet-4-20250514',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'claude-sonnet-4',
// };

// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'anthropic',
//   model: 'claude-3-5-sonnet-20241022',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'claude-3.5-sonnet',
// };

// --- Google Models ---
// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'google',
//   model: 'gemini-2.0-flash',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'gemini-2.0-flash',
// };

// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'google',
//   model: 'gemini-1.5-pro',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'gemini-1.5-pro',
// };

// --- Xai Grok Models (fast + cheap) ---
// export const ACTIVE_MODEL: ModelConfig = {
//   provider: 'xai',
//   model: 'grok-4-fast-non-reasoning',
//   temperature: 0.3,
//   maxTokens: 500,
//   label: 'grok-4-fast-non-reasoning',
// };

// =====================================================================
// 3. TEMPERATURE OVERRIDE — Fine-tune creativity vs determinism
//
//    Lower (0.1-0.3): More deterministic, follows instructions closely
//    Medium (0.4-0.6): Balanced
//    Higher (0.7-1.0): More creative, varied responses
//
//    Set to null to use ACTIVE_MODEL's temperature
// =====================================================================

export const TEMPERATURE_OVERRIDE: number | null = null;

// =====================================================================
// 4. PROMPT OVERRIDES — Experiment with different prompts
//
//    Set any of these to override the prompt for that specific assistant.
//    Set to null to use the squad's existing prompt (no override).
//
//    TIP: Copy the current prompt from dental-clinic.template.ts,
//    paste it here, and make your changes. Run tests to see if it improves.
// =====================================================================

export const PROMPT_OVERRIDES: Record<string, string | null> = {
  // v4.0 assistant names
  'Receptionist': null,            // Merged Triage + Clinic Info
  'Booking Agent': null,           // New appointment booking
  'Appointment Management': null,  // Cancel/reschedule/lookup
  'Patient Records': null,         // HIPAA boundary — unchanged
  'Insurance & Billing': null,     // Merged Insurance + Payment
  'Emergency': null,               // Critical path — unchanged
};

// ─── PROMPT OVERRIDE EXAMPLES ─────────────────────────────────
//
// EXAMPLE 1: Make Receptionist routing more aggressive (fewer clarifying questions)
// Copy the full prompt from dental-clinic.template.ts → RECEPTIONIST_SYSTEM_PROMPT,
// then change the parts you want to test:
//
PROMPT_OVERRIDES['Receptionist'] = `You are Katie, the receptionist at Pearl Dental. You answer calls, figure out what the caller needs, and route them to the right specialist.

Be warm, natural, and concise. Sound like a real person, not a bot.

## GREETING
"Thank you for calling Pearl Dental! How can I help you today?"

## YOUR ONLY JOB: LISTEN AND ROUTE

When you determine the caller’s intent:
- Immediately call the correct handoff tool.
- Do NOT say any transition phrase.
- Do NOT explain that you are transferring.
- Do NOT repeat what the caller said.
- Do NOT add filler like “let me check” or “one moment.”

The next assistant will continue the conversation.

| Caller wants... | Action |
|---|---|
| Book/cancel/reschedule appointment | Immediately hand off to Scheduling |
| Emergency, severe pain, bleeding | Immediately hand off to Emergency Transfer |
| Update personal info, records | Immediately hand off to Patient Records |
| Insurance questions | Immediately hand off to Insurance |
| Bill, payment, balance | Immediately hand off to Payment & Billing |
| Hours, location, services | Answer directly if simple. Otherwise hand off to Clinic Information. |
If the caller asks a simple question you know (like hours or location), answer it directly. Only route for complex questions.

## HANDOFF RULES

- When routing, do NOT say anything before handing off.
- Do NOT use phrases like:
  - “Let me check…”
  - “One moment…”
  - “I’ll connect you…”
  - “Let me transfer you…”
- The handoff must be silent.
- The next assistant will speak first.

If unsure, ask ONE question: "Are you looking to book an appointment, or something else?"

## LANGUAGE
Respond in whatever language the caller speaks.`;

// ────────────────────────────────────────────────────────────────
//
// EXAMPLE 2: Make Booking Agent more strict about collecting email
//
PROMPT_OVERRIDES['Booking Agent'] = `You are Katie, the Scheduling Coordinator at Pearl Dental.

The caller has already spoken to reception and needs appointment help.
DO NOT greet. DO NOT introduce yourself. Start helping immediately.

Be warm, natural, concise, and human.

---

## CONTEXT

Current date/time: {{now}}  
Caller phone: {{call.customer.number}}  
Use today's real date. Never use outdated years.

Never ask for their phone number.

---

## CORE RULE: YOU CONTROL THE FLOW

You must always move the conversation forward.

Every turn must either:
1. Ask a clear next-step question, OR
2. Call the next required tool.

Never end a turn with a statement only.
Silence is never acceptable.

---

## TOOL USAGE

Available tools:
- checkAvailability
- lookupPatient
- createPatient
- bookAppointment
- cancelAppointment
- rescheduleAppointment
- getAppointments
- addNote

Tool execution is invisible to the caller.

Never narrate tool mechanics.
Never say “I created…” or “I booked…”

Only speak in outcome-focused language.

Bad:
"I created your patient profile."

Good:
"Perfect. Let's get you scheduled."

---

# INTENT HANDLING (FIRST ACTION)

The caller already stated their goal.

If booking → call checkAvailability immediately.  
If canceling → call lookupPatient immediately.  
If rescheduling → call lookupPatient immediately.

Do NOT ask what they need.

---

# BOOKING FLOW (STRICT ORDER)

## Step 1 — Availability
Call checkAvailability with preferred date (or today if none given).

Present up to 3 slots naturally:
"I have 10 AM, 1 PM, or 3:30 PM. Which works?"

Always use:
- 12-hour time format
- Natural date phrasing ("Thursday the 20th")

If the requested date is full:
Present the returned alternatives.
Do NOT re-call checkAvailability.

---

## Step 2 — Identify Patient
After time selection:
Call lookupPatient using {{call.customer.number}}.

### If Existing Patient:
- Confirm their name.
- Proceed to booking.

### If NOT Found → NEW PATIENT (NO SHORTCUTS)

You MUST collect ALL of the following BEFORE calling createPatient:

1. First + last name
2. Ask them to spell both names letter by letter
3. Email address
4. Ask them to spell the email letter by letter
5. Confirm phone number

You may NOT call createPatient until all 5 are collected and confirmed.

Do NOT assume.
Do NOT skip spelling.
Do NOT call tools with partial data.

Spell emails with pauses:
"J O H N … S M I T H … at G M A I L dot com"

After createPatient → immediately proceed to booking.

---

## Step 3 — Book Appointment

Call bookAppointment.

After success:

"You're all set for [type] on [date] at [time]. Anything else I can help you with today?"

You MUST always offer additional help after completing an action.

Never stop after confirmation.

---

# CANCEL FLOW

1. lookupPatient
2. getAppointments
3. Confirm which appointment
4. cancelAppointment
5. Confirm cancellation + ask if anything else needed

---

# RESCHEDULE FLOW

1. lookupPatient
2. getAppointments
3. Confirm which appointment
4. checkAvailability
5. rescheduleAppointment
6. Confirm new time + ask if anything else needed

---

# ERROR HANDLING

If a tool fails once:
"Hmm, let me try that again."

If repeated failure:
"I'm having some trouble accessing the system. Would you like me to connect you with our team?"

---

# NEVER DO

- Do NOT greet
- Do NOT introduce yourself
- Do NOT narrate tools
- Do NOT end a turn without a question or next action
- Do NOT route back to reception unless it is completely unrelated to appointments

---

# LANGUAGE

Match the caller’s language.`;
// PROMPT_OVERRIDES['Booking Agent'] = `## IDENTITY
// You are the scheduling coordinator for {{clinicName}}.
//
// ... (copy the full SCHEDULING_SYSTEM_PROMPT from dental-clinic.template.ts)
// ... then change the part you want to test, for example:
//
// ## CRITICAL RULE: EMAIL IS MANDATORY
// You MUST collect the patient's email address BEFORE calling createPatient.
// If the caller has not provided an email, you MUST ask for it.
// Do NOT proceed to booking until you have: name (spelled), email (spelled), phone.
// This is non-negotiable.
// `;
//
// ────────────────────────────────────────────────────────────────
//
// EXAMPLE 3: Test with much lower temperature for more deterministic routing
//
// Just change TEMPERATURE_OVERRIDE above to 0.1 instead of null.

// =====================================================================
// 5. POLLING SETTINGS — How long to wait for eval results
// =====================================================================

export const POLL_INTERVAL_MS = 3_000;
export const MAX_POLL_ATTEMPTS = 60;

// =====================================================================
// 6. HELPER — Get effective temperature
// =====================================================================

export function getEffectiveTemperature(): number {
  return TEMPERATURE_OVERRIDE ?? ACTIVE_MODEL.temperature;
}

export function getRunLabel(): string {
  const temp = getEffectiveTemperature();
  return `${ACTIVE_MODEL.label}-t${temp}`;
}

// =====================================================================
// 7. AI JUDGE MODEL — Which model judges the eval results
//
//    GPT-4o is recommended for accurate judging.
//    Use a cheaper model only if you need to reduce costs.
// =====================================================================

export const JUDGE_MODEL = 'gpt-4o';
export const JUDGE_PROVIDER = 'openai';
