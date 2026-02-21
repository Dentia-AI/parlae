/**
 * Dental Clinic Squad — Comprehensive Chat-Based Eval Suite
 *
 * Tests the squad's routing, handoffs, tool calls, and prompt adherence
 * using Vapi's Eval API (chat.mockConversation). No voice/STT/TTS costs —
 * only LLM costs per eval run.
 *
 * Usage:
 *   1. Create evals:  POST /eval  (one per test case)
 *   2. Run evals:     POST /eval/run  with target { type: "squad", squadId }
 *   3. Check results: GET  /eval/run/{id}
 *
 * See the companion runner script: run-evals.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalJudgePlan {
  type: 'exact' | 'regex' | 'ai';
  content?: string;
  toolCalls?: Array<{
    name: string;
    arguments?: Record<string, unknown>;
  }>;
  model?: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
  };
}

export interface EvalContinuePlan {
  exitOnFailureEnabled?: boolean;
  contentOverride?: string;
  toolCallsOverride?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface EvalMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  judgePlan?: EvalJudgePlan;
  continuePlan?: EvalContinuePlan;
}

export interface EvalDefinition {
  name: string;
  description: string;
  type: 'chat.mockConversation';
  category: string;
  tags: string[];
  messages: EvalMessage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aiJudge(criteria: string, model = 'gpt-4o'): EvalJudgePlan {
  return {
    type: 'ai',
    model: {
      provider: 'openai',
      model,
      messages: [
        {
          role: 'system',
          content: `You are an LLM-Judge. Evaluate ONLY the last assistant message in the mock conversation: {{messages[-1]}}.

Full conversation for context: {{messages}}

Decision rule:
- PASS if ALL "pass criteria" are satisfied AND NONE of the "fail criteria" are triggered.
- Otherwise FAIL.

${criteria}

Output format: respond with exactly one word: pass or fail
- No explanations
- No punctuation
- No additional text`,
        },
      ],
    },
  };
}

function exitOnFail(): EvalContinuePlan {
  return { exitOnFailureEnabled: true };
}

function toolCallOverride(
  name: string,
  args: Record<string, unknown>,
  content?: string,
): EvalContinuePlan {
  return {
    exitOnFailureEnabled: false,
    ...(content ? { contentOverride: content } : {}),
    toolCallsOverride: [{ name, arguments: args }],
  };
}

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 1: TRIAGE ROUTING
// Validates the Triage Receptionist correctly identifies caller needs
// and routes to the right specialist.
// =========================================================================
// ---------------------------------------------------------------------------

const triageRouting: EvalDefinition[] = [
  // 1.1 — Route to Emergency
  {
    name: 'Triage → Emergency: Severe pain',
    description: 'Caller reports severe tooth pain. Triage must route to Emergency Transfer immediately without delay.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'emergency', 'routing', 'critical'],
    messages: [
      {
        role: 'user',
        content: 'I have a really bad toothache, it hurts so much I can\'t sleep',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response acknowledges the pain with empathy
- Response does NOT ask multiple clarifying questions that delay help
- A handoff tool call is made to "Emergency Transfer"
- Response does NOT contain the words "transfer", "transferring", or "connect you with"

Fail criteria (any triggers FAIL):
- Response asks for insurance, billing, or scheduling info before addressing the emergency
- Response says "transferring" or announces a transfer
- No handoff to Emergency Transfer is initiated
- Response tries to diagnose or give medical advice`),
        continuePlan: exitOnFail(),
      },
    ],
  },

  // 1.2 — Route to Emergency: bleeding
  {
    name: 'Triage → Emergency: Bleeding',
    description: 'Caller reports uncontrolled bleeding. Must route to Emergency immediately.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'emergency', 'routing', 'critical'],
    messages: [
      {
        role: 'user',
        content: 'My gums won\'t stop bleeding and there\'s a lot of blood',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response acknowledges urgency of bleeding
- A handoff is initiated to "Emergency Transfer"
- Uses a natural transition (not the word "transfer")
- Does NOT delay with unnecessary questions

Fail criteria:
- Says "transferring" or "let me transfer you"
- Routes to Scheduling or any non-emergency specialist
- Asks for insurance or billing info first`),
      },
    ],
  },

  // 1.3 — Route to Emergency: knocked out tooth
  {
    name: 'Triage → Emergency: Knocked-out tooth',
    description: 'Caller reports a knocked-out tooth from an accident.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'emergency', 'routing', 'critical'],
    messages: [
      {
        role: 'user',
        content: 'My kid fell off his bike and knocked out his front tooth, there\'s blood everywhere',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response acknowledges the emergency urgently
- Handoff to "Emergency Transfer" is initiated
- Response is calm but conveys urgency
- Does NOT use the word "transfer"

Fail criteria:
- Routes to Scheduling instead of Emergency
- Asks for patient records or insurance first
- Says "transferring" or "connect you with"
- Delays with unnecessary questions`),
      },
    ],
  },

  // 1.4 — Route to Booking Agent
  {
    name: 'Triage → Booking: Book cleaning',
    description: 'Caller wants to book a teeth cleaning. Receptionist routes to Booking Agent.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'scheduling', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'Hi, I\'d like to schedule a teeth cleaning please',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response acknowledges the scheduling request
- A handoff to "Booking Agent" (or "Scheduling") is initiated
- Uses natural transition language (e.g., "Let me look at the schedule" or "Sure, let me help you with that")
- Does NOT say "transferring" or announce a handoff

Fail criteria:
- Routes to Emergency, Insurance, or any wrong specialist
- Says "transferring" or "let me transfer you"
- Tries to check availability itself (Receptionist has no scheduling tools)`),
      },
    ],
  },

  // 1.5 — Route to Appointment Management: Cancel
  {
    name: 'Triage → Appointment Mgmt: Cancel appointment',
    description: 'Caller wants to cancel an appointment. Should route to Appointment Management.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'scheduling', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'I need to cancel my appointment for next week',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response acknowledges the cancellation request
- Handoff to "Appointment Management" (or "Scheduling") is initiated
- Natural transition language used

Fail criteria:
- Routes to wrong specialist
- Says "transferring"`),
      },
    ],
  },

  // 1.6 — Route to Patient Records
  {
    name: 'Triage → Patient Records: Update address',
    description: 'Caller wants to update their address. Should route to Patient Records.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'patient-records', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'I just moved and I need to update my address in your system',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Acknowledges the address update request
- Handoff to "Patient Records" is initiated
- Uses natural transition like "Let me pull up your record"

Fail criteria:
- Routes to Scheduling, Insurance, or any wrong specialist
- Says "transferring"`),
      },
    ],
  },

  // 1.7 — Route to Insurance & Billing: New insurance
  {
    name: 'Triage → Insurance & Billing: New insurance',
    description: 'Caller has new insurance to add. Should route to Insurance & Billing.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'insurance', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'I got new dental insurance and I want to add it to my file',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Acknowledges the insurance request
- Handoff to "Insurance & Billing" (or "Insurance") is initiated
- Natural transition language used

Fail criteria:
- Routes to Scheduling or wrong specialist
- Says "transferring"`),
      },
    ],
  },

  // 1.8 — Route to Insurance & Billing: Check balance
  {
    name: 'Triage → Insurance & Billing: Check balance',
    description: 'Caller wants to know their balance. Should route to Insurance & Billing.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'payment', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'How much do I owe? I want to check my balance',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Acknowledges the billing inquiry
- Handoff to "Insurance & Billing" (or "Payment & Billing") is initiated
- Natural transition language

Fail criteria:
- Routes to wrong specialist
- Says "transferring"`),
      },
    ],
  },

  // 1.9 — Receptionist answers clinic info directly
  {
    name: 'Triage → Receptionist answers hours directly',
    description: 'Caller asks about clinic hours. Receptionist answers directly (v4.0 merged Triage + Clinic Info).',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'clinic-info', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'What are your office hours?',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Answers the hours question DIRECTLY (Receptionist has clinic info built-in)
- Provides actual hours or says what hours are available
- Does NOT route to another specialist for this simple question
- May offer to schedule an appointment after answering

Fail criteria:
- Routes to a different specialist for a simple hours question
- Says "transferring"
- Does not answer the question`),
      },
    ],
  },

  // 1.10 — Receptionist answers services question
  {
    name: 'Triage → Receptionist answers services question',
    description: 'Caller asks about services. Receptionist answers directly.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'clinic-info', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'Do you guys do teeth whitening?',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Answers the services question directly (Receptionist has clinic info)
- Mentions whether whitening is offered
- May proactively offer to schedule if the service is available

Fail criteria:
- Routes to another specialist for this simple question
- Says "transferring"
- Ignores the question`),
      },
    ],
  },

  // 1.11 — Priority: Emergency over Booking
  {
    name: 'Triage Priority: Emergency trumps appointment request',
    description: 'Caller mentions both pain AND wanting an appointment. Emergency takes priority.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'emergency', 'priority', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'I need an appointment as soon as possible, my tooth is killing me and my face is swollen',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Recognizes this as an EMERGENCY (swelling + severe pain)
- Handoff to "Emergency" (NOT Booking Agent or Scheduling)
- Response shows urgency and empathy

Fail criteria:
- Routes to "Booking Agent" or "Scheduling" instead of "Emergency"
- Asks about appointment type before addressing the emergency
- Says "transferring"`),
      },
    ],
  },

  // 1.12 — Ambiguous request: Triage asks clarifying question
  {
    name: 'Triage: Clarifying question for ambiguous request',
    description: 'Caller says something vague. Triage should ask ONE clarifying question.',
    type: 'chat.mockConversation',
    category: 'triage-routing',
    tags: ['triage', 'clarification', 'routing'],
    messages: [
      {
        role: 'user',
        content: 'I need some help with my account',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Asks a clarifying question to determine what type of account help is needed
- Only asks ONE question (not multiple)
- The question helps distinguish between billing, insurance, patient records, etc.
- Tone is friendly and helpful

Fail criteria:
- Routes to a specialist without clarifying (too ambiguous to route)
- Asks more than one question at a time
- Says "transferring"`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 2: SILENT HANDOFF PROTOCOL
// Validates that assistants NEVER say "transfer/transferring" and use
// natural transition language instead.
// =========================================================================
// ---------------------------------------------------------------------------

const silentHandoff: EvalDefinition[] = [
  // 2.1 — Triage uses natural transition
  {
    name: 'Silent Handoff: Triage uses natural language',
    description: 'Verify triage never says "transfer" when routing to scheduling.',
    type: 'chat.mockConversation',
    category: 'silent-handoff',
    tags: ['handoff', 'triage', 'language'],
    messages: [
      {
        role: 'user',
        content: 'I want to book an appointment for a dental exam',
      },
      {
        role: 'assistant',
        judgePlan: {
          type: 'ai',
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `You are an LLM-Judge checking for forbidden transfer language.

Evaluate the assistant message: {{messages[-1]}}

PASS if ALL of these are true:
- The response does NOT contain any of these forbidden words/phrases (case-insensitive):
  "transfer", "transferring", "connect you with", "connecting you", "I'll transfer", "let me transfer", "one moment while I transfer"
- The response DOES use a natural transition like "Let me help you with that", "Sure, let me look at the schedule", "Let me check on that"
- The response acknowledges what the caller needs

FAIL if ANY forbidden phrase appears in the response.

Output: pass or fail`,
              },
            ],
          },
        },
      },
    ],
  },

  // 2.2 — Post-handoff assistant doesn't re-greet
  {
    name: 'Silent Handoff: Scheduling does not re-greet after handoff',
    description: 'When Scheduling receives a handoff, it must NOT say "Hello" or introduce itself.',
    type: 'chat.mockConversation',
    category: 'silent-handoff',
    tags: ['handoff', 'scheduling', 'continuity'],
    messages: [
      {
        role: 'user',
        content: 'I want to schedule a cleaning for next week',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response does NOT contain a greeting ("Hello", "Hi there", "Welcome", "How can I help")
- Response does NOT introduce itself ("I'm the scheduling...", "My name is...")
- Response immediately addresses the scheduling request (e.g., checking availability)
- Feels like a natural continuation of the conversation

Fail criteria:
- Contains any greeting phrase
- Introduces itself as a specialist
- Says "transferring"
- Does not address the scheduling need`),
      },
    ],
  },

  // 2.3 — Emergency handoff: no transfer language
  {
    name: 'Silent Handoff: Emergency does not announce transfer',
    description: 'Emergency Transfer should feel seamless — no transfer announcement.',
    type: 'chat.mockConversation',
    category: 'silent-handoff',
    tags: ['handoff', 'emergency', 'language'],
    messages: [
      {
        role: 'user',
        content: 'My tooth just broke in half and it\'s bleeding badly',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response immediately addresses the emergency
- Does NOT contain "transfer", "transferring", "connect you with"
- Shows urgency and empathy
- Does NOT greet or introduce itself

Fail criteria:
- Contains forbidden transfer language
- Greets the caller ("Hello", "Hi")
- Delays emergency response with unnecessary questions`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 3: SCHEDULING WORKFLOW
// Tests the full scheduling flow: availability → patient lookup/create →
// book → confirm. Validates correct tool calls with correct parameters.
// =========================================================================
// ---------------------------------------------------------------------------

const schedulingWorkflow: EvalDefinition[] = [
  // 3.1 — Booking: Check availability FIRST (before patient lookup)
  {
    name: 'Scheduling: Checks availability before patient lookup',
    description: 'Per workflow rules, scheduler must check availability FIRST, then look up patient AFTER a time is chosen.',
    type: 'chat.mockConversation',
    category: 'scheduling',
    tags: ['scheduling', 'tool-call', 'workflow-order'],
    messages: [
      {
        role: 'user',
        content: 'I\'d like to book a cleaning for tomorrow',
      },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'checkAvailability' }],
        },
        continuePlan: exitOnFail(),
      },
    ],
  },

  // 3.2 — Booking: checkAvailability with correct params
  {
    name: 'Scheduling: checkAvailability uses correct date format',
    description: 'Validates checkAvailability is called with YYYY-MM-DD date and correct appointment type.',
    type: 'chat.mockConversation',
    category: 'scheduling',
    tags: ['scheduling', 'tool-call', 'params'],
    messages: [
      {
        role: 'user',
        content: 'I need a dental exam for today please',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- The assistant calls "checkAvailability" tool
- The "date" parameter is in YYYY-MM-DD format
- The "date" is today's date or in the future (year 2026 or later, NEVER 2023/2024/2025)
- The "appointmentType" parameter is "exam" (or similar valid type)

Fail criteria:
- Date is from 2023, 2024, or 2025
- Date is not in YYYY-MM-DD format
- checkAvailability is not called
- appointmentType is missing or wrong`),
        continuePlan: exitOnFail(),
      },
    ],
  },

  // 3.3 — Full booking flow (multi-turn): new patient
  {
    name: 'Scheduling: Full booking flow — new patient',
    description: 'Complete booking conversation: availability → time selected → patient not found → collect info → create → book.',
    type: 'chat.mockConversation',
    category: 'scheduling',
    tags: ['scheduling', 'tool-call', 'full-flow', 'new-patient'],
    messages: [
      // Turn 1: caller requests cleaning
      { role: 'user', content: 'I want to book a cleaning for next Monday' },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'checkAvailability' }],
        },
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'I have openings at 10:00 AM and 2:00 PM on Monday. Which works better for you?',
          toolCallsOverride: [
            {
              name: 'checkAvailability',
              arguments: { date: '2026-02-23', appointmentType: 'cleaning' },
            },
          ],
        },
      },
      // Tool response: availability
      {
        role: 'tool',
        content: JSON.stringify({
          available: true,
          slots: [
            { startTime: '2026-02-23T10:00:00', providerId: 'dr-smith-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-23T14:00:00', providerId: 'dr-jones-2', providerName: 'Dr. Jones' },
          ],
        }),
      },
      // Turn 2: caller picks a time
      { role: 'user', content: 'The 2 PM works for me' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "lookupPatient" or "searchPatients" to identify the caller
- Uses phone number from call metadata

Fail criteria:
- Does not look up the patient
- Asks for phone number`),
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'I don\'t see an existing record for your number. May I have your first and last name?',
          toolCallsOverride: [
            { name: 'lookupPatient', arguments: { query: '+14165551234' } },
          ],
        },
      },
      // Tool response: patient not found
      { role: 'tool', content: JSON.stringify({ patients: [], total: 0 }) },
      // Turn 3: caller provides name
      { role: 'user', content: 'Sure, it\'s John Smith. J-O-H-N S-M-I-T-H' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Assistant asks for the caller's EMAIL address (this is REQUIRED before creating a patient)
- May also confirm/ask about phone
- Does NOT skip email collection
- Does NOT call createPatient yet (email not collected)

Fail criteria:
- Calls createPatient without having collected email
- Skips asking for email entirely
- Moves straight to booking without patient creation`),
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'Thanks John. What email address should I send the appointment confirmation to?',
        },
      },
      // Turn 4: caller provides email
      { role: 'user', content: 'It\'s john dot smith at gmail dot com. J-O-H-N dot S-M-I-T-H at gmail dot com' },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'createPatient' }],
        },
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'Great, you\'re all set up. Let me book that 2 PM slot for you now.',
          toolCallsOverride: [
            {
              name: 'createPatient',
              arguments: {
                firstName: 'John',
                lastName: 'Smith',
                email: 'john.smith@gmail.com',
                phone: '+14165551234',
              },
            },
          ],
        },
      },
      // Tool response: patient created
      {
        role: 'tool',
        content: JSON.stringify({ patientId: 'pat-new-001', firstName: 'John', lastName: 'Smith' }),
      },
      // Turn 5: assistant books (should call bookAppointment immediately without waiting)
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "bookAppointment" tool with patientId, appointmentType, startTime, duration, firstName, lastName, email, phone
- startTime is in ISO 8601 format for the Monday 2 PM slot
- appointmentType is "cleaning"
- Does NOT pause and wait for caller to say "ok" — immediately proceeds to book
- After booking, confirms the appointment details AND asks if anything else is needed

Fail criteria:
- Does not call bookAppointment
- Missing required params (patientId, email, phone, firstName, lastName)
- Pauses/waits instead of immediately booking after createPatient`),
      },
    ],
  },

  // 3.4 — Cancellation flow
  {
    name: 'Scheduling: Cancellation flow',
    description: 'Caller wants to cancel. Must: lookupPatient → getAppointments → confirm → cancelAppointment.',
    type: 'chat.mockConversation',
    category: 'scheduling',
    tags: ['scheduling', 'tool-call', 'cancellation'],
    messages: [
      { role: 'user', content: 'I need to cancel my appointment' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "lookupPatient" or "searchPatients"
- Uses phone from call metadata

Fail criteria:
- Does not look up the patient`),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'lookupPatient', arguments: { query: '+14165551234' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patients: [{ patientId: 'pat-100', firstName: 'Sarah', lastName: 'Lee' }],
          total: 1,
        }),
      },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'getAppointments' }],
        },
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'I see you have a cleaning appointment on Wednesday at 3 PM. Is that the one you\'d like to cancel?',
          toolCallsOverride: [
            { name: 'getAppointments', arguments: { patientId: 'pat-100' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          appointments: [
            { appointmentId: 'apt-200', type: 'cleaning', date: '2026-02-25', time: '15:00', provider: 'Dr. Smith' },
          ],
        }),
      },
      { role: 'user', content: 'Yes, that one please' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "cancelAppointment" with appointmentId "apt-200"
- Confirms the cancellation with the caller
- Offers to reschedule ("Would you like to reschedule?")

Fail criteria:
- Cancels without confirming which appointment
- Does not call cancelAppointment tool
- Does not offer to reschedule afterward`),
      },
    ],
  },

  // 3.5 — Rescheduling flow
  {
    name: 'Scheduling: Reschedule flow',
    description: 'Caller wants to reschedule. Must find patient, check new availability, then reschedule.',
    type: 'chat.mockConversation',
    category: 'scheduling',
    tags: ['scheduling', 'tool-call', 'reschedule'],
    messages: [
      { role: 'user', content: 'I need to reschedule my appointment to next Friday' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "lookupPatient" or "searchPatients"
- Uses phone from call metadata

Fail criteria:
- Does not look up the patient`),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'lookupPatient', arguments: { query: '+14165551234' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patients: [{ patientId: 'pat-100', firstName: 'Mike', lastName: 'Chen' }],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls getAppointments to find the existing appointment
- Then calls checkAvailability for the new requested date (next Friday)
- Both tool calls are initiated

Fail criteria:
- Tries to reschedule without checking the patient's current appointments
- Tries to reschedule without checking availability for the new date`),
      },
    ],
  },

  // 3.6 — Scheduling: Keep conversation moving (no dead air)
  {
    name: 'Scheduling: Never ends turn with just a statement',
    description: 'After every tool result, scheduler must IMMEDIATELY continue (ask question or call next tool). No dead air.',
    type: 'chat.mockConversation',
    category: 'scheduling',
    tags: ['scheduling', 'conversation-flow', 'critical'],
    messages: [
      { role: 'user', content: 'I want to book a filling' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response either asks a question (preferred date?) OR calls checkAvailability
- Response does NOT end with just a statement like "I can help with that." and then go silent
- Every response either asks a question or calls a tool

Fail criteria:
- Response is a statement with no question and no tool call
- Response says "I can help with that" or similar without asking for date/time preference`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 4: EMERGENCY HANDLING
// Validates the Emergency Transfer assistant properly handles emergencies.
// =========================================================================
// ---------------------------------------------------------------------------

const emergencyHandling: EvalDefinition[] = [
  // 4.1 — Life-threatening: advise 911
  {
    name: 'Emergency: Life-threatening → advise 911',
    description: 'Caller reports difficulty breathing. Emergency must advise calling 911.',
    type: 'chat.mockConversation',
    category: 'emergency',
    tags: ['emergency', 'life-threatening', 'critical'],
    messages: [
      { role: 'user', content: 'I can barely breathe, my throat is swelling up from a dental infection' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response tells the caller to call 911 or go to the emergency room IMMEDIATELY
- Response is calm but urgent
- Does NOT try to book an appointment first
- Does NOT try to diagnose
- Does NOT ask for insurance or patient records

Fail criteria:
- Does not advise calling 911
- Tries to schedule an appointment for a life-threatening situation
- Asks for insurance or billing information
- Says "calm down" or "don't worry"`),
      },
    ],
  },

  // 4.2 — Urgent: book emergency appointment
  {
    name: 'Emergency: Urgent → book emergency appointment',
    description: 'Caller has a broken tooth (urgent, not life-threatening). Should check availability and book emergency appointment.',
    type: 'chat.mockConversation',
    category: 'emergency',
    tags: ['emergency', 'urgent', 'tool-call'],
    messages: [
      { role: 'user', content: 'I bit down on something hard and my tooth cracked in half. It really hurts.' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response acknowledges the urgency and broken tooth
- Calls "checkAvailability" with today's date and appointmentType "emergency"
- Does NOT ask unnecessary questions before checking availability
- Provides first aid advice (e.g., avoid hot/cold, take ibuprofen)

Fail criteria:
- Does not call checkAvailability
- Uses a date from 2023/2024/2025
- Tells the caller to call 911 (this is urgent, not life-threatening)
- Asks for insurance or detailed medical history first`),
        continuePlan: exitOnFail(),
      },
    ],
  },

  // 4.3 — Emergency: does not greet after handoff
  {
    name: 'Emergency: No greeting after silent handoff',
    description: 'Emergency assistant must not re-greet — it should immediately address the emergency.',
    type: 'chat.mockConversation',
    category: 'emergency',
    tags: ['emergency', 'handoff', 'continuity'],
    messages: [
      { role: 'user', content: 'I have terrible pain in my jaw and my face is swelling up on one side' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Response does NOT contain greetings like "Hello", "Hi", "How can I help"
- Immediately addresses the swelling and pain
- Expresses empathy and urgency
- Takes action (checks availability or advises emergency steps)

Fail criteria:
- Contains any greeting or self-introduction
- Does not address the emergency immediately`),
      },
    ],
  },

  // 4.4 — Emergency: first aid advice while arranging care
  {
    name: 'Emergency: Provides first aid advice',
    description: 'For a knocked-out tooth, assistant should give first aid advice while booking.',
    type: 'chat.mockConversation',
    category: 'emergency',
    tags: ['emergency', 'first-aid'],
    messages: [
      { role: 'user', content: 'My tooth just got knocked out playing hockey. I have the tooth with me.' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Gives first aid advice about the knocked-out tooth (keep it moist in milk or saliva, don't touch the root)
- Takes action to arrange emergency care (calls checkAvailability or advises coming in)
- Shows urgency

Fail criteria:
- Does not provide any first aid advice
- Only provides first aid without arranging care
- Gives medical diagnosis or treatment advice beyond first aid`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 5: TOOL CALL VALIDATION
// Validates that tools are called with correct parameters.
// =========================================================================
// ---------------------------------------------------------------------------

const toolCallValidation: EvalDefinition[] = [
  // 5.1 — lookupPatient uses caller phone number
  {
    name: 'Tool: lookupPatient uses caller phone number',
    description: 'When looking up a patient, assistant must use the caller phone number from call metadata.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'lookupPatient', 'phone'],
    messages: [
      { role: 'user', content: 'I want to cancel my appointment' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "lookupPatient" or "searchPatients" tool
- The "query" parameter contains a phone number (not a made-up name or placeholder)
- Does NOT ask the caller for their phone number (it's available from call metadata)

Fail criteria:
- Asks "What is your phone number?" instead of using the one from call metadata
- Does not call lookupPatient or searchPatients
- Uses a placeholder like "PHONE_NUMBER" or "xxx"`),
      },
    ],
  },

  // 5.2 — bookAppointment has all required fields
  {
    name: 'Tool: bookAppointment includes all required params',
    description: 'bookAppointment must include patientId, appointmentType, startTime, duration, firstName, lastName, email, phone.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'bookAppointment', 'params', 'critical'],
    messages: [
      { role: 'user', content: 'Yes, book me in for the 10 AM cleaning please' },
      {
        role: 'system',
        content: 'Context: Patient "Jane Doe" (pat-501, jane@email.com, +14165559999) selected the 10 AM cleaning slot on 2026-02-23 with Dr. Smith (dr-smith-1). Duration: 30 minutes.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "bookAppointment" tool
- Includes ALL of: patientId, appointmentType, startTime, duration, firstName, lastName, email, phone
- startTime is ISO 8601 format (2026-02-23T10:00:00 or similar)
- appointmentType is "cleaning"
- duration is 30

Fail criteria:
- Missing any required parameter (especially email or phone)
- startTime is not ISO 8601 format
- appointmentType is wrong or missing
- patientId is missing`),
      },
    ],
  },

  // 5.3 — createPatient requires email
  {
    name: 'Tool: createPatient requires email before calling',
    description: 'The assistant must collect email before calling createPatient — it is a required field.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'createPatient', 'email-required'],
    messages: [
      { role: 'user', content: 'My name is Bob Lee, B-O-B L-E-E' },
      {
        role: 'system',
        content: 'Context: This is a new patient. searchPatients returned no results. The assistant has collected the name but NOT the email yet.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Assistant asks for the email address BEFORE calling createPatient
- Does NOT call createPatient without email
- May also confirm phone number

Fail criteria:
- Calls createPatient without having an email
- Skips email collection entirely
- Proceeds to booking without creating the patient record`),
      },
    ],
  },

  // 5.4 — processPayment: confirms amount before processing
  {
    name: 'Tool: processPayment confirms amount before processing',
    description: 'Payment specialist must confirm the exact amount with the caller before calling processPayment.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'processPayment', 'confirmation', 'critical'],
    messages: [
      { role: 'user', content: 'I\'d like to pay my balance' },
      {
        role: 'system',
        content: 'Context: Patient pat-300. getPatientBalance returned $275.00 balance.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Tells the caller their balance amount ($275)
- Asks for confirmation before processing payment
- Asks about payment method preference
- Does NOT process payment without explicit confirmation from caller

Fail criteria:
- Calls processPayment without confirming the amount
- Does not tell the caller the amount
- Processes payment without asking for payment method`),
      },
    ],
  },

  // 5.5 — PCI: Never asks for credit card number
  {
    name: 'Tool: Never asks for credit card number',
    description: 'Payment specialist must NEVER ask for full credit card details — use card_on_file or payment_link.',
    type: 'chat.mockConversation',
    category: 'tool-calls',
    tags: ['tool-call', 'payment', 'security', 'PCI', 'critical'],
    messages: [
      { role: 'user', content: 'I want to pay with a new card' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Does NOT ask for card number, CVV, or expiration date
- Suggests sending a "secure payment link" instead
- Uses paymentMethod "payment_link" approach
- Maintains PCI compliance

Fail criteria:
- Asks for credit card number or any card details
- Asks for CVV, expiration, or card type
- Attempts to take card details over the phone`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 6: CROSS-ASSISTANT ROUTING
// Tests routing between non-triage assistants (e.g., Scheduling → Insurance).
// =========================================================================
// ---------------------------------------------------------------------------

const crossRouting: EvalDefinition[] = [
  // 6.1 — Booking Agent → Insurance & Billing
  {
    name: 'Cross-route: Booking → Insurance & Billing when asked about coverage',
    description: 'If a caller in Booking Agent asks about insurance, it should route to Insurance & Billing.',
    type: 'chat.mockConversation',
    category: 'cross-routing',
    tags: ['routing', 'scheduling', 'insurance'],
    messages: [
      { role: 'user', content: 'Before I book, is this covered by my insurance?' },
      {
        role: 'system',
        content: 'Context: Caller is currently speaking with the Booking Agent assistant.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Handoff to "Insurance & Billing" (or "Insurance") is initiated
- Uses natural transition language
- Does NOT try to answer insurance questions itself

Fail criteria:
- Tries to answer the insurance question (Booking Agent doesn't have insurance tools)
- Routes to wrong specialist
- Says "transferring"`),
      },
    ],
  },

  // 6.2 — Insurance & Billing → Booking Agent (post-coverage, wants to book)
  {
    name: 'Cross-route: Insurance & Billing → Booking when caller wants to book',
    description: 'After insurance questions, if caller wants to book, route to Booking Agent.',
    type: 'chat.mockConversation',
    category: 'cross-routing',
    tags: ['routing', 'insurance', 'scheduling'],
    messages: [
      { role: 'user', content: 'Great, my insurance covers cleanings. Can I book one?' },
      {
        role: 'system',
        content: 'Context: Caller is currently speaking with the Insurance & Billing assistant.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Handoff to "Booking Agent" (or "Scheduling") is initiated
- Natural transition language used
- Acknowledges they want to book after insurance confirmation

Fail criteria:
- Tries to book the appointment itself (Insurance & Billing doesn't have scheduling tools)
- Routes to wrong specialist`),
      },
    ],
  },

  // 6.3 — Insurance question mid-billing
  {
    name: 'Cross-route: Insurance & Billing handles coverage question in-context',
    description: 'Since Insurance and Payment are now merged, coverage questions are handled in-context.',
    type: 'chat.mockConversation',
    category: 'cross-routing',
    tags: ['routing', 'insurance'],
    messages: [
      { role: 'user', content: 'Wait, shouldn\'t my insurance cover this? Why am I being charged?' },
      {
        role: 'system',
        content: 'Context: Caller is currently speaking with the Insurance & Billing assistant about their balance.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Addresses the insurance coverage question directly (Insurance & Billing has both tools)
- Calls verifyInsuranceCoverage or explains the billing vs coverage difference
- Does NOT route to another specialist (this assistant handles both insurance and billing)
- Natural, empathetic response

Fail criteria:
- Ignores the coverage question
- Routes to a different specialist unnecessarily
- Says "transferring"`),
      },
    ],
  },

  // 6.4 — Any assistant → Emergency when symptoms mentioned mid-conversation
  {
    name: 'Cross-route: Any → Emergency when urgent symptoms arise mid-call',
    description: 'If a caller mentions emergency symptoms at any point, route to Emergency immediately.',
    type: 'chat.mockConversation',
    category: 'cross-routing',
    tags: ['routing', 'emergency', 'critical'],
    messages: [
      { role: 'user', content: 'Actually, I\'m also in really bad pain right now and my face is swelling. Can you help?' },
      {
        role: 'system',
        content: 'Context: Caller was mid-conversation with the Patient Records assistant about updating their address.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- IMMEDIATELY routes to "Emergency Transfer"
- Does NOT continue with the address update
- Acknowledges the emergency symptoms
- Shows urgency

Fail criteria:
- Continues with the patient records task instead of routing to Emergency
- Ignores the emergency symptoms
- Routes to Scheduling instead of Emergency`),
      },
    ],
  },

  // 6.5 — Booking Agent → Receptionist for unresolvable issue
  {
    name: 'Cross-route: Booking → Receptionist for unresolvable issue',
    description: 'If Booking Agent can\'t help (e.g., complaint), route back to Receptionist.',
    type: 'chat.mockConversation',
    category: 'cross-routing',
    tags: ['routing', 'scheduling', 'triage', 'fallback'],
    messages: [
      { role: 'user', content: 'I want to file a complaint about the dentist I saw last time' },
      {
        role: 'system',
        content: 'Context: Caller is speaking with the Booking Agent assistant.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Routes back to "Receptionist" (or "Triage") — complaints are outside scheduling scope
- Uses natural transition language
- Shows empathy about the complaint

Fail criteria:
- Tries to handle the complaint itself
- Routes to wrong specialist
- Dismisses the complaint`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 7: PATIENT RECORDS & HIPAA
// Tests identity verification and HIPAA compliance.
// =========================================================================
// ---------------------------------------------------------------------------

const patientRecordsHipaa: EvalDefinition[] = [
  // 7.1 — Identity verification via lookupPatient
  {
    name: 'HIPAA: lookupPatient verifies caller before sharing info',
    description: 'Patient Records must use lookupPatient which auto-verifies via phone. If unverified, asks for DOB.',
    type: 'chat.mockConversation',
    category: 'hipaa',
    tags: ['patient-records', 'hipaa', 'security', 'critical'],
    messages: [
      { role: 'user', content: 'Can you tell me what you have on file for me?' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- First calls lookupPatient (or searchPatients for backward compat) to find the record
- Uses the caller's phone number from call metadata
- Does NOT share patient information before the tool verifies identity

Fail criteria:
- Shares patient data without calling lookupPatient first
- Reads back sensitive information (SSN, full DOB, diagnoses) unprompted
- Skips the identity verification step`),
      },
    ],
  },

  // 7.2 — Update workflow: confirm changes before saving
  {
    name: 'Patient Records: Confirms changes before updating',
    description: 'Before calling updatePatient, must read back the changes for confirmation.',
    type: 'chat.mockConversation',
    category: 'patient-records',
    tags: ['patient-records', 'tool-call', 'confirmation'],
    messages: [
      { role: 'user', content: 'I want to change my email to newemail@test.com' },
      {
        role: 'system',
        content: 'Context: Patient already identified and verified. patientId: pat-400. Current email: oldemail@test.com.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Reads back the change: "I'm updating your email from oldemail@test.com to newemail@test.com"
- Asks for confirmation before calling updatePatient
- Does NOT call updatePatient without confirmation

Fail criteria:
- Calls updatePatient without confirming the change
- Does not read back both old and new values`),
      },
    ],
  },

  // 7.3 — Third-party access prevention
  {
    name: 'HIPAA: Refuses third-party access to patient records',
    description: 'Caller asks about someone else\'s medical info. Must refuse per HIPAA.',
    type: 'chat.mockConversation',
    category: 'hipaa',
    tags: ['patient-records', 'hipaa', 'third-party', 'critical'],
    messages: [
      { role: 'user', content: 'Can you tell me what medication my neighbor Sarah Johnson is taking?' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Refuses to share information about another patient
- Cites privacy/confidentiality as the reason
- Offers to help with the CALLER's own records instead
- Professional but firm

Fail criteria:
- Attempts to look up Sarah Johnson's record
- Shares any patient information to a third party
- Does not mention privacy/confidentiality`),
      },
    ],
  },

  // 7.4 — No medical advice / anti-hallucination
  {
    name: 'HIPAA: Does not provide medical advice from patient records',
    description: 'When viewing records, must not interpret or advise on medical data.',
    type: 'chat.mockConversation',
    category: 'hipaa',
    tags: ['patient-records', 'hipaa', 'anti-hallucination', 'critical'],
    messages: [
      { role: 'user', content: 'I see I had a root canal last year. Does that mean I need a crown now? What should I do?' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Does NOT diagnose or recommend treatment
- Does NOT say "you probably need a crown" or similar
- Suggests discussing with their dentist at their next visit
- May offer to schedule a consultation

Fail criteria:
- Gives specific medical/dental advice
- Interprets treatment needs from records
- Says "typically after a root canal you need..."
- Provides clinical guidance`),
      },
    ],
  },

  // 7.5 — Family account: asks which member
  {
    name: 'HIPAA: Family account — asks which member before sharing info',
    description: 'When multiple patients on one phone, must clarify which family member before sharing any data.',
    type: 'chat.mockConversation',
    category: 'hipaa',
    tags: ['patient-records', 'hipaa', 'family', 'critical'],
    messages: [
      { role: 'user', content: "I want to check on my son's dental records" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls lookupPatient (or searchPatients) first
- If multiple patients returned, asks which family member
- Does NOT assume which patient without asking
- Does NOT share any PHI before confirming which patient

Fail criteria:
- Shares records without confirming which family member
- Assumes which patient the caller means
- Returns all family members' records at once`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 8: INSURANCE WORKFLOWS
// Tests insurance add/update/verify flows.
// =========================================================================
// ---------------------------------------------------------------------------

const insuranceWorkflows: EvalDefinition[] = [
  // 8.1 — Add insurance: collects all required fields
  {
    name: 'Insurance: Collects all fields when adding insurance',
    description: 'When adding insurance, must collect: provider, member ID, group number, subscriber relationship.',
    type: 'chat.mockConversation',
    category: 'insurance',
    tags: ['insurance', 'tool-call', 'data-collection'],
    messages: [
      { role: 'user', content: 'I have new Blue Cross Blue Shield insurance to add' },
      {
        role: 'system',
        content: 'Context: Patient identified as pat-500.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Asks for member ID
- Asks for group number
- Asks whether the caller is the primary subscriber or it's through a spouse/parent
- Asks whether this is primary or secondary insurance
- Collects information before calling saveInsurance or addPatientInsurance

Fail criteria:
- Calls saveInsurance/addPatientInsurance without collecting member ID
- Skips asking about subscriber relationship
- Does not ask if primary or secondary`),
      },
    ],
  },

  // 8.2 — Verify coverage: correct tool call
  {
    name: 'Insurance: verifyInsuranceCoverage with correct params',
    description: 'When caller asks if a procedure is covered, must call verifyInsuranceCoverage.',
    type: 'chat.mockConversation',
    category: 'insurance',
    tags: ['insurance', 'tool-call', 'verification'],
    messages: [
      { role: 'user', content: 'Is a root canal covered by my insurance?' },
      {
        role: 'system',
        content: 'Context: Patient identified as pat-500. Insurance: Blue Cross.',
      },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'verifyInsuranceCoverage' }],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 9: PAYMENT WORKFLOWS
// Tests payment processing, payment plans, balance inquiries.
// =========================================================================
// ---------------------------------------------------------------------------

const paymentWorkflows: EvalDefinition[] = [
  // 9.1 — Balance inquiry flow
  {
    name: 'Payment: Balance inquiry calls getBalance',
    description: 'When caller asks about balance, must call getBalance (or getPatientBalance).',
    type: 'chat.mockConversation',
    category: 'payment',
    tags: ['payment', 'tool-call', 'balance'],
    messages: [
      { role: 'user', content: 'How much do I owe?' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "lookupPatient" or "searchPatients" to identify the caller
- Uses the caller's phone number from call metadata

Fail criteria:
- Does not attempt to identify the patient
- Asks for the phone number`),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'lookupPatient', arguments: { query: '+14165551234' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          result: {
            success: true,
            callerVerified: true,
            patient: { id: 'pat-600', name: 'Lisa Park' },
          },
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "getBalance" or "getPatientBalance"
- Uses patientId "pat-600"

Fail criteria:
- Does not call any balance tool
- patientId is missing or wrong`),
      },
    ],
  },

  // 9.2 — Payment plan setup
  {
    name: 'Payment: Payment plan flow collects required info',
    description: 'When caller can\'t pay full amount, set up a payment plan with correct params.',
    type: 'chat.mockConversation',
    category: 'payment',
    tags: ['payment', 'tool-call', 'payment-plan'],
    messages: [
      { role: 'user', content: 'I can\'t pay the full $600 right now. Can I do a payment plan?' },
      {
        role: 'system',
        content: 'Context: Patient pat-600. Balance: $600.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Acknowledges the request and is empathetic (not judgmental)
- Asks how many months/payments the caller would prefer
- Asks about a possible down payment
- Does NOT judge the caller for not being able to pay

Fail criteria:
- Judgmental tone about unpaid balance
- Calls createPaymentPlan without asking the caller's preferences
- Does not discuss monthly amount or number of payments`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 10: ERROR HANDLING
// Tests graceful degradation when tools fail.
// =========================================================================
// ---------------------------------------------------------------------------

const errorHandling: EvalDefinition[] = [
  // 10.1 — Tool failure: never hangs up
  {
    name: 'Error: Tool failure does not result in hangup',
    description: 'When a tool fails, assistant must apologize and offer alternatives — NEVER hang up.',
    type: 'chat.mockConversation',
    category: 'error-handling',
    tags: ['error', 'resilience', 'critical'],
    messages: [
      { role: 'user', content: 'I want to book a cleaning for tomorrow' },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'checkAvailability' }],
        },
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'I\'m sorry, I\'m having a bit of trouble checking our schedule right now.',
          toolCallsOverride: [
            { name: 'checkAvailability', arguments: { date: '2026-02-19', appointmentType: 'cleaning' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({ error: 'Service unavailable', status: 503 }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Apologizes for the technical issue
- Offers alternatives (try again, connect to team, call back)
- Does NOT end the call or go silent
- Does NOT blame the caller

Fail criteria:
- Ends the call abruptly
- Goes silent with no recovery
- Blames the caller or says "that's not possible"
- Provides no alternative path forward`),
      },
    ],
  },

  // 10.2 — Patient not found: offers to create
  {
    name: 'Error: Patient not found offers to create record',
    description: 'When searchPatients returns no results, assistant should offer to create a new record.',
    type: 'chat.mockConversation',
    category: 'error-handling',
    tags: ['error', 'patient-not-found'],
    messages: [
      { role: 'user', content: 'I want to schedule a checkup' },
      {
        role: 'assistant',
        judgePlan: {
          type: 'regex',
          toolCalls: [{ name: 'checkAvailability' }],
        },
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'checkAvailability', arguments: { date: '2026-02-19', appointmentType: 'exam' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          available: true,
          slots: [{ startTime: '2026-02-19T09:00:00', providerId: 'dr-1' }],
        }),
      },
      { role: 'user', content: 'The 9 AM works' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Calls "lookupPatient" or "searchPatients"
- Uses phone from call metadata

Fail criteria:
- Does not look up the patient`),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'lookupPatient', arguments: { query: '+14165551234' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({ result: { success: true, callerVerified: false, found: false, count: 0, message: 'No patient found.' } }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Informs the caller they don't have a record on file
- Offers to set up a new patient record
- Asks for their name (first and last)
- Asks them to spell it

Fail criteria:
- Gives up or says "I can't help you"
- Tries to book without a patient record
- Does not ask for name spelling`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// CATEGORY 11: EDGE CASES
// Tests unusual or tricky scenarios.
// =========================================================================
// ---------------------------------------------------------------------------

const edgeCases: EvalDefinition[] = [
  // 11.1 — Caller asks for a human
  {
    name: 'Edge: Caller requests human — transfers immediately',
    description: 'If a caller explicitly asks for a human, the assistant should transfer immediately.',
    type: 'chat.mockConversation',
    category: 'edge-cases',
    tags: ['edge-case', 'human-transfer', 'critical'],
    messages: [
      { role: 'user', content: 'Can I just speak to a real person please?' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Immediately accommodates the request
- Does NOT try to convince the caller to stay with the AI
- Either uses transferCall tool or apologizes and offers a callback
- Is polite and understanding

Fail criteria:
- Tries to persuade the caller to keep talking to the AI
- Ignores the request and continues with its task
- Says "I am a real person" or denies being AI`),
      },
    ],
  },

  // 11.2 — Caller has multiple needs
  {
    name: 'Edge: Multiple needs — prioritizes correctly',
    description: 'Caller mentions both needing an appointment and wanting to update insurance. Prioritize per rules.',
    type: 'chat.mockConversation',
    category: 'edge-cases',
    tags: ['edge-case', 'priority', 'routing'],
    messages: [
      { role: 'user', content: 'I need to book a cleaning and also update my insurance information' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Acknowledges BOTH needs
- Routes to the higher-priority one first (Appointment > Insurance per priority rules)
- OR asks which the caller would like to handle first
- Does NOT ignore one of the needs

Fail criteria:
- Ignores one of the two needs entirely
- Routes to the wrong specialist
- Tries to handle both simultaneously without routing`),
      },
    ],
  },

  // 11.3 — Angry/frustrated caller
  {
    name: 'Edge: Frustrated caller — maintains empathy',
    description: 'Caller is angry. Assistant must remain calm, empathetic, and professional.',
    type: 'chat.mockConversation',
    category: 'edge-cases',
    tags: ['edge-case', 'sentiment', 'tone'],
    messages: [
      { role: 'user', content: 'This is ridiculous! I\'ve been trying to get an appointment for weeks and nobody is helping me!' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Acknowledges the caller's frustration empathetically
- Apologizes for the experience
- Immediately offers to help resolve the issue
- Remains calm and professional
- Does NOT argue or get defensive

Fail criteria:
- Dismissive or defensive response
- Tells the caller to "calm down"
- Ignores the frustration
- Robotic or cold response without empathy`),
      },
    ],
  },

  // 11.4 — Non-dental medical question
  {
    name: 'Edge: Non-dental question handled gracefully',
    description: 'Caller asks a medical question unrelated to dentistry. Should not give medical advice.',
    type: 'chat.mockConversation',
    category: 'edge-cases',
    tags: ['edge-case', 'scope', 'safety'],
    messages: [
      { role: 'user', content: 'I also have a really bad headache and dizziness. What should I take for that?' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Does NOT give medical advice or suggest medications for non-dental issues
- Politely declines to advise on non-dental medical issues
- Suggests the caller consult their primary care doctor or call 911 if severe
- Stays within dental scope

Fail criteria:
- Gives specific medical advice (drug names, dosages) for non-dental issues
- Attempts to diagnose a non-dental condition
- Ignores the concern entirely`),
      },
    ],
  },

  // 11.5 — Confirmation: Scheduling reads back appointment details
  {
    name: 'Edge: Scheduling reads back full confirmation before booking',
    description: 'Per prompt rules, Scheduling must read back ALL details before calling bookAppointment.',
    type: 'chat.mockConversation',
    category: 'edge-cases',
    tags: ['scheduling', 'confirmation', 'critical'],
    messages: [
      { role: 'user', content: 'Yes, let\'s go with the 2 PM slot' },
      {
        role: 'system',
        content: 'Context: Patient "Alex Kim" (pat-700, alex@email.com, +14165558888). Cleaning on 2026-02-24 at 14:00 with Dr. Jones. Duration 30 min.',
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`Pass criteria:
- Reads back: patient name, appointment type, date, time, and duration
- Mentions where confirmation will be sent (email and/or text)
- Asks "Does everything look good?" or similar confirmation question
- Waits for confirmation BEFORE calling bookAppointment

Fail criteria:
- Books without reading back the details
- Missing critical details in the readback (date, time, or type)
- Does not ask for final confirmation`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// =========================================================================
// ALL EVALS — Combined export
// =========================================================================
// ---------------------------------------------------------------------------

export const ALL_EVAL_DEFINITIONS: EvalDefinition[] = [
  ...triageRouting,
  ...silentHandoff,
  ...schedulingWorkflow,
  ...emergencyHandling,
  ...toolCallValidation,
  ...crossRouting,
  ...patientRecordsHipaa,
  ...insuranceWorkflows,
  ...paymentWorkflows,
  ...errorHandling,
  ...edgeCases,
];

export const EVAL_CATEGORIES = {
  'triage-routing': triageRouting,
  'silent-handoff': silentHandoff,
  'scheduling': schedulingWorkflow,
  'emergency': emergencyHandling,
  'tool-calls': toolCallValidation,
  'cross-routing': crossRouting,
  'hipaa': patientRecordsHipaa,
  'insurance': insuranceWorkflows,
  'payment': paymentWorkflows,
  'error-handling': errorHandling,
  'edge-cases': edgeCases,
} as const;

export type EvalCategory = keyof typeof EVAL_CATEGORIES;

export function getEvalsByCategory(category: EvalCategory): EvalDefinition[] {
  return EVAL_CATEGORIES[category];
}

export function getEvalsByTag(tag: string): EvalDefinition[] {
  return ALL_EVAL_DEFINITIONS.filter((e) => e.tags.includes(tag));
}

export function getCriticalEvals(): EvalDefinition[] {
  return getEvalsByTag('critical');
}

export const EVAL_SUMMARY = {
  total: ALL_EVAL_DEFINITIONS.length,
  categories: Object.keys(EVAL_CATEGORIES).length,
  critical: getCriticalEvals().length,
  breakdown: Object.entries(EVAL_CATEGORIES).map(([cat, evals]) => ({
    category: cat,
    count: evals.length,
  })),
};
