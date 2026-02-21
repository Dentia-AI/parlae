/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │       TOOL CALL VALIDATION TESTS                           │
 * │                                                             │
 * │  Covers ALL 19 PMS tools with:                             │
 * │  1. Exact parameter validation (name, type, format)        │
 * │  2. Response evaluation (did the assistant correctly        │
 * │     interpret and use the API response?)                    │
 * │                                                             │
 * │  Run all:   npx tsx run-isolated.ts tool-calls             │
 * │  Run group: npx tsx run-isolated.ts tool-calls:scheduling  │
 * │             npx tsx run-isolated.ts tool-calls:insurance    │
 * │             npx tsx run-isolated.ts tool-calls:payment      │
 * │             npx tsx run-isolated.ts tool-calls:records      │
 * │             npx tsx run-isolated.ts tool-calls:response     │
 * └─────────────────────────────────────────────────────────────┘
 */

import { JUDGE_MODEL, JUDGE_PROVIDER } from '../eval-config';
import type { EvalDefinition, EvalJudgePlan, EvalContinuePlan } from '../dental-clinic-eval-suite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aiJudge(criteria: string): EvalJudgePlan {
  return {
    type: 'ai',
    model: {
      provider: JUDGE_PROVIDER,
      model: JUDGE_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an LLM-Judge evaluating a dental clinic AI assistant's tool calls and responses.

Evaluate the assistant's response: {{messages[-1]}}
Full conversation: {{messages}}

${criteria}

Output format: respond with exactly one word: pass or fail`,
        },
      ],
    },
  };
}

function hardToolCheck(toolName: string): EvalJudgePlan {
  return { type: 'regex', toolCalls: [{ name: toolName }] };
}

function exitOnFail(): EvalContinuePlan {
  return { exitOnFailureEnabled: true };
}

function mockTool(name: string, args: Record<string, unknown>): EvalContinuePlan {
  return {
    exitOnFailureEnabled: false,
    toolCallsOverride: [{ name, arguments: args }],
  };
}

// ============================================================================
// SECTION 1: SCHEDULING TOOL PARAMS
// searchPatients, createPatient, checkAvailability, bookAppointment,
// rescheduleAppointment, cancelAppointment, getAppointments, addPatientNote
// ============================================================================

const schedulingToolParams: EvalDefinition[] = [
  // --- searchPatients ---
  {
    name: 'Tool:searchPatients [1]: uses phone number as query',
    description: 'searchPatients should use the caller phone number by default.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'searchPatients', 'params', 'scheduling', 'isolated'],
    messages: [
      { role: 'user', content: "I want to cancel my appointment" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "searchPatients" tool
- The "query" parameter is present and non-empty
- query is a phone number string (digits, possibly with + prefix)
  OR the assistant asks for patient info to search with

FAIL if:
- searchPatients not called AND no info-gathering question asked
- Calls getAppointments or bookAppointment before identifying the patient
- query parameter is missing or empty`),
      },
    ],
  },
  {
    name: 'Tool:searchPatients [2]: uses name when provided',
    description: 'When caller gives name, searchPatients query should use it.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'searchPatients', 'params', 'scheduling', 'isolated'],
    messages: [
      { role: 'user', content: "I need to reschedule. My name is Sarah Johnson" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "searchPatients" tool
- The "query" parameter contains "Sarah Johnson" or "Johnson" or "Sarah"

FAIL if:
- searchPatients not called
- query does not reference the caller's name`),
      },
    ],
  },

  // --- checkAvailability ---
  {
    name: 'Tool:checkAvailability [1]: date in YYYY-MM-DD + appointmentType present',
    description: 'checkAvailability must have correctly formatted date and appointment type.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'checkAvailability', 'params', 'scheduling', 'isolated'],
    messages: [
      { role: 'user', content: "I'd like to book a teeth whitening for next Thursday" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if the assistant calls "checkAvailability" with:
- "date": a string in YYYY-MM-DD format (must be a Thursday in Feb/Mar 2026)
- "appointmentType": present and relates to whitening (e.g., "whitening", "cosmetic")
- Year MUST be 2026 (not 2024 or 2025)

FAIL if:
- date is missing or wrong format
- date year is not 2026
- appointmentType missing
- checkAvailability not called`),
      },
    ],
  },
  {
    name: 'Tool:checkAvailability [2]: "today" resolves to current date',
    description: 'When caller says "today", date param must be the actual current date.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'checkAvailability', 'params', 'scheduling', 'isolated'],
    messages: [
      { role: 'user', content: "Do you have anything available today for a cleaning?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "checkAvailability"
- "date" param is today's date (2026-02-18 or 2026-02-19, accounting for timezone)
- Year is 2026
- "appointmentType" is "cleaning" or similar

FAIL if:
- Date is not today (especially if it's a past date or wrong year)
- checkAvailability not called`),
      },
    ],
  },
  {
    name: 'Tool:checkAvailability [3]: duration set correctly for long procedures',
    description: 'Root canal or extraction should use 60-90 min duration, not 30.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'checkAvailability', 'params', 'scheduling', 'isolated'],
    messages: [
      { role: 'user', content: "I need to schedule a root canal" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "checkAvailability"
- "appointmentType" is "root-canal" or "root canal" or similar
- If "duration" is provided, it is 60 or 90 (NOT 30)

FAIL if:
- duration is 30 (too short for root canal)
- appointmentType doesn't match root canal`),
      },
    ],
  },

  // --- createPatient ---
  {
    name: 'Tool:createPatient [1]: all 4 required params with correct values',
    description: 'createPatient needs firstName, lastName, email, phone — all correctly valued.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'createPatient', 'params', 'scheduling', 'isolated', 'critical'],
    messages: [
      {
        role: 'system',
        content: 'Context: New patient. searchPatients returned 0 results. Name: Priya Chakraborty (spelled P-R-I-Y-A C-H-A-K-R-A-B-O-R-T-Y). Phone: +14165551234. Email: priya@chakraborty.com (spelled and confirmed). Time slot chosen: cleaning 2026-02-23 10:00.',
      },
      { role: 'user', content: "Yes that's correct, go ahead" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "createPatient" is called with ALL of these:
- "firstName": "Priya" (correctly spelled)
- "lastName": "Chakraborty" (correctly spelled)
- "email": "priya@chakraborty.com" (NOT "priya at chakraborty dot com")
- "phone": "+14165551234" or "4165551234" (a phone number string)

All 4 params MUST be present.

FAIL if:
- ANY of the 4 required params is missing
- email is in spoken format ("at", "dot") instead of email format
- firstName or lastName is misspelled
- createPatient not called`),
      },
    ],
  },
  {
    name: 'Tool:createPatient [2]: does NOT call without email',
    description: 'createPatient must NOT be called before email is collected.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'createPatient', 'params', 'scheduling', 'isolated', 'critical'],
    messages: [
      {
        role: 'system',
        content: 'Context: New patient. searchPatients returned 0 results. Name collected: Bob Lee (B-O-B L-E-E). Phone: +14165559876. Email: NOT YET COLLECTED.',
      },
      { role: 'user', content: "My name is Bob Lee, B-O-B L-E-E" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Does NOT call createPatient (email has not been collected yet)
- Asks for the caller's email address
- May also confirm or ask for phone

FAIL if:
- Calls createPatient without having an email
- Skips email collection entirely
- Proceeds to booking without patient record`),
      },
    ],
  },

  // --- bookAppointment ---
  {
    name: 'Tool:bookAppointment [1]: all 8 required params with exact values',
    description: 'bookAppointment needs patientId, appointmentType, startTime, duration, firstName, lastName, email, phone.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'bookAppointment', 'params', 'scheduling', 'isolated', 'critical'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Emily Chen" (pat-321, emily.chen@email.com, +14165554321). Booking: consultation on 2026-02-25 at 09:00 with Dr. Smith (dr-smith-1). Duration: 60 min. All details confirmed by caller.',
      },
      { role: 'user', content: "Yes, go ahead and book it" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "bookAppointment" is called with ALL of these:
- "patientId": "pat-321"
- "appointmentType": "consultation"
- "startTime": ISO 8601 string containing "2026-02-25" and "09:00" (e.g., "2026-02-25T09:00:00")
- "duration": 60 (number)
- "firstName": "Emily"
- "lastName": "Chen"
- "email": "emily.chen@email.com"
- "phone": "+14165554321"

All 8 params MUST be present with correct values.

FAIL if:
- ANY of the 8 required params is missing
- startTime is not ISO 8601 format
- duration is not 60
- patientId doesn't match "pat-321"
- email or phone doesn't match
- bookAppointment not called`),
      },
    ],
  },
  {
    name: 'Tool:bookAppointment [2]: startTime uses ISO 8601, never plain English',
    description: 'startTime must be ISO format, not "next Monday at 2 PM".',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'bookAppointment', 'params', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "John Smith" (pat-100, john@email.com, +14165551111). Booking: cleaning on Monday 2026-02-23 at 14:00. Duration: 30 min.',
      },
      { role: 'user', content: "Yep, book the Monday 2 PM" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "bookAppointment" is called with:
- "startTime": an ISO 8601 string like "2026-02-23T14:00:00" (NOT "Monday at 2 PM" or "next Monday")
- Contains "2026-02-23" and "14:00"

FAIL if:
- startTime is in plain English
- startTime doesn't include the correct date/time
- bookAppointment not called`),
      },
    ],
  },
  {
    name: 'Tool:bookAppointment [3]: includes notes when caller mentions concerns',
    description: 'If caller mentioned pain or concerns, notes param should capture it.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'bookAppointment', 'params', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Maria Garcia" (pat-456, maria@email.com, +14165552222). Booking: exam on 2026-02-24 at 10:00. Duration: 30 min. Earlier in the call, patient mentioned sensitivity in lower left molar and is nervous about dental procedures.',
      },
      { role: 'user', content: "Yes please book that for me" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "bookAppointment" is called AND:
- "notes" param is present
- "notes" mentions the sensitivity in lower left molar or dental anxiety/nervousness
- All 8 required params are also present

FAIL if:
- notes param is missing (caller mentioned specific concerns)
- notes don't reference the molar sensitivity or nervousness`),
      },
    ],
  },

  // --- rescheduleAppointment ---
  {
    name: 'Tool:rescheduleAppointment [1]: appointmentId + startTime both present',
    description: 'rescheduleAppointment needs the existing appointment ID and new ISO time.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'rescheduleAppointment', 'params', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Alex Kim" (pat-700). Current appointment: apt-888, cleaning on 2026-02-20 at 11:00. Caller wants to move to Friday 2026-02-27 at 15:00. New time confirmed available.',
      },
      { role: 'user', content: "Yes, move it to Friday at 3 PM" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "rescheduleAppointment" is called with:
- "appointmentId": "apt-888"
- "startTime": ISO 8601 containing "2026-02-27" and "15:00"
- Both params MUST be present

FAIL if:
- appointmentId missing or wrong
- startTime missing or not ISO format
- rescheduleAppointment not called`),
      },
    ],
  },

  // --- cancelAppointment ---
  {
    name: 'Tool:cancelAppointment [1]: appointmentId present + reason included',
    description: 'cancelAppointment should include appointmentId and reason.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'cancelAppointment', 'params', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Alex Kim" (pat-700). Appointment: apt-888, cleaning 2026-02-20. Caller wants to cancel because they are moving out of state.',
      },
      { role: 'user', content: "Yes, go ahead and cancel it. I'm moving out of state." },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "cancelAppointment" is called with:
- "appointmentId": "apt-888"
- "reason": a string mentioning moving or relocation

FAIL if:
- appointmentId missing or wrong
- cancelAppointment not called
- reason is missing (caller stated a clear reason)`),
      },
    ],
  },

  // --- getAppointments ---
  {
    name: 'Tool:getAppointments [1]: uses patientId from prior search',
    description: 'getAppointments must use the patientId returned by searchPatients.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'getAppointments', 'params', 'scheduling', 'isolated'],
    messages: [
      { role: 'user', content: "I want to reschedule my appointment" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('searchPatients'),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [{ name: 'searchPatients', arguments: { query: '+14165551234' } }],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patients: [{ patientId: 'pat-555', firstName: 'Lisa', lastName: 'Wong' }],
          total: 1,
        }),
      },
      { role: 'user', content: "Yes, that's me" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "getAppointments" is called with:
- "patientId": "pat-555" (matches the patient found by searchPatients)

FAIL if:
- getAppointments not called
- patientId is missing or doesn't match "pat-555"
- Uses a made-up patientId`),
      },
    ],
  },

  // --- addPatientNote ---
  {
    name: 'Tool:addPatientNote [1]: patientId + content + correct category',
    description: 'addPatientNote must capture the patient concern with appropriate category.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'addPatientNote', 'params', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Sarah Lee" (pat-200). Booking complete. Caller mentioned she has a severe latex allergy and needs non-latex gloves.',
      },
      { role: 'user', content: "Oh and please note that I have a severe latex allergy" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "addPatientNote" is called with:
- "patientId": "pat-200"
- "content": mentions latex allergy and non-latex gloves
- "category": "allergy" (this is an allergy, not a general note)

FAIL if:
- patientId missing or wrong
- content doesn't mention latex allergy
- category is "general" instead of "allergy"
- addPatientNote not called`),
      },
    ],
  },
  {
    name: 'Tool:addPatientNote [2]: call summary note after booking',
    description: 'After a complex call, notes should summarize key details.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'addPatientNote', 'params', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Just booked a filling for lower left molar (#19). Caller is very anxious about dental procedures and requested nitrous oxide sedation. Also asked about payment plans.',
      },
      { role: 'user', content: "Thanks, that's all" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "addPatientNote" with "patientId": "pat-300"
- "content" mentions: dental anxiety, nitrous oxide/sedation request, and the specific tooth (#19 or lower left molar)
- OR the assistant offers a helpful closing without notes (this is acceptable if the booking already captured the info)

FAIL if:
- Important patient concerns (anxiety, sedation need) are completely ignored/lost`),
      },
    ],
  },
];

// ============================================================================
// SECTION 2: INSURANCE TOOL PARAMS
// getPatientInsurance, addPatientInsurance, updatePatientInsurance,
// verifyInsuranceCoverage
// ============================================================================

const insuranceToolParams: EvalDefinition[] = [
  // --- getPatientInsurance ---
  {
    name: 'Tool:getPatientInsurance [1]: patientId from search result',
    description: 'After finding patient, getPatientInsurance uses the correct patientId.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'getPatientInsurance', 'params', 'insurance', 'isolated'],
    messages: [
      { role: 'user', content: "I want to check what insurance you have on file for me" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('searchPatients'),
        continuePlan: mockTool('searchPatients', { query: '+14165551234' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({ patients: [{ patientId: 'pat-401', firstName: 'David', lastName: 'Park' }], total: 1 }),
      },
      { role: 'user', content: "Yes that's me, David Park" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "getPatientInsurance" is called with:
- "patientId": "pat-401"

FAIL if:
- getPatientInsurance not called
- patientId missing or doesn't match "pat-401"`),
      },
    ],
  },

  // --- addPatientInsurance ---
  {
    name: 'Tool:addPatientInsurance [1]: all 3 required params + optional fields',
    description: 'addPatientInsurance needs patientId, insuranceProvider, memberId.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'addPatientInsurance', 'params', 'insurance', 'isolated', 'critical'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "David Park" (pat-401). Currently has no insurance on file. Caller wants to add: Blue Cross Blue Shield, member ID: BCB-998877, group number: GRP-5544.',
      },
      { role: 'user', content: "My member ID is BCB-998877 and the group number is GRP-5544" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "addPatientInsurance" is called with:
- "patientId": "pat-401"
- "insuranceProvider": contains "Blue Cross" (case insensitive)
- "memberId": "BCB-998877"
- "groupNumber": "GRP-5544" (optional but caller provided it)

All 3 required params must be present.

FAIL if:
- patientId, insuranceProvider, or memberId is missing
- memberId doesn't match "BCB-998877"
- addPatientInsurance not called`),
      },
    ],
  },
  {
    name: 'Tool:addPatientInsurance [2]: subscriberRelationship when not self',
    description: 'When insurance is through spouse, relationship must be set.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'addPatientInsurance', 'params', 'insurance', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Lisa Wong" (pat-555). Adding insurance: Aetna, member ID AET-112233. The insurance is through her husband Mark Wong (he is the primary subscriber).',
      },
      { role: 'user', content: "The subscriber is my husband Mark Wong" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "addPatientInsurance" is called with:
- "patientId": "pat-555"
- "insuranceProvider": "Aetna" or contains "Aetna"
- "memberId": "AET-112233"
- "subscriberName": contains "Mark Wong"
- "subscriberRelationship": "spouse"

FAIL if:
- subscriberRelationship is "self" (it's through the spouse)
- subscriberName is missing
- Required params missing`),
      },
    ],
  },

  // --- updatePatientInsurance ---
  {
    name: 'Tool:updatePatientInsurance [1]: patientId + insuranceId both present',
    description: 'updatePatientInsurance needs both patient and insurance record IDs.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'updatePatientInsurance', 'params', 'insurance', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "David Park" (pat-401). Existing insurance on file: ins-901 (Blue Cross). Caller got a new member ID and wants to update it to BCB-112233.',
      },
      { role: 'user', content: "My new member ID is BCB-112233" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "updatePatientInsurance" is called with:
- "patientId": "pat-401"
- "insuranceId": "ins-901"
- "memberId": "BCB-112233"

FAIL if:
- patientId or insuranceId missing
- memberId doesn't match the new value
- Calls addPatientInsurance instead of update`),
      },
    ],
  },

  // --- verifyInsuranceCoverage ---
  {
    name: 'Tool:verifyInsuranceCoverage [1]: patientId + serviceType for cleaning',
    description: 'When checking if cleaning is covered, serviceType should be "preventive".',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'verifyInsuranceCoverage', 'params', 'insurance', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "David Park" (pat-401). Has Blue Cross on file. Wants to know if their cleaning is covered.',
      },
      { role: 'user', content: "Is my cleaning appointment covered by my insurance?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "verifyInsuranceCoverage" is called with:
- "patientId": "pat-401"
- "serviceType": "preventive" (cleanings are preventive care)

FAIL if:
- patientId missing
- serviceType is "major" or "basic" (cleanings are preventive)
- verifyInsuranceCoverage not called`),
      },
    ],
  },
  {
    name: 'Tool:verifyInsuranceCoverage [2]: root canal = "major" service type',
    description: 'Root canal coverage check should use serviceType "major".',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'verifyInsuranceCoverage', 'params', 'insurance', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Maria Garcia" (pat-456). Needs root canal. Wants to know coverage.',
      },
      { role: 'user', content: "Will my insurance cover the root canal?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "verifyInsuranceCoverage" is called with:
- "patientId": "pat-456"
- "serviceType": "major" (root canal is a major procedure)

FAIL if:
- serviceType is "preventive" or "basic" (root canal is major)
- verifyInsuranceCoverage not called`),
      },
    ],
  },
];

// ============================================================================
// SECTION 3: PAYMENT TOOL PARAMS
// getPatientBalance, getPaymentHistory, processPayment, createPaymentPlan
// ============================================================================

const paymentToolParams: EvalDefinition[] = [
  // --- getPatientBalance ---
  {
    name: 'Tool:getPatientBalance [1]: uses correct patientId',
    description: 'getPatientBalance must use the patient ID from search.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'getPatientBalance', 'params', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Caller asking about outstanding balance.',
      },
      { role: 'user', content: "How much do I owe?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "getPatientBalance" is called with:
- "patientId": "pat-300"

FAIL if:
- patientId missing or wrong
- getPatientBalance not called`),
      },
    ],
  },

  // --- getPaymentHistory ---
  {
    name: 'Tool:getPaymentHistory [1]: patientId present, date range sensible',
    description: 'getPaymentHistory needs patientId; date filters should make sense.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'getPaymentHistory', 'params', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Wants to see payments from last 6 months.',
      },
      { role: 'user', content: "Can you show me my payments from the last 6 months?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "getPaymentHistory" is called with:
- "patientId": "pat-300"
- "startDate": approximately 6 months ago in YYYY-MM-DD (around 2025-08)
- OR no startDate but the request is still made with correct patientId

FAIL if:
- patientId missing
- getPaymentHistory not called`),
      },
    ],
  },

  // --- processPayment ---
  {
    name: 'Tool:processPayment [1]: all 3 required params + description',
    description: 'processPayment needs patientId, amount (number), paymentMethod.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'processPayment', 'params', 'payment', 'isolated', 'critical'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Balance: $275.00. Caller wants to pay with card on file. Amount confirmed: $275.00.',
      },
      { role: 'user', content: "Yes, charge the $275 to my card on file" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "processPayment" is called with:
- "patientId": "pat-300"
- "amount": 275 or 275.00 (a number, NOT a string like "$275")
- "paymentMethod": "card_on_file"
- "description": present (should mention balance or what it's for)

FAIL if:
- patientId missing
- amount is not 275 (or is a string)
- paymentMethod is not "card_on_file"
- processPayment not called`),
      },
    ],
  },
  {
    name: 'Tool:processPayment [2]: payment_link when no card on file',
    description: 'When caller has no card on file, should use payment_link method.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'processPayment', 'params', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Lisa Wong" (pat-555). Balance: $150.00. No card on file. Caller wants a link to pay.',
      },
      { role: 'user', content: "Can you send me a link to pay?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "processPayment" is called with:
- "patientId": "pat-555"
- "amount": 150 or 150.00
- "paymentMethod": "payment_link"

FAIL if:
- paymentMethod is "card_on_file" (no card on file)
- processPayment not called`),
      },
    ],
  },
  {
    name: 'Tool:processPayment [3]: confirms amount before calling',
    description: 'processPayment must NOT be called without confirming amount first.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'processPayment', 'params', 'payment', 'isolated', 'critical'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Balance: $275.00. Assistant has NOT yet confirmed the amount with the caller.',
      },
      { role: 'user', content: "I want to pay my balance" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Does NOT call processPayment yet (amount not confirmed by caller)
- States the balance amount ($275) to the caller
- Asks for confirmation or payment method before processing

FAIL if:
- Calls processPayment without first confirming the amount with the caller
- Does not mention the balance amount`),
      },
    ],
  },

  // --- createPaymentPlan ---
  {
    name: 'Tool:createPaymentPlan [1]: all 3 required params with correct values',
    description: 'createPaymentPlan needs patientId, totalAmount, numberOfPayments.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'createPaymentPlan', 'params', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Balance: $1,200. Caller agreed to 6-month payment plan. $200/month.',
      },
      { role: 'user', content: "Yes, set me up with 6 monthly payments" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "createPaymentPlan" is called with:
- "patientId": "pat-300"
- "totalAmount": 1200 (number)
- "numberOfPayments": 6 (number)

FAIL if:
- Any of the 3 required params missing
- totalAmount or numberOfPayments are strings instead of numbers
- createPaymentPlan not called`),
      },
    ],
  },
];

// ============================================================================
// SECTION 4: PATIENT RECORDS TOOL PARAMS
// getPatientInfo, updatePatient
// ============================================================================

const recordsToolParams: EvalDefinition[] = [
  // --- getPatientInfo ---
  {
    name: 'Tool:getPatientInfo [1]: uses patientId from search',
    description: 'getPatientInfo must use the ID returned from searchPatients.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'getPatientInfo', 'params', 'records', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Sarah Lee" (pat-200) found via searchPatients. Caller wants to see their record.',
      },
      { role: 'user', content: "Can you tell me what information you have on file for me?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "getPatientInfo" is called with:
- "patientId": "pat-200"

FAIL if:
- patientId missing or wrong
- getPatientInfo not called`),
      },
    ],
  },

  // --- updatePatient ---
  {
    name: 'Tool:updatePatient [1]: patientId + changed fields only',
    description: 'updatePatient should include patientId and only the fields being changed.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'updatePatient', 'params', 'records', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Sarah Lee" (pat-200). Caller wants to update email to sarah.lee.new@email.com and phone to +14165559999.',
      },
      { role: 'user', content: "My new email is sarah dot lee dot new at email dot com, and my new phone is 416-555-9999" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "updatePatient" is called with:
- "patientId": "pat-200"
- "email": "sarah.lee.new@email.com" (properly formatted, NOT "sarah dot lee dot new at email dot com")
- "phone": "+14165559999" or "4165559999" (properly formatted)

FAIL if:
- patientId missing
- email is in spoken format ("dot", "at")
- phone is in spoken format ("four one six...")
- updatePatient not called`),
      },
    ],
  },
  {
    name: 'Tool:updatePatient [2]: address update with all subfields',
    description: 'When updating address, all address subfields should be included.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'updatePatient', 'params', 'records', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Sarah Lee" (pat-200). Caller wants to update address to: 123 Maple Street, Toronto, ON, M5V 2T6.',
      },
      { role: 'user', content: "My new address is 123 Maple Street, Toronto, Ontario, M5V 2T6" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if "updatePatient" is called with:
- "patientId": "pat-200"
- "address" object containing:
  - "street": "123 Maple Street" or similar
  - "city": "Toronto"
  - "state": "ON" or "Ontario"
  - "zip": "M5V 2T6" or "M5V2T6"

FAIL if:
- patientId missing
- address is a flat string instead of an object
- Missing address subfields (street, city, state, zip)
- updatePatient not called`),
      },
    ],
  },
];

