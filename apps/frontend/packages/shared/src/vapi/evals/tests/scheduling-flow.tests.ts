/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │       ISOLATED SCHEDULING FLOW TESTS                       │
 * │                                                             │
 * │  Tests that the Scheduling assistant:                       │
 * │  1. Takes over seamlessly after handoff (no re-greeting)    │
 * │  2. Calls the right tools in the right order                │
 * │  3. After tool responses, CONTINUES immediately             │
 * │     (no dead air / waiting for user to say "ok")            │
 * │  4. Collects all required info before booking               │
 * │                                                             │
 * │  Run: npx tsx run-isolated.ts scheduling                    │
 * └─────────────────────────────────────────────────────────────┘
 */

import { JUDGE_MODEL, JUDGE_PROVIDER } from '../eval-config';
import type { EvalDefinition, EvalJudgePlan } from '../dental-clinic-eval-suite';

// ---------------------------------------------------------------------------
// Judge helpers
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
          content: `You are an LLM-Judge evaluating a dental clinic scheduling assistant.

Evaluate the assistant's response: {{messages[-1]}}
Full conversation: {{messages}}

${criteria}

Output format: respond with exactly one word: pass or fail`,
        },
      ],
    },
  };
}

function toolCallJudge(toolName: string): EvalJudgePlan {
  return { type: 'regex', toolCalls: [{ name: toolName }] };
}

// ---------------------------------------------------------------------------
// Triage handoff prefix — realistic conversation start
// ---------------------------------------------------------------------------
//
// In production, every scheduling interaction is preceded by the caller
// speaking to the Triage Receptionist, who then silently hands off.
// These prefix messages simulate that flow so every scheduling test
// sees the same conversation history the assistant would see in the
// real world.
// ---------------------------------------------------------------------------

type EvalMessage = import('../dental-clinic-eval-suite').EvalMessage;

