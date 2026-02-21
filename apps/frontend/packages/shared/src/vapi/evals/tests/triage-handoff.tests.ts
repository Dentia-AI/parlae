/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │       ISOLATED TRIAGE HANDOFF TESTS                        │
 * │                                                             │
 * │  Tests that the Triage Receptionist:                        │
 * │  1. Correctly identifies caller intent from many phrasings  │
 * │  2. Performs a SILENT handoff (no "transfer" language)       │
 * │  3. The next assistant picks up seamlessly                  │
 * │                                                             │
 * │  Run: npx tsx run-isolated.ts triage                        │
 * └─────────────────────────────────────────────────────────────┘
 */

import { JUDGE_MODEL, JUDGE_PROVIDER } from '../eval-config';
import type { EvalDefinition, EvalMessage } from '../dental-clinic-eval-suite';

// The triage assistant always speaks first with this greeting.
// All tests must include it so we simulate the real conversation flow.
const TRIAGE_GREETING = 'Thank you for calling our dental clinic! How can I help you today?';

// ---------------------------------------------------------------------------
// How handoff validation works
// ---------------------------------------------------------------------------
//
// Vapi squads auto-generate handoff tools for each `assistantDestination`.
// The tool name follows the pattern: transferAssistant (with the destination
// as an argument) or handoff_to_<AssistantName>.
//
// Each triage test uses TWO validation steps:
//
//   Step 1 (hard check): Verifies the assistant made a tool call that
//           matches a handoff pattern. Uses `toolCalls` in judgePlan.
//
//   Step 2 (AI judge):  Verifies the response text uses natural language
//           (no "transferring"), acknowledges the caller's need, and the
//           handoff destination is correct.
//
// This two-step approach catches both:
//   - The assistant failing to initiate a handoff at all
//   - The assistant saying forbidden "transfer" language
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Judge helper
// ---------------------------------------------------------------------------

/**
 * Builds a triage test with a combined AI judge that validates BOTH:
 *   1. A handoff tool call was made to the correct destination
 *   2. The spoken response uses natural language (no "transferring" etc.)
 *
 * Vapi squads auto-generate handoff tools (transferAssistant, handoff_to_*)
 * for each `assistantDestination`. The judge checks for any of these patterns.
 */