// ============================================================================
// SECTION 5: RESPONSE EVALUATION
// After tool returns data, does the assistant correctly interpret it?
// ============================================================================

const responseEvaluation: EvalDefinition[] = [
  // --- searchPatients response ---
  {
    name: 'Response:searchPatients [1]: found patient → confirms name correctly',
    description: 'When searchPatients returns a match, assistant must confirm the right name.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'searchPatients', 'isolated'],
    messages: [
      { role: 'user', content: "I want to check my appointments" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('searchPatients'),
        continuePlan: mockTool('searchPatients', { query: '+14165551234' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patients: [
            { patientId: 'pat-200', firstName: 'Sarah', lastName: 'Lee', email: 'sarah@email.com', phone: '+14165551234' },
          ],
          total: 1,
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Mentions "Sarah Lee" or "Sarah" by name to confirm identity
- Asks for confirmation ("Is that you?", "Can you confirm?")
- Does NOT read out email or phone unprompted (HIPAA)

FAIL if:
- Doesn't mention the patient's name
- Reads out email/phone without being asked
- Says "I found 1 result" without naming the person
- Proceeds without confirming identity`),
      },
    ],
  },
  {
    name: 'Response:searchPatients [2]: multiple results → asks to clarify',
    description: 'When multiple patients match, assistant must ask which one.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'searchPatients', 'isolated'],
    messages: [
      { role: 'user', content: "I need to schedule an appointment. My name is Sarah" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('searchPatients'),
        continuePlan: mockTool('searchPatients', { query: 'Sarah' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patients: [
            { patientId: 'pat-200', firstName: 'Sarah', lastName: 'Lee' },
            { patientId: 'pat-201', firstName: 'Sarah', lastName: 'Johnson' },
            { patientId: 'pat-202', firstName: 'Sarah', lastName: 'Kim' },
          ],
          total: 3,
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Lists the names to help the caller identify (e.g., "Sarah Lee, Sarah Johnson, or Sarah Kim?")
- Asks which one is the caller
- Does NOT just pick one without asking

FAIL if:
- Picks the first result without asking
- Doesn't list the names
- Says "I found 3 results" without helping identify`),
      },
    ],
  },
  {
    name: 'Response:searchPatients [3]: no results → offers to create',
    description: 'When no patients found, assistant must offer to create a new record.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'searchPatients', 'isolated'],
    messages: [
      { role: 'user', content: "I'd like to book a cleaning" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('searchPatients'),
        continuePlan: mockTool('searchPatients', { query: '+14165559999' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({ patients: [], total: 0 }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Informs caller they don't have a record on file
- Offers to create one / starts collecting info (name)
- Asks them to SPELL their name

FAIL if:
- Says "I can't help you" or gives up
- Does not attempt to create a new record
- Proceeds to booking without a patient record`),
      },
    ],
  },

  // --- checkAvailability response ---
  {
    name: 'Response:checkAvailability [1]: available slots → presents ALL times',
    description: 'When slots are returned, assistant must list all available times.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'checkAvailability', 'isolated'],
    messages: [
      { role: 'user', content: "I want a cleaning next Monday" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('checkAvailability'),
        continuePlan: mockTool('checkAvailability', { date: '2026-02-23', appointmentType: 'cleaning' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          available: true,
          slots: [
            { startTime: '2026-02-23T09:00:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-23T11:30:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-23T14:00:00', providerId: 'dr-2', providerName: 'Dr. Jones' },
          ],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Mentions ALL 3 time slots (9 AM, 11:30 AM, 2 PM) — not just one or two
- Includes the day (Monday)
- Asks which slot the caller prefers
- May mention the providers

FAIL if:
- Only mentions 1 or 2 of the 3 slots
- Does not ask the caller to choose
- Goes silent after listing`),
      },
    ],
  },
  {
    name: 'Response:checkAvailability [2]: no slots → presents nearest alternatives',
    description: 'When date is full, assistant must present nearest available slots from response.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'checkAvailability', 'isolated'],
    messages: [
      { role: 'user', content: "Do you have anything on Wednesday?" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('checkAvailability'),
        continuePlan: mockTool('checkAvailability', { date: '2026-02-18', appointmentType: 'cleaning' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          available: false,
          message: 'No slots on requested date.',
          nearestSlots: [
            { startTime: '2026-02-20T09:00:00', providerName: 'Dr. Smith' },
            { startTime: '2026-02-20T15:00:00', providerName: 'Dr. Jones' },
            { startTime: '2026-02-24T10:00:00', providerName: 'Dr. Smith' },
          ],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Tells the caller Wednesday is not available
- Presents the nearest alternatives (Thursday/Friday and/or next week)
- Asks if any of the alternatives work
- Does NOT call checkAvailability again (system already found nearest slots)

FAIL if:
- Does not tell the caller Wednesday is unavailable
- Does not present the alternatives from the response
- Calls checkAvailability again unnecessarily`),
      },
    ],
  },

  // --- getAppointments response ---
  {
    name: 'Response:getAppointments [1]: lists appointments accurately',
    description: 'After getting appointments, assistant must read back details correctly.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'getAppointments', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Alex Kim" (pat-700). Looking up existing appointments.',
      },
      { role: 'user', content: "What appointments do I have coming up?" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('getAppointments'),
        continuePlan: mockTool('getAppointments', { patientId: 'pat-700' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          appointments: [
            { appointmentId: 'apt-888', type: 'cleaning', startTime: '2026-02-20T11:00:00', providerName: 'Dr. Smith', duration: 30 },
            { appointmentId: 'apt-889', type: 'filling', startTime: '2026-03-05T14:30:00', providerName: 'Dr. Jones', duration: 60 },
          ],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Mentions BOTH appointments:
  1. Cleaning on Feb 20 at 11 AM with Dr. Smith
  2. Filling on March 5 at 2:30 PM with Dr. Jones
- Dates and times are correct (not swapped or wrong)
- Asks if the caller needs to do anything with either appointment

FAIL if:
- Only mentions one appointment
- Gets dates, times, or types wrong
- Swaps appointment details between the two`),
      },
    ],
  },

  // --- getPatientInfo response ---
  {
    name: 'Response:getPatientInfo [1]: reads back info without volunteering sensitive data',
    description: 'When patient asks about their record, provide info but respect HIPAA.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'getPatientInfo', 'records', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Sarah Lee" (pat-200). Caller wants to confirm info on file.',
      },
      { role: 'user', content: "What do you have on file for me?" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('getPatientInfo'),
        continuePlan: mockTool('getPatientInfo', { patientId: 'pat-200' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patientId: 'pat-200',
          firstName: 'Sarah',
          lastName: 'Lee',
          email: 'sarah@email.com',
          phone: '+14165551234',
          dateOfBirth: '1990-05-15',
          lastVisit: '2025-11-20',
          balance: 0,
          allergies: ['penicillin'],
          nextAppointment: { type: 'cleaning', date: '2026-03-01' },
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Shares the patient's name and relevant non-sensitive details
- Mentions contact info if asked (email, phone)
- Mentions next appointment (cleaning on March 1)
- Does NOT read out full date of birth unprompted unless asked
- Mentions allergies (penicillin) — this is clinically relevant

FAIL if:
- Dumps the entire raw JSON to the caller
- Ignores the question
- Does not provide useful information from the record`),
      },
    ],
  },

  // --- getPatientInsurance response ---
  {
    name: 'Response:getPatientInsurance [1]: reads insurance details accurately',
    description: 'After fetching insurance, assistant must present details correctly.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'getPatientInsurance', 'insurance', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "David Park" (pat-401). Checking insurance on file.',
      },
      { role: 'user', content: "What insurance do you have for me?" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('getPatientInsurance'),
        continuePlan: mockTool('getPatientInsurance', { patientId: 'pat-401' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          insurance: {
            insuranceId: 'ins-901',
            provider: 'Blue Cross Blue Shield',
            memberId: 'BCB-998877',
            groupNumber: 'GRP-5544',
            subscriberName: 'David Park',
            subscriberRelationship: 'self',
            isActive: true,
            coverageDetails: {
              preventive: '100%',
              basic: '80%',
              major: '50%',
            },
          },
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Mentions the insurance provider: "Blue Cross Blue Shield"
- Mentions the member ID: "BCB-998877"
- Mentions coverage details (preventive 100%, basic 80%, major 50%)
- Information is accurate — matches the API response

FAIL if:
- Gets the provider name wrong
- Gets the member ID wrong
- Invents coverage percentages not in the response
- Does not present coverage details when available`),
      },
    ],
  },

  // --- verifyInsuranceCoverage response ---
  {
    name: 'Response:verifyInsuranceCoverage [1]: presents copay + coverage accurately',
    description: 'After coverage check, must tell caller the exact copay and coverage.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'verifyInsuranceCoverage', 'insurance', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "David Park" (pat-401). Checking cleaning coverage.',
      },
      { role: 'user', content: "Is my cleaning covered?" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('verifyInsuranceCoverage'),
        continuePlan: mockTool('verifyInsuranceCoverage', { patientId: 'pat-401', serviceType: 'preventive' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          eligible: true,
          coveragePercent: 100,
          copay: 0,
          deductibleRemaining: 0,
          maxBenefitRemaining: 1500,
          notes: 'Preventive care fully covered. 2 cleanings per year included.',
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Tells the caller the cleaning IS covered
- Mentions it's 100% covered / no copay / no out-of-pocket
- May mention the 2 cleanings per year benefit
- Information matches the API response

FAIL if:
- Says cleaning is NOT covered (it is)
- Invents a copay amount that isn't $0
- Gets coverage percentage wrong
- Does not give a clear answer about coverage`),
      },
    ],
  },

  // --- getPatientBalance response ---
  {
    name: 'Response:getPatientBalance [1]: states exact balance amount',
    description: 'After getting balance, must state the exact dollar amount.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'getPatientBalance', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Checking balance.',
      },
      { role: 'user', content: "What's my balance?" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('getPatientBalance'),
        continuePlan: mockTool('getPatientBalance', { patientId: 'pat-300' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({ balance: 275.50, lastPaymentDate: '2025-12-15', lastPaymentAmount: 50.00 }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- States the balance: "$275.50" or "two hundred seventy-five dollars and fifty cents"
- Amount is EXACTLY $275.50 (not rounded or approximated)
- May mention last payment info
- Asks if they'd like to make a payment

FAIL if:
- Wrong amount (e.g., "$275", "$276", "$300")
- Does not state the balance
- Invents a different balance amount`),
      },
    ],
  },

  // --- getPaymentHistory response ---
  {
    name: 'Response:getPaymentHistory [1]: lists payments accurately',
    description: 'After getting payment history, must present amounts and dates correctly.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'getPaymentHistory', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300).',
      },
      { role: 'user', content: "Show me my recent payments" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('getPaymentHistory'),
        continuePlan: mockTool('getPaymentHistory', { patientId: 'pat-300' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          payments: [
            { date: '2025-12-15', amount: 50.00, method: 'card_on_file', description: 'Copay for filling' },
            { date: '2025-10-01', amount: 125.00, method: 'card_on_file', description: 'Cleaning + exam' },
            { date: '2025-07-20', amount: 75.00, method: 'payment_link', description: 'Balance payment' },
          ],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Lists at least the recent payments with correct amounts and approximate dates
- $50 payment in December for copay/filling
- $125 payment in October for cleaning/exam
- $75 payment in July
- Amounts are accurate — not inventing different numbers

FAIL if:
- Gets amounts wrong
- Swaps dates and amounts between payments
- Only mentions 1 of 3 payments without offering to show more
- Invents payments not in the response`),
      },
    ],
  },

  // --- bookAppointment response ---
  {
    name: 'Response:bookAppointment [1]: confirms booking details from API response',
    description: 'After booking succeeds, must confirm with details from the response.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'bookAppointment', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Booking cleaning for "John Smith" on 2026-02-23 at 14:00.',
      },
      { role: 'user', content: "Yes, book it" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('bookAppointment'),
        continuePlan: mockTool('bookAppointment', {
          patientId: 'pat-100', appointmentType: 'cleaning', startTime: '2026-02-23T14:00:00',
          duration: 30, firstName: 'John', lastName: 'Smith', email: 'john@email.com', phone: '+14165551111',
        }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          appointmentId: 'apt-500',
          confirmationNumber: 'CONF-2026-500',
          startTime: '2026-02-23T14:00:00',
          providerName: 'Dr. Jones',
          confirmationSent: true,
          confirmationEmail: 'john@email.com',
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Confirms the appointment: cleaning on Monday Feb 23 at 2 PM
- Mentions Dr. Jones (from API response)
- Mentions confirmation was sent (to email)
- May mention the confirmation number
- Asks if the caller needs anything else

FAIL if:
- Gets the date, time, or type wrong
- Does not confirm the booking
- Does not mention confirmation was sent
- Goes silent after confirming`),
      },
    ],
  },

  // --- createPatient response ---
  {
    name: 'Response:createPatient [1]: acknowledges creation + proceeds to book',
    description: 'After patient created, must acknowledge and immediately continue to booking.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'createPatient', 'scheduling', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: New patient being created for booking. Cleaning slot already chosen: 2026-02-23 at 10:00.',
      },
      { role: 'user', content: "My email is jane at example dot com" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('createPatient'),
        continuePlan: mockTool('createPatient', {
          firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '+14165551234',
        }),
      },
      {
        role: 'tool',
        content: JSON.stringify({ patientId: 'pat-new-001', firstName: 'Jane', lastName: 'Doe', created: true }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Acknowledges the profile was created
- IMMEDIATELY proceeds to book the appointment (calls bookAppointment or confirms details before booking)
- Does NOT stop and wait for the caller to say "ok"
- Keeps the conversation flowing

FAIL if:
- Says "profile created" then goes silent
- Waits for caller acknowledgment before continuing
- Does not proceed to booking`),
      },
    ],
  },

  // --- processPayment response ---
  {
    name: 'Response:processPayment [1]: confirms payment success with receipt details',
    description: 'After successful payment, must confirm amount and provide receipt info.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'processPayment', 'payment', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Processing $275 payment.',
      },
      { role: 'user', content: "Yes, charge it to my card on file" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('processPayment'),
        continuePlan: mockTool('processPayment', { patientId: 'pat-300', amount: 275, paymentMethod: 'card_on_file' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          transactionId: 'txn-12345',
          amount: 275.00,
          receiptSent: true,
          receiptEmail: 'tom@email.com',
          remainingBalance: 0,
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Confirms payment of $275 was successful
- Mentions receipt was sent (to email)
- Mentions remaining balance is $0 (paid in full)
- Asks if there's anything else
- Amount matches exactly ($275, not a different number)

FAIL if:
- Gets the payment amount wrong
- Does not confirm success
- Does not mention receipt
- Invents a remaining balance`),
      },
    ],
  },

  // --- processPayment failure response ---
  {
    name: 'Response:processPayment [2]: payment fails → offers alternatives',
    description: 'When payment fails, must not panic — offer alternatives.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'processPayment', 'payment', 'error', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Tom Davis" (pat-300). Processing $275 payment.',
      },
      { role: 'user', content: "Charge the $275" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('processPayment'),
        continuePlan: mockTool('processPayment', { patientId: 'pat-300', amount: 275, paymentMethod: 'card_on_file' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({
          success: false,
          error: 'Card declined',
          message: 'The card on file was declined. Please try a different payment method.',
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Informs the caller the card was declined (sensitively, not blaming)
- Offers alternatives: payment link, different card, call back
- Does NOT end the call or give up
- Maintains professional/empathetic tone

FAIL if:
- Blames the caller
- Gives up without offering alternatives
- Reads the raw error message verbatim
- Hangs up`),
      },
    ],
  },

  // --- addPatientNote response ---
  {
    name: 'Response:addPatientNote [1]: confirms note was saved',
    description: 'After saving a note, acknowledge it was recorded.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'response-eval', 'addPatientNote', 'isolated'],
    messages: [
      {
        role: 'system',
        content: 'Context: Patient "Sarah Lee" (pat-200). Caller mentioned latex allergy.',
      },
      { role: 'user', content: "Please note I have a latex allergy" },
      {
        role: 'assistant',
        judgePlan: hardToolCheck('addPatientNote'),
        continuePlan: mockTool('addPatientNote', { patientId: 'pat-200', content: 'Latex allergy - requires non-latex gloves', category: 'allergy' }),
      },
      {
        role: 'tool',
        content: JSON.stringify({ success: true, noteId: 'note-001' }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Confirms the allergy has been noted/recorded
- Reassures the caller (e.g., "we'll make sure to use non-latex gloves")
- Asks if there's anything else

FAIL if:
- Does not confirm the note was saved
- Ignores the allergy
- Reads back the noteId or raw response`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export const ALL_TOOL_CALL_TESTS: EvalDefinition[] = [
  ...schedulingToolParams,
  ...insuranceToolParams,
  ...paymentToolParams,
  ...recordsToolParams,
  ...responseEvaluation,
];

export const TOOL_CALL_TEST_GROUPS = {
  scheduling: schedulingToolParams,
  insurance: insuranceToolParams,
  payment: paymentToolParams,
  records: recordsToolParams,
  response: responseEvaluation,
} as const;

export type ToolCallTestGroup = keyof typeof TOOL_CALL_TEST_GROUPS;

export const TOOL_CALL_SUMMARY = {
  total: ALL_TOOL_CALL_TESTS.length,
  groups: Object.entries(TOOL_CALL_TEST_GROUPS).map(([group, tests]) => ({
    group,
    count: tests.length,
  })),
};