function triageHandoffPrefix(
  callerUtterance: string,
  triageResponse = 'Sure, let me help you with that right away.',
): EvalMessage[] {
  return [
    { role: 'user', content: callerUtterance },
    {
      role: 'assistant',
      judgePlan: toolCallJudge('transferAssistant'),
      continuePlan: {
        exitOnFailureEnabled: false,
        contentOverride: triageResponse,
        toolCallsOverride: [
          { name: 'transferAssistant', arguments: { assistantName: 'Scheduling' } },
        ],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// CATEGORY A: Seamless takeover after handoff
// The Scheduling assistant must NOT greet, introduce itself, or say "hello"
// after receiving a silent handoff from Triage.
// ---------------------------------------------------------------------------

const seamlessTakeover: EvalDefinition[] = [
  {
    name: 'Sched Takeover [1]: No greeting — cleaning request',
    description: 'After handoff, Scheduling immediately addresses the cleaning request without greeting.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'handoff', 'takeover', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I want to schedule a cleaning for next week", "Sure, let me look at the schedule for you."),
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if ALL:
- Response does NOT contain greetings: "Hello", "Hi", "Hey", "Welcome", "How can I help", "Good morning/afternoon"
- Response does NOT introduce itself: "I'm the scheduling...", "This is...", "My name is..."
- Response immediately addresses the scheduling request (checking availability or asking about preferred day/time)
- Calls checkAvailability tool OR asks a focused follow-up about timing

FAIL if:
- Contains any greeting or self-introduction
- Does not address the scheduling request
- Says "transferring"`),
      },
    ],
  },
  {
    name: 'Sched Takeover [2]: No greeting — exam request',
    description: 'After handoff, immediately handles exam booking without re-greeting.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'handoff', 'takeover', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I need to come in for a dental exam", "Of course, let me check on that for you."),
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- No greeting or self-introduction
- Immediately asks about preferred date/time OR calls checkAvailability
- Treats the conversation as continuous (the caller already stated their need)

FAIL if:
- Contains greeting ("Hello", "Hi", "How can I help")
- Re-asks what they need ("What can I help you with?")`),
      },
    ],
  },
  {
    name: 'Sched Takeover [3]: No greeting — cancellation',
    description: 'After handoff for cancellation, immediately starts patient lookup.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'handoff', 'takeover', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I need to cancel my appointment", "Of course, let me pull that up for you."),
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- No greeting
- Immediately calls searchPatients to find the caller's record
- Continues naturally as if the conversation was ongoing

FAIL if:
- Greets the caller
- Asks "how can I help" (the caller already stated their need)`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY B: Correct tool call order
// checkAvailability FIRST → then searchPatients → then book
// ---------------------------------------------------------------------------

const toolCallOrder: EvalDefinition[] = [
  {
    name: 'Sched Order [1]: checkAvailability called FIRST for booking',
    description: 'When booking, availability must be checked BEFORE patient lookup.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'order', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to book a cleaning for tomorrow", "Sure, let me look at the schedule."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('checkAvailability'),
        continuePlan: { exitOnFailureEnabled: true },
      },
    ],
  },
  {
    name: 'Sched Order [2]: checkAvailability with correct date format',
    description: 'Date must be YYYY-MM-DD format, year 2026+.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'params', 'isolated'],
    messages: [
      ...triageHandoffPrefix("Can I get an appointment for today?"),
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "checkAvailability" tool
- The "date" parameter is in YYYY-MM-DD format
- The year is 2026 or later (NEVER 2023, 2024, or 2025)
- appointmentType is included

FAIL if:
- Date uses wrong format
- Year is 2023, 2024, or 2025
- checkAvailability is not called`),
        continuePlan: { exitOnFailureEnabled: true },
      },
    ],
  },
  {
    name: 'Sched Order [3]: searchPatients AFTER time is chosen (not before)',
    description: 'Patient lookup happens AFTER the caller picks a time, not before.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'order', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I want a cleaning next Monday", "Sure, let me check on that for you."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('checkAvailability'),
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: 'I have openings at 9 AM, 11 AM, and 2 PM on Monday. Which works for you?',
          toolCallsOverride: [
            { name: 'checkAvailability', arguments: { date: '2026-02-23', appointmentType: 'cleaning' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          available: true,
          slots: [
            { startTime: '2026-02-23T09:00:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-23T11:00:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-23T14:00:00', providerId: 'dr-2', providerName: 'Dr. Jones' },
          ],
        }),
      },
      { role: 'user', content: "The 2 PM works" },
      {
        role: 'assistant',
        judgePlan: toolCallJudge('searchPatients'),
      },
    ],
  },
  {
    name: 'Sched Order [4]: For cancellation, searchPatients is called FIRST',
    description: 'Cancellation flow starts with patient lookup (not availability check).',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'order', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I need to cancel my upcoming appointment", "Of course, let me pull that up for you."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('searchPatients'),
      },
    ],
  },
  {
    name: 'Sched Order [5]: For reschedule, finds existing appointment first',
    description: 'Reschedule flow: searchPatients → getAppointments → checkAvailability.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'order', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I need to reschedule my appointment to next Friday", "Sure, let me check on that for you."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('searchPatients'),
        continuePlan: { exitOnFailureEnabled: true },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY C: Continuation after tool calls — NO dead air
// After EVERY tool response, the assistant must immediately continue.
// It must NOT make a statement and then go silent waiting for the caller.
// ---------------------------------------------------------------------------

const continuationAfterTools: EvalDefinition[] = [
  {
    name: 'Sched Continue [1]: After checkAvailability → presents slots + asks',
    description: 'After availability returns, must present slots AND ask which one the caller wants.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'continuation', 'no-dead-air', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I want to book a cleaning", "Sure, let me look at the schedule."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('checkAvailability'),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'checkAvailability', arguments: { date: '2026-02-19', appointmentType: 'cleaning' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          available: true,
          slots: [
            { startTime: '2026-02-19T10:00:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-19T14:30:00', providerId: 'dr-2', providerName: 'Dr. Jones' },
          ],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Presents the available time slots to the caller (mentions the times)
- ASKS which slot the caller prefers ("Which works for you?", "Would either of those work?", etc.)
- Response ends with a QUESTION, not just a statement

FAIL if:
- Just says "I found some openings" without listing them
- Lists the slots but does NOT ask the caller to pick one
- Response is a statement with no question (dead air)
- Waits silently for the caller to speak first`),
      },
    ],
  },
  {
    name: 'Sched Continue [2]: After createPatient → immediately proceeds to book',
    description: 'After creating a patient, must immediately proceed to bookAppointment without waiting.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'continuation', 'no-dead-air', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I'd like to book a cleaning appointment"),
      {
        role: 'system',
        content: 'Context: New patient. Name collected: Jane Doe. Phone: +14165551234. Caller picked the 2 PM cleaning slot on 2026-02-23 with Dr. Jones. The assistant is about to create the patient record.',
      },
      { role: 'user', content: "My email is jane at example dot com, J-A-N-E at example dot com" },
      {
        role: 'assistant',
        judgePlan: toolCallJudge('createPatient'),
        continuePlan: {
          exitOnFailureEnabled: false,
          contentOverride: "Great, you're all set up. Let me book that appointment for you.",
          toolCallsOverride: [
            {
              name: 'createPatient',
              arguments: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '+14165551234' },
            },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({ patientId: 'pat-new-001', firstName: 'Jane', lastName: 'Doe' }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- IMMEDIATELY proceeds to book the appointment (calls bookAppointment OR confirms details before booking)
- Does NOT say "I've created your profile" and then go SILENT
- Does NOT wait for the caller to acknowledge before continuing
- Continues the conversation flow without pause

FAIL if:
- Says something like "Your profile has been created." and then stops talking
- Waits for the caller to say "ok" or "great" before continuing
- Does not proceed to booking or confirmation`),
      },
    ],
  },
  {
    name: 'Sched Continue [3]: After bookAppointment → confirms + asks if anything else',
    description: 'After successful booking, must confirm details AND ask if caller needs anything else.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'continuation', 'no-dead-air', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I need to schedule an appointment"),
      {
        role: 'system',
        content: 'Context: Patient pat-100 (John Smith, john@email.com, +14165551234). Booking cleaning on 2026-02-23 at 14:00 with Dr. Jones.',
      },
      { role: 'user', content: "Yes, that looks good, go ahead and book it" },
      {
        role: 'assistant',
        judgePlan: toolCallJudge('bookAppointment'),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            {
              name: 'bookAppointment',
              arguments: {
                patientId: 'pat-100',
                firstName: 'John',
                lastName: 'Smith',
                email: 'john@email.com',
                phone: '+14165551234',
                appointmentType: 'cleaning',
                startTime: '2026-02-23T14:00:00',
                duration: 30,
              },
            },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({ success: true, appointmentId: 'apt-500', confirmationSent: true }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Confirms the appointment details (type, date, time)
- Mentions confirmation will be sent (email/text)
- Asks if the caller needs anything else ("Is there anything else I can help with?")
- Response ends with a question

FAIL if:
- Just says "Your appointment is booked" with no details
- Does not ask if the caller needs anything else
- Goes silent after confirming`),
      },
    ],
  },
  {
    name: 'Sched Continue [4]: After searchPatients (found) → confirms identity + continues',
    description: 'When patient is found, must confirm identity and immediately continue.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'continuation', 'no-dead-air', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I want to cancel my appointment", "Of course, let me pull that up for you."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('searchPatients'),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'searchPatients', arguments: { query: '+14165551234' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          patients: [{ patientId: 'pat-200', firstName: 'Sarah', lastName: 'Lee', email: 'sarah@email.com' }],
          total: 1,
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Confirms identity ("I see a record for Sarah Lee, is that you?" or similar)
- IMMEDIATELY follows up with looking up appointments (calls getAppointments) OR asks about which appointment
- Does NOT just say "I found your record" and go silent

FAIL if:
- Says "Found your record" without confirming name
- Goes silent after confirming identity
- Does not proceed to look up appointments`),
      },
    ],
  },
  {
    name: 'Sched Continue [5]: After searchPatients (NOT found) → offers to create',
    description: 'When patient not found, must inform and start collecting info for new record.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'continuation', 'patient-not-found', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to schedule a cleaning", "Sure, let me look at the schedule."),
      {
        role: 'system',
        content: 'Context: Caller picked 10 AM cleaning on 2026-02-19. Now looking up patient.',
      },
      { role: 'user', content: "The 10 AM slot works for me" },
      {
        role: 'assistant',
        judgePlan: toolCallJudge('searchPatients'),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'searchPatients', arguments: { query: '+14165551234' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({ patients: [], total: 0 }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Informs the caller they don't have a record on file
- Immediately asks for their name (first and last)
- Asks them to SPELL their name
- Keeps the conversation moving (no dead air)

FAIL if:
- Gives up or says "I can't help you"
- Does not ask for the name
- Does not ask for spelling
- Goes silent`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY D: Required field collection — email is MANDATORY
// ---------------------------------------------------------------------------

const requiredFields: EvalDefinition[] = [
  {
    name: 'Sched Fields [1]: Asks for email before createPatient',
    description: 'Must collect email BEFORE calling createPatient — it is required.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'required-fields', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I need to book an appointment"),
      {
        role: 'system',
        content: 'Context: New patient. searchPatients returned no results. Name collected but NO email yet.',
      },
      { role: 'user', content: "My name is Bob Lee, B-O-B L-E-E" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Asks for the caller's EMAIL address
- Does NOT call createPatient yet (email has not been collected)
- May also confirm phone number

FAIL if:
- Calls createPatient without email
- Skips email collection
- Proceeds to booking without creating patient`),
      },
    ],
  },
  {
    name: 'Sched Fields [2]: Asks caller to spell their name',
    description: 'For new patients, must ask them to spell their name (names are easily misheard on phone).',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'required-fields', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to schedule an appointment"),
      {
        role: 'system',
        content: 'Context: New patient. searchPatients returned no results. Assistant needs to collect name.',
      },
      { role: 'user', content: "My name is Priya Chakraborty" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Asks the caller to SPELL their name (first and/or last)
- This is mandatory — names are easily misheard on phone calls

FAIL if:
- Does not ask for spelling
- Proceeds to create patient without confirming spelling`),
      },
    ],
  },
  {
    name: 'Sched Fields [3]: Asks caller to spell their email',
    description: 'Must ask caller to spell/confirm their email address.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'required-fields', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to book an appointment"),
      {
        role: 'system',
        content: 'Context: New patient "Priya Chakraborty". Name spelled out. Now collecting email.',
      },
      { role: 'user', content: "My email is priya at chakraborty dot com" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Asks the caller to spell the email OR reads it back for confirmation
- Email addresses are easily misheard on phone calls

FAIL if:
- Accepts the email without any confirmation or spelling request
- Immediately calls createPatient without verifying email`),
      },
    ],
  },
  {
    name: 'Sched Fields [4]: bookAppointment includes all 8 required params',
    description: 'bookAppointment must include: patientId, appointmentType, startTime, duration, firstName, lastName, email, phone.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'required-fields', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I need to book a cleaning", "Sure, let me look at the schedule."),
      {
        role: 'system',
        content: 'Context: Existing patient "Jane Doe" (pat-501, jane@email.com, +14165559999). Cleaning on 2026-02-23 at 14:00 with Dr. Jones (dr-jones-2). Duration 30 min. All info confirmed.',
      },
      { role: 'user', content: "Yes, book it" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "bookAppointment" tool
- Includes ALL of these parameters: patientId, appointmentType, startTime, duration, firstName, lastName, email, phone
- startTime is ISO 8601 format
- appointmentType is "cleaning"

FAIL if:
- Missing ANY required parameter (especially email, phone, firstName, lastName)
- Does not call bookAppointment`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY E: Confirmation readback before booking
// ---------------------------------------------------------------------------

const confirmationReadback: EvalDefinition[] = [
  {
    name: 'Sched Confirm [1]: Reads back all details before booking',
    description: 'Must read back name, type, date, time before calling bookAppointment.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'confirmation', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to schedule a cleaning", "Sure, let me look at the schedule for you."),
      {
        role: 'system',
        content: 'Context: Existing patient "Alex Kim" (pat-700). Cleaning on Monday 2026-02-23 at 14:00 with Dr. Jones. Duration 30 min.',
      },
      { role: 'user', content: "Let's go with the 2 PM on Monday" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Reads back the appointment details: patient name, type (cleaning), date (Monday), time (2 PM)
- Mentions where the confirmation will be sent (email/text)
- Asks for final confirmation ("Does that look right?", "Shall I go ahead?")
- Does NOT call bookAppointment without asking for confirmation first

FAIL if:
- Books without reading back details
- Missing key details (date, time, or type)
- Does not ask for confirmation`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY F: Error handling and resilience
// ---------------------------------------------------------------------------

const errorHandling: EvalDefinition[] = [
  {
    name: 'Sched Error [1]: Tool failure → offers alternatives (no hangup)',
    description: 'When checkAvailability fails, must apologize and offer alternatives.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'error-handling', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I want to book a cleaning for tomorrow", "Sure, let me look at the schedule."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('checkAvailability'),
        continuePlan: {
          exitOnFailureEnabled: false,
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
        judgePlan: aiJudge(`PASS if:
- Apologizes for the technical issue
- Offers alternatives: try again, connect to team, take info and call back
- Does NOT end the call abruptly
- Does NOT blame the caller
- Keeps tone professional and helpful

FAIL if:
- Hangs up or goes silent
- Says "that's not possible" without offering alternatives
- Blames the caller`),
      },
    ],
  },
  {
    name: 'Sched Error [2]: Date fully booked → presents nearest slots',
    description: 'When requested date is full, system returns nearest slots. Must present them.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'error-handling', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I want a cleaning this Wednesday", "Sure, let me check on that for you."),
      {
        role: 'assistant',
        judgePlan: toolCallJudge('checkAvailability'),
        continuePlan: {
          exitOnFailureEnabled: false,
          toolCallsOverride: [
            { name: 'checkAvailability', arguments: { date: '2026-02-18', appointmentType: 'cleaning' } },
          ],
        },
      },
      {
        role: 'tool',
        content: JSON.stringify({
          available: false,
          message: 'No slots available on requested date. Nearest available slots returned.',
          nearestSlots: [
            { startTime: '2026-02-20T09:00:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
            { startTime: '2026-02-20T15:00:00', providerId: 'dr-2', providerName: 'Dr. Jones' },
            { startTime: '2026-02-24T10:00:00', providerId: 'dr-1', providerName: 'Dr. Smith' },
          ],
        }),
      },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Informs the caller that Wednesday is fully booked
- Presents the nearest available alternatives
- Asks if any of the alternatives work
- Does NOT call checkAvailability again (system already returned nearest slots)

FAIL if:
- Does not inform about Wednesday being full
- Does not present alternatives
- Calls checkAvailability again unnecessarily
- Goes silent`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY G: Cross-routing from Scheduling
// When callers bring up non-scheduling topics mid-conversation.
// ---------------------------------------------------------------------------

const crossRouting: EvalDefinition[] = [
  {
    name: 'Sched Cross-route [1]: Insurance question → routes to Insurance',
    description: 'If caller asks about coverage during scheduling, route to Insurance.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'routing', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to schedule a cleaning", "Sure, let me look at the schedule."),
      { role: 'user', content: "Wait, before I book — is this cleaning covered by my insurance?" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Routes to "Insurance" (handoff tool call initiated)
- Uses natural transition language
- Does NOT try to answer the insurance question itself (Scheduling has no insurance tools)

FAIL if:
- Tries to answer the insurance question
- Routes to wrong specialist
- Says "transferring"`),
      },
    ],
  },
  {
    name: 'Sched Cross-route [2]: Emergency symptoms → routes to Emergency',
    description: 'If caller mentions emergency symptoms mid-scheduling, route to Emergency.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'routing', 'emergency', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I'd like to book an appointment"),
      { role: 'user', content: "Actually, my tooth just started bleeding really bad. I think it's an emergency" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- IMMEDIATELY routes to "Emergency Transfer"
- Drops the scheduling task
- Shows urgency and empathy

FAIL if:
- Continues with scheduling
- Routes to wrong specialist
- Ignores the emergency`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORY H: Tool call parameter validation
// Verifies exact parameter names, types, and formats for each tool.
// ---------------------------------------------------------------------------

const paramValidation: EvalDefinition[] = [
  {
    name: 'Sched Params [1]: checkAvailability — date YYYY-MM-DD + appointmentType',
    description: 'checkAvailability must have "date" in YYYY-MM-DD and "appointmentType".',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'params', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I want to come in for a teeth whitening next Thursday", "Sure, let me check on that for you."),
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if the assistant calls "checkAvailability" with EXACTLY these params:
- "date": string in YYYY-MM-DD format (must be a Thursday in 2026, NOT 2024/2025)
- "appointmentType": must be "whitening" or "teeth-whitening" (matches caller's request)

Check the tool call arguments in the message. Both params must be present.

FAIL if:
- Missing "date" or "appointmentType" parameter
- Date is not YYYY-MM-DD format
- Date year is 2024 or 2025
- appointmentType doesn't match a whitening procedure
- checkAvailability not called at all`),
      },
    ],
  },
  {
    name: 'Sched Params [2]: searchPatients — uses phone number from caller ID',
    description: 'searchPatients query should use the caller phone number (available via metadata).',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'params', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I need to cancel my appointment", "Of course, let me pull that up for you."),
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "searchPatients" tool
- The "query" parameter contains a phone number OR asks the caller for identifying info first

FAIL if:
- Does not call searchPatients
- Calls a different tool first (like getAppointments without patient ID)`),
      },
    ],
  },
  {
    name: 'Sched Params [3]: createPatient — all 4 required params present',
    description: 'createPatient needs: firstName, lastName, email, phone. All must be present.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'params', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I'd like to book a cleaning"),
      {
        role: 'system',
        content: 'Context: New patient. Name: Priya Chakraborty (spelled out). Phone: +14165551234. Email just provided and confirmed. Caller picked a cleaning slot on 2026-02-23 at 10:00.',
      },
      { role: 'user', content: "Yes that's right, priya at chakraborty dot com. P-R-I-Y-A at C-H-A-K-R-A-B-O-R-T-Y dot com" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if the assistant calls "createPatient" with ALL these required params:
- "firstName": "Priya" (string)
- "lastName": "Chakraborty" (string)
- "email": "priya@chakraborty.com" (properly formatted email, NOT "priya at chakraborty dot com")
- "phone": a phone number string (E.164 or standard format)

ALL FOUR must be present. Check the actual tool call arguments.

FAIL if:
- Missing ANY of the 4 required params
- Email is still in spoken format ("at", "dot") instead of standard email format
- createPatient not called
- firstName or lastName is misspelled (given caller spelled them out)`),
      },
    ],
  },
  {
    name: 'Sched Params [4]: bookAppointment — all 8 required params with correct formats',
    description: 'bookAppointment must include all params with ISO 8601 time format.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'params', 'isolated', 'critical'],
    messages: [
      ...triageHandoffPrefix("I need to schedule a consultation"),
      {
        role: 'system',
        content: 'Context: Patient "Emily Chen" (pat-321, emily.chen@email.com, +14165554321). Booking consultation on 2026-02-25 at 09:00 with Dr. Smith (dr-smith-1). Duration 60 min. Confirmation given.',
      },
      { role: 'user', content: "Yes, go ahead and book it" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if the assistant calls "bookAppointment" with ALL these params:
- "patientId": "pat-321"
- "appointmentType": "consultation"
- "startTime": ISO 8601 format (must include "2026-02-25" and "09:00")
- "duration": 60 (number, minutes)
- "firstName": "Emily"
- "lastName": "Chen"
- "email": "emily.chen@email.com"
- "phone": "+14165554321"

Check the actual tool call arguments — all 8 must be present with correct values.

FAIL if:
- Missing ANY of the 8 params
- startTime is not ISO 8601 format
- Duration is not a number
- Any value doesn't match the context provided
- bookAppointment not called`),
      },
    ],
  },
  {
    name: 'Sched Params [5]: cancelAppointment — needs appointmentId + patientId',
    description: 'Cancel tool must have both appointmentId and patientId.',
    type: 'chat.mockConversation',
    category: 'scheduling-flow',
    tags: ['scheduling', 'tool-call', 'params', 'isolated'],
    messages: [
      ...triageHandoffPrefix("I need to cancel my appointment", "Of course, let me pull that up for you."),
      {
        role: 'system',
        content: 'Context: Patient "Alex Kim" (pat-700). Appointment apt-888 on 2026-02-20 at 11:00 cleaning. Caller confirmed cancellation.',
      },
      { role: 'user', content: "Yes, cancel that one" },
      {
        role: 'assistant',
        judgePlan: aiJudge(`PASS if:
- Calls "cancelAppointment" tool
- Includes "appointmentId": "apt-888"
- Includes "patientId": "pat-700"
- Both params must be present

FAIL if:
- Missing appointmentId or patientId
- cancelAppointment not called
- Wrong IDs`),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export const ALL_SCHEDULING_TESTS: EvalDefinition[] = [
  ...seamlessTakeover,
  ...toolCallOrder,
  ...continuationAfterTools,
  ...requiredFields,
  ...confirmationReadback,
  ...errorHandling,
  ...crossRouting,
  ...paramValidation,
];

export const SCHEDULING_TEST_GROUPS = {
  takeover: seamlessTakeover,
  toolOrder: toolCallOrder,
  continuation: continuationAfterTools,
  requiredFields,
  confirmation: confirmationReadback,
  errorHandling,
  crossRouting,
  paramValidation,
} as const;

export type SchedulingTestGroup = keyof typeof SCHEDULING_TEST_GROUPS;

export const SCHEDULING_SUMMARY = {
  total: ALL_SCHEDULING_TESTS.length,
  groups: Object.entries(SCHEDULING_TEST_GROUPS).map(([group, tests]) => ({
    group,
    count: tests.length,
  })),
};