function buildTriageTest(
  utterance: string,
  expectedDestination: string,
  name: string,
  description: string,
  extraPassCriteria = '',
  extraFailCriteria = '',
): EvalDefinition {
  const messages: EvalMessage[] = [
    { role: 'assistant', content: TRIAGE_GREETING },
    { role: 'user', content: utterance },
    {
      role: 'assistant',
      judgePlan: {
        type: 'ai',
        model: {
          provider: JUDGE_PROVIDER,
          model: JUDGE_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are an LLM-Judge. Evaluate the dental receptionist's FULL response including tool calls and spoken text.

Evaluate: {{messages[-1]}}
Full conversation: {{messages}}

Expected handoff destination: "${expectedDestination}"

CHECK 1 — TOOL CALL (most important):
- The assistant MUST have made a handoff/transfer tool call
- The tool call destination MUST match "${expectedDestination}"
- Look for tool calls named: transferAssistant, handoff_to_*, transferCall, or similar
- If NO tool call was made, this is an automatic FAIL

CHECK 2 — SPOKEN RESPONSE:
- The spoken text must NOT contain forbidden phrases: "transfer", "transferring",
  "connect you with", "connecting you to", "let me transfer", "routing you"
- Instead, must use natural language: "Let me help you with that", "Sure, let me check"
- Must acknowledge the caller's need
${extraPassCriteria ? `- ${extraPassCriteria}` : ''}

PASS if BOTH checks pass.

FAIL if:
- No handoff tool call was made (CHECK 1 failed)
- Tool call goes to wrong destination (not "${expectedDestination}")
- Spoken response contains forbidden transfer language (CHECK 2 failed)
${extraFailCriteria ? `- ${extraFailCriteria}` : ''}

Output: pass or fail`,
            },
          ],
        },
      },
    },
  ];

  return {
    name,
    description,
    type: 'chat.mockConversation',
    category: 'triage-handoff',
    tags: ['triage', 'handoff', 'isolated'],
    messages,
  };
}

// ---------------------------------------------------------------------------
// EMERGENCY ROUTING — many phrasings
// ---------------------------------------------------------------------------

const emergencyUtterances: Array<{ say: string; note: string }> = [
  { say: "I have a really bad toothache, it hurts so much I can't sleep", note: 'severe pain' },
  { say: "My tooth is killing me", note: 'colloquial pain' },
  { say: "I'm in so much pain right now", note: 'generic severe pain' },
  { say: "My gums won't stop bleeding and there's a lot of blood", note: 'bleeding' },
  { say: "There's blood coming from my mouth and it won't stop", note: 'bleeding variant' },
  { say: "My kid fell and knocked out his front tooth", note: 'knocked-out tooth' },
  { say: "I got hit in the mouth playing basketball and my tooth came out", note: 'sports trauma' },
  { say: "My face is really swollen on one side", note: 'facial swelling' },
  { say: "I think I have an abscess, my jaw is swollen and I have a fever", note: 'abscess with fever' },
  { say: "I can barely open my mouth and my face is puffed up", note: 'swelling + limited movement' },
  { say: "I was in a car accident and I think my jaw might be broken", note: 'jaw trauma' },
  { say: "My tooth cracked in half when I was eating", note: 'broken tooth' },
  { say: "I have a dental emergency", note: 'explicit emergency keyword' },
  { say: "This is urgent, I need help right now", note: 'urgency keyword' },
  { say: "I can't take the pain anymore, please help", note: 'desperation' },
  { say: "There's pus coming from my gum and it smells terrible", note: 'infection signs' },
  { say: "My filling fell out and now it's throbbing really bad", note: 'lost filling + pain' },
  { say: "I think my crown came off and there's a sharp edge cutting my tongue", note: 'lost crown' },
  { say: "I got punched in the mouth and my teeth are loose", note: 'violence trauma' },
  { say: "My child is screaming, they fell and their tooth went through their lip", note: 'child trauma' },
];

const emergencyTests: EvalDefinition[] = emergencyUtterances.map(({ say, note }, i) =>
  buildTriageTest(
    say,
    'Emergency Transfer',
    `Triage → Emergency [${i + 1}]: ${note}`,
    `Caller says: "${say}". Must route to Emergency Transfer with silent handoff.`,
    'Response shows empathy and urgency',
    'Response asks for insurance or scheduling info before addressing emergency',
  ),
);

// ---------------------------------------------------------------------------
// SCHEDULING ROUTING — many phrasings
// ---------------------------------------------------------------------------

const schedulingUtterances: Array<{ say: string; note: string }> = [
  { say: "I'd like to schedule a teeth cleaning please", note: 'cleaning' },
  { say: "I need to book an appointment", note: 'generic booking' },
  { say: "Can I make an appointment for a checkup?", note: 'checkup' },
  { say: "I want to come in for a dental exam", note: 'exam' },
  { say: "I need to schedule a filling", note: 'filling' },
  { say: "Can I get an appointment for next week?", note: 'next week' },
  { say: "I'd like to see the dentist sometime soon", note: 'vague timing' },
  { say: "Do you have any openings tomorrow?", note: 'tomorrow availability' },
  { say: "I need to cancel my appointment", note: 'cancellation' },
  { say: "I want to reschedule my appointment to a different day", note: 'reschedule' },
  { say: "When's my next appointment?", note: 'check existing' },
  { say: "Can I move my cleaning to next Friday?", note: 'specific reschedule' },
  { say: "I haven't been to the dentist in a while, I need to come in", note: 'lapsed patient' },
  { say: "My dentist told me to come back in 6 months for another cleaning", note: 'follow-up' },
  { say: "I need a root canal, can I schedule that?", note: 'root canal' },
  { say: "I want to book a consultation for veneers", note: 'cosmetic consultation' },
  { say: "Is Dr. Smith available next Tuesday?", note: 'specific provider + date' },
  { say: "I need to bring my kids in for their cleanings", note: 'family scheduling' },
  { say: "I want to get my teeth whitened, can I book that?", note: 'whitening' },
  { say: "Yeah I just need to set up a time to come in", note: 'casual booking' },
];

const schedulingTests: EvalDefinition[] = schedulingUtterances.map(({ say, note }, i) =>
  buildTriageTest(
    say,
    'Scheduling',
    `Triage → Scheduling [${i + 1}]: ${note}`,
    `Caller says: "${say}". Must route to Scheduling with silent handoff.`,
  ),
);

// ---------------------------------------------------------------------------
// INSURANCE ROUTING — many phrasings
// ---------------------------------------------------------------------------

const insuranceUtterances: Array<{ say: string; note: string }> = [
  { say: "I got new dental insurance and I want to add it to my file", note: 'add new' },
  { say: "I need to update my insurance information", note: 'update' },
  { say: "Is a root canal covered by my insurance?", note: 'coverage question' },
  { say: "Do you take Blue Cross Blue Shield?", note: 'accepted plans' },
  { say: "What insurance do you accept?", note: 'general accepted' },
  { say: "My insurance changed, I have a new card", note: 'card change' },
  { say: "Can you verify my coverage before I come in?", note: 'pre-visit verify' },
  { say: "I want to know what my copay would be", note: 'copay question' },
  { say: "Does my plan cover cleanings?", note: 'specific service coverage' },
  { say: "I'm not sure if my insurance covers dental work", note: 'general coverage' },
];

const insuranceTests: EvalDefinition[] = insuranceUtterances.map(({ say, note }, i) =>
  buildTriageTest(
    say,
    'Insurance',
    `Triage → Insurance [${i + 1}]: ${note}`,
    `Caller says: "${say}". Must route to Insurance with silent handoff.`,
  ),
);

// ---------------------------------------------------------------------------
// PAYMENT & BILLING ROUTING — many phrasings
// ---------------------------------------------------------------------------

const paymentUtterances: Array<{ say: string; note: string }> = [
  { say: "How much do I owe?", note: 'balance check' },
  { say: "I want to pay my bill", note: 'pay bill' },
  { say: "Can I set up a payment plan?", note: 'payment plan' },
  { say: "I got a bill in the mail and I have questions about it", note: 'bill questions' },
  { say: "I need to make a payment on my account", note: 'make payment' },
  { say: "What's my outstanding balance?", note: 'outstanding balance' },
  { say: "Can you send me a receipt for my last payment?", note: 'receipt request' },
  { say: "I was charged for something I don't think is right", note: 'billing dispute' },
  { say: "Do you offer financing for dental work?", note: 'financing' },
  { say: "I can't afford to pay the full amount right now", note: 'financial hardship' },
];

const paymentTests: EvalDefinition[] = paymentUtterances.map(({ say, note }, i) =>
  buildTriageTest(
    say,
    'Payment & Billing',
    `Triage → Payment [${i + 1}]: ${note}`,
    `Caller says: "${say}". Must route to Payment & Billing with silent handoff.`,
  ),
);

// ---------------------------------------------------------------------------
// PATIENT RECORDS ROUTING — many phrasings
// ---------------------------------------------------------------------------

const recordsUtterances: Array<{ say: string; note: string }> = [
  { say: "I just moved and I need to update my address", note: 'address update' },
  { say: "I need to change my phone number on file", note: 'phone update' },
  { say: "Can you update my email address?", note: 'email update' },
  { say: "I need to update my emergency contact", note: 'emergency contact' },
  { say: "I have some new allergies I need to report", note: 'allergy update' },
  { say: "I changed my name and need to update my records", note: 'name change' },
  { say: "I want to see what information you have on file for me", note: 'view records' },
  { say: "I started a new medication I want to add to my chart", note: 'medication update' },
];

const recordsTests: EvalDefinition[] = recordsUtterances.map(({ say, note }, i) =>
  buildTriageTest(
    say,
    'Patient Records',
    `Triage → Records [${i + 1}]: ${note}`,
    `Caller says: "${say}". Must route to Patient Records with silent handoff.`,
  ),
);

// ---------------------------------------------------------------------------
// CLINIC INFO ROUTING — many phrasings
// ---------------------------------------------------------------------------

const clinicInfoUtterances: Array<{ say: string; note: string }> = [
  { say: "What are your office hours?", note: 'hours' },
  { say: "Where are you located?", note: 'location' },
  { say: "Do you guys do teeth whitening?", note: 'service question' },
  { say: "What services do you offer?", note: 'general services' },
  { say: "Is there parking available?", note: 'parking' },
  { say: "Are you open on Saturdays?", note: 'weekend hours' },
  { say: "Who are your dentists?", note: 'provider list' },
  { say: "What should I bring to my first appointment?", note: 'new patient info' },
  { say: "Do you handle orthodontics?", note: 'specific service' },
  { say: "What's the cancellation policy?", note: 'policy question' },
];

const clinicInfoTests: EvalDefinition[] = clinicInfoUtterances.map(({ say, note }, i) =>
  buildTriageTest(
    say,
    'Clinic Information',
    `Triage → Clinic Info [${i + 1}]: ${note}`,
    `Caller says: "${say}". Must route to Clinic Information with silent handoff.`,
  ),
);

// ---------------------------------------------------------------------------
// PRIORITY / EDGE CASES — tricky routing decisions
// ---------------------------------------------------------------------------

const priorityTests: EvalDefinition[] = [
  buildTriageTest(
    "I need an appointment as soon as possible, my tooth is killing me and my face is swollen",
    'Emergency Transfer',
    'Triage Priority: Pain + appointment → Emergency',
    'Caller mentions both pain AND appointment. Emergency takes priority.',
    'Recognizes swelling + severe pain as EMERGENCY, not just an appointment request',
    'Routes to Scheduling instead of Emergency',
  ),
  buildTriageTest(
    "I need to book a cleaning and also update my insurance information",
    'Scheduling',
    'Triage Priority: Appointment + insurance → Scheduling first',
    'Caller wants both appointment and insurance update. Appointment has higher priority.',
    'Acknowledges both needs but prioritizes the appointment (per priority rules: Appointment > Insurance)',
  ),
  {
    name: 'Triage: Ambiguous request → asks ONE clarifying question',
    description: 'Caller says something vague. Triage should ask exactly one clarifying question.',
    type: 'chat.mockConversation',
    category: 'triage-handoff',
    tags: ['triage', 'clarification', 'handoff', 'isolated'],
    messages: [
      { role: 'assistant', content: TRIAGE_GREETING },
      { role: 'user', content: "I need some help with my account" },
      {
        role: 'assistant',
        judgePlan: {
          type: 'ai',
          model: {
            provider: JUDGE_PROVIDER,
            model: JUDGE_MODEL,
            messages: [{
              role: 'system',
              content: `Evaluate: {{messages[-1]}}

PASS if:
- Asks exactly ONE clarifying question to determine the caller's need
- The question helps distinguish between billing, insurance, records, etc.
- Does NOT route without clarifying (too ambiguous)
- Does NOT ask multiple questions at once

FAIL if:
- Routes to a specialist without any clarification
- Asks more than one question
- Says "transferring"

Output: pass or fail`,
            }],
          },
        },
      },
    ],
  },
  {
    name: 'Triage: Caller asks for a real person → accommodates immediately',
    description: 'Caller explicitly wants a human. Should not argue or try to retain.',
    type: 'chat.mockConversation',
    category: 'triage-handoff',
    tags: ['triage', 'human-transfer', 'handoff', 'isolated'],
    messages: [
      { role: 'assistant', content: TRIAGE_GREETING },
      { role: 'user', content: "Can I just speak to a real person please?" },
      {
        role: 'assistant',
        judgePlan: {
          type: 'ai',
          model: {
            provider: JUDGE_PROVIDER,
            model: JUDGE_MODEL,
            messages: [{
              role: 'system',
              content: `Evaluate: {{messages[-1]}}

PASS if:
- Immediately accommodates the request to speak with a human
- Does NOT try to convince the caller to stay with the AI
- Is polite and understanding
- Initiates a transfer/handoff or offers to have someone call back

FAIL if:
- Tries to persuade the caller to keep talking to the AI
- Ignores the request
- Says "I am a real person"

Output: pass or fail`,
            }],
          },
        },
      },
    ],
  },
  buildTriageTest(
    "This is ridiculous! I've been trying to get an appointment for weeks and nobody is helping me!",
    'Scheduling',
    'Triage: Frustrated caller → empathetic + still routes correctly',
    'Angry caller wanting an appointment. Must stay empathetic AND route correctly.',
    'Shows empathy — acknowledges frustration and apologizes',
    'Is dismissive, defensive, or tells the caller to calm down',
  ),
  buildTriageTest(
    "Hello, I want... appointment... teeth clean please",
    'Scheduling',
    'Triage: Non-English speaker → still routes correctly',
    'Caller uses simple/broken English. Triage should still identify intent.',
  ),
  buildTriageTest(
    "I was calling about my bill but actually, you know what, I need to schedule a cleaning",
    'Scheduling',
    'Triage: Topic change mid-sentence → follows the final intent',
    'Caller starts with one thing then changes topic. Should follow the last stated intent.',
  ),
];

// ---------------------------------------------------------------------------
// STRICT SILENT HANDOFF — assistant must say NOTHING before handing off
// ---------------------------------------------------------------------------
//
// These tests enforce the ideal behavior: the triage receptionist identifies
// the intent and calls the handoff tool WITHOUT any spoken response.
//
// The current prompt says things like "Let me find the available times" or
// "Sure, let me check on that" before handing off. That creates an awkward
// experience because the next assistant then re-greets or repeats context.
//
// EXPECTED: The assistant ONLY calls the handoff tool. The spoken response
// should be empty, a single space, or at most 1-2 words (e.g., "Sure.").
//
// These tests are DESIGNED TO FAIL with the current prompt so you can verify
// your prompt changes fix the issue.
// ---------------------------------------------------------------------------

const silentHandoffUtterances: Array<{ say: string; dest: string; note: string }> = [
  // Scheduling — these are the ones that currently say "let me find the available times"
  { say: "I need to schedule a cleaning", dest: 'Scheduling', note: 'cleaning request' },
  { say: "Can I book an appointment for next week?", dest: 'Scheduling', note: 'generic booking' },
  { say: "I want to reschedule my appointment", dest: 'Scheduling', note: 'reschedule' },
  { say: "I need to cancel my appointment tomorrow", dest: 'Scheduling', note: 'cancel' },
  { say: "Do you have anything available this Friday?", dest: 'Scheduling', note: 'availability check' },
  { say: "I need a root canal appointment as soon as possible", dest: 'Scheduling', note: 'urgent procedure' },

  // Emergency
  { say: "My tooth is killing me, I need help now", dest: 'Emergency Transfer', note: 'severe pain' },
  { say: "My child knocked out a tooth and it's bleeding", dest: 'Emergency Transfer', note: 'child trauma' },
  { say: "I think I have an abscess, my face is really swollen", dest: 'Emergency Transfer', note: 'abscess' },

  // Insurance
  { say: "I want to check what insurance you have on file for me", dest: 'Insurance', note: 'check insurance' },
  { say: "I got new insurance and need to update it", dest: 'Insurance', note: 'update insurance' },
  { say: "Is my cleaning covered by my plan?", dest: 'Insurance', note: 'coverage question' },

  // Payment
  { say: "I need to pay my bill", dest: 'Payment & Billing', note: 'pay bill' },
  { say: "How much do I owe?", dest: 'Payment & Billing', note: 'balance inquiry' },
  { say: "Can I set up a payment plan?", dest: 'Payment & Billing', note: 'payment plan' },

  // Records
  { say: "I need to update my phone number", dest: 'Patient Records', note: 'update contact' },
  { say: "Can you tell me what you have on file for me?", dest: 'Patient Records', note: 'view record' },

  // Clinic info
  { say: "What time do you close today?", dest: 'Clinic Information', note: 'hours' },
  { say: "Where is your office located?", dest: 'Clinic Information', note: 'location' },
];

const silentHandoffTests: EvalDefinition[] = silentHandoffUtterances.map(({ say, dest, note }, i) => ({
  name: `Silent Handoff [${i + 1}]: ${note} → ${dest}`,
  description: `Caller says: "${say}". Triage must hand off to ${dest} with ZERO spoken words. Designed to fail with current prompt.`,
  type: 'chat.mockConversation' as const,
  category: 'triage-handoff',
  tags: ['triage', 'silent-handoff', 'strict', 'isolated'],
  messages: [
    { role: 'assistant' as const, content: TRIAGE_GREETING },
    { role: 'user' as const, content: say },
    {
      role: 'assistant' as const,
      judgePlan: {
        type: 'ai' as const,
        model: {
          provider: JUDGE_PROVIDER,
          model: JUDGE_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are an EXTREMELY STRICT LLM-Judge evaluating silent handoff behavior.

Evaluate: {{messages[-1]}}
Full conversation: {{messages}}

Expected handoff destination: "${dest}"

STRICT RULES — PASS ONLY if ALL are true:

1. TOOL CALL: The assistant made a handoff tool call to "${dest}"
   (transferAssistant, handoff_to_*, or similar)

2. ZERO SPOKEN TEXT: The assistant's spoken/text response is EMPTY or
   contains ONLY whitespace. The assistant must NOT say anything at all.
   No "let me check", no "sure", no "one moment", no acknowledgment.
   NOTHING. Just the silent tool call.

   The ONLY acceptable spoken responses are:
   - Empty string ""
   - A single space " "
   - No spoken content at all (only a tool call)

FAIL if ANY of these are true:
- The assistant spoke ANY words before or alongside the handoff
  (e.g., "Let me find the available times", "Sure, let me check",
   "Let me help you with that", "One moment", "Absolutely")
- No handoff tool call was made
- Handoff goes to wrong destination
- The spoken response contains more than 2 words

This is an extremely strict test. Even a polite phrase like "Sure!" is a FAIL.
The handoff must be completely silent.

Output: pass or fail`,
            },
          ],
        },
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export const ALL_TRIAGE_TESTS: EvalDefinition[] = [
  ...emergencyTests,
  ...schedulingTests,
  ...insuranceTests,
  ...paymentTests,
  ...recordsTests,
  ...clinicInfoTests,
  ...priorityTests,
  ...silentHandoffTests,
];

export const TRIAGE_TEST_GROUPS = {
  emergency: emergencyTests,
  scheduling: schedulingTests,
  insurance: insuranceTests,
  payment: paymentTests,
  records: recordsTests,
  clinicInfo: clinicInfoTests,
  priority: priorityTests,
  silentHandoff: silentHandoffTests,
} as const;

export type TriageTestGroup = keyof typeof TRIAGE_TEST_GROUPS;

export const TRIAGE_SUMMARY = {
  total: ALL_TRIAGE_TESTS.length,
  groups: Object.entries(TRIAGE_TEST_GROUPS).map(([group, tests]) => ({
    group,
    count: tests.length,
  })),
};
