/**
 * Dental Clinic Conversation Flow Template
 *
 * Builds a single Retell conversation flow that handles the full dental clinic:
 *   Receptionist -> Booking, Appt Mgmt, Patient Records, Insurance, Emergency, FAQ
 *
 * Uses dedicated short node-specific prompts (flow-prompts.ts), NOT the
 * single-prompt agent templates. Routing is handled by edges, shared state
 * by dynamic variables, and global rules by the flow's global_prompt.
 *
 * The flow deploys as ONE agent with instant node transitions.
 */

import {
  FLOW_RECEPTIONIST_PROMPT,
  FLOW_BOOKING_PROMPT,
  FLOW_APPT_MGMT_PROMPT,
  FLOW_PATIENT_RECORDS_PROMPT,
  FLOW_INSURANCE_BILLING_PROMPT,
  FLOW_EMERGENCY_PROMPT,
  FLOW_FAQ_PROMPT,
  FLOW_TAKE_MESSAGE_PROMPT,
} from './flow-prompts';

import type {
  ConversationFlowConfig,
  ConversationFlowNode,
  ConversationFlowTool,
  ConversationFlowEdge,
  ConversationFlowConversationNode,
  RetellCustomTool,
} from '../../retell.service';

import {
  retellGetProvidersTool,
  retellGetCallerContextTool,
  retellLookupPatientTool,
  retellCreatePatientTool,
  retellCheckAvailabilityTool,
  retellBookAppointmentTool,
  retellGetAppointmentsTool,
  retellRescheduleAppointmentTool,
  retellCancelAppointmentTool,
  retellUpdatePatientTool,
  retellAddNoteTool,
  retellGetInsuranceTool,
  retellVerifyInsuranceCoverageTool,
  retellGetBalanceTool,
  retellProcessPaymentTool,
  retellTakeMessageTool,
} from '../../retell-pms-tools.config';

// ---------------------------------------------------------------------------
// Flow version
// ---------------------------------------------------------------------------

export const CONVERSATION_FLOW_VERSION = 'cf-v1.16';

// ---------------------------------------------------------------------------
// Config interface for building the flow
// ---------------------------------------------------------------------------

export interface ConversationFlowBuildConfig {
  clinicName: string;
  clinicPhone?: string;
  webhookUrl: string;
  webhookSecret: string;
  accountId: string;
  knowledgeBaseIds?: string[];
}

// ---------------------------------------------------------------------------
// Placeholder hydration (lightweight, no server-only deps)
// ---------------------------------------------------------------------------

function hydratePrompt(text: string, clinicName: string): string {
  return text.replace(/\{\{clinicName\}\}/g, clinicName);
}

/**
 * Normalize a phone number to E.164 format.
 * Handles: 5858578357, +5858578357, 15858578357, +15858578357, (585) 857-8357
 * Returns null if the number can't be normalized.
 */
function normalizeToE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');

  // 10-digit North American: assume +1
  if (digits.length === 10) return `+1${digits}`;

  // 11-digit starting with 1: already has country code
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Already looks international (12+ digits): just add +
  if (digits.length >= 12) return `+${digits}`;

  return null;
}

// ---------------------------------------------------------------------------
// Tool conversion: RetellCustomTool -> ConversationFlowTool
// ---------------------------------------------------------------------------

function toFlowTool(tool: RetellCustomTool): ConversationFlowTool {
  return {
    type: 'custom',
    tool_id: tool.name,
    name: tool.name,
    description: tool.description,
    url: tool.url,
    method: tool.method ?? 'POST',
    headers: tool.headers,
    parameters: tool.parameters,
    speak_during_execution: tool.speak_during_execution,
    speak_after_execution: tool.speak_after_execution,
    execution_message_description: tool.execution_message_description,
    execution_message_type: tool.execution_message_type,
    timeout_ms: tool.timeout_ms,
  };
}

// ---------------------------------------------------------------------------
// Edge builder helpers
// ---------------------------------------------------------------------------

let _edgeCounter = 0;

function promptEdge(
  prompt: string,
  destinationNodeId: string,
  description?: string,
): ConversationFlowEdge {
  _edgeCounter++;
  return {
    id: `edge_${_edgeCounter}`,
    description,
    transition_condition: { type: 'prompt', prompt },
    destination_node_id: destinationNodeId,
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildDentalClinicFlow(
  config: ConversationFlowBuildConfig,
): ConversationFlowConfig {
  _edgeCounter = 0;

  const cn = config.clinicName;

  // Hydrate webhook placeholders in tool URLs/headers
  function hydrateTool(tool: ConversationFlowTool): ConversationFlowTool {
    const hydrated = { ...tool };
    if (hydrated.url) {
      hydrated.url = hydrated.url
        .replace(/\{\{webhookUrl\}\}/g, config.webhookUrl)
        .replace(/\{\{secret\}\}/g, config.webhookSecret)
        .replace(/\{\{accountId\}\}/g, config.accountId);
    }
    if (hydrated.headers) {
      hydrated.headers = Object.fromEntries(
        Object.entries(hydrated.headers).map(([k, v]) => [
          k,
          v
            .replace(/\{\{webhookUrl\}\}/g, config.webhookUrl)
            .replace(/\{\{secret\}\}/g, config.webhookSecret)
            .replace(/\{\{accountId\}\}/g, config.accountId),
        ]),
      );
    }
    return hydrated;
  }

  // Build all tools (hydrated)
  const allTools: ConversationFlowTool[] = [
    retellGetProvidersTool,
    retellGetCallerContextTool,
    retellLookupPatientTool,
    retellCreatePatientTool,
    retellCheckAvailabilityTool,
    retellBookAppointmentTool,
    retellGetAppointmentsTool,
    retellRescheduleAppointmentTool,
    retellCancelAppointmentTool,
    retellUpdatePatientTool,
    retellAddNoteTool,
    retellGetInsuranceTool,
    retellVerifyInsuranceCoverageTool,
    retellGetBalanceTool,
    retellProcessPaymentTool,
    retellTakeMessageTool,
  ].map(toFlowTool).map(hydrateTool);

  // ------- Nodes -------

  const receptionistNode: ConversationFlowConversationNode = {
    id: 'receptionist',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_RECEPTIONIST_PROMPT, cn) },
    tool_ids: ['getProviders', 'getCallerContext'],
    ...(config.knowledgeBaseIds?.length
      ? { knowledge_base_ids: config.knowledgeBaseIds }
      : {}),
    edges: [
      promptEdge(
        'Caller describes pain, bleeding, trauma, swelling, breathing difficulty, or any urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to book a new appointment, schedule a visit, or find available times.',
        'booking',
      ),
      promptEdge(
        'Caller wants to cancel, reschedule, check on, or change an existing appointment.',
        'appt_mgmt',
      ),
      promptEdge(
        'Caller wants to update personal info (address, phone, email, medical history).',
        'patient_records',
      ),
      promptEdge(
        'Caller has questions about insurance coverage, billing, balance, or payments.',
        'insurance_billing',
      ),
      promptEdge(
        'Caller has a general question about the clinic that cannot be answered with available tools.',
        'faq',
      ),
      promptEdge(
        'Agent has refused a privacy/HIPAA request multiple times and the caller keeps pressing, or the conversation is going in circles.',
        'end_call',
      ),
      promptEdge(
        'Caller says goodbye, hangs up, or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const FAST_MODEL = { type: 'cascading' as const, model: 'gemini-3.0-flash' };

  const bookingNode: ConversationFlowConversationNode = {
    id: 'booking',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_BOOKING_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'checkAvailability',
      'bookAppointment',
      'rescheduleAppointment',
    ],
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms during booking.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to cancel or reschedule an existing appointment.',
        'appt_mgmt',
      ),
      promptEdge(
        'Caller asks a general question about the clinic (hours, location, services, dentists, parking, etc.) that cannot be answered with the current context.',
        'faq',
      ),
      promptEdge(
        'The bookAppointment tool has been called and returned a successful result, AND the caller has no further needs or needs general help.',
        'receptionist',
      ),
      promptEdge(
        'The bookAppointment tool has been called and returned a successful result, AND the caller says goodbye or the conversation is complete.',
        'end_call',
      ),
    ],
  };

  const apptMgmtNode: ConversationFlowConversationNode = {
    id: 'appt_mgmt',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_APPT_MGMT_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'getAppointments',
      'rescheduleAppointment',
      'cancelAppointment',
    ],
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to book a brand new appointment (not reschedule).',
        'booking',
      ),
      promptEdge(
        'Caller asks a general question about the clinic (hours, location, services, dentists, parking, etc.) that cannot be answered with the current context.',
        'faq',
      ),
      promptEdge(
        'Agent has refused a privacy/third-party request multiple times and the caller keeps pressing, or the conversation is going in circles.',
        'end_call',
      ),
      promptEdge(
        'Task is complete or caller needs general help.',
        'receptionist',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const patientRecordsNode: ConversationFlowConversationNode = {
    id: 'patient_records',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_PATIENT_RECORDS_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'createPatient',
      'updatePatient',
      'addNote',
    ],
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to book an appointment.',
        'booking',
      ),
      promptEdge(
        'Caller wants to update insurance or check billing.',
        'insurance_billing',
      ),
      promptEdge(
        'Caller asks a general question about the clinic (hours, location, services, dentists, parking, etc.) that cannot be answered with the current context.',
        'faq',
      ),
      promptEdge(
        'Agent has refused a privacy/HIPAA request multiple times and the caller keeps pressing, or the conversation is going in circles.',
        'end_call',
      ),
      promptEdge(
        'Task is complete or caller needs general help.',
        'receptionist',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const insuranceBillingNode: ConversationFlowConversationNode = {
    id: 'insurance_billing',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_INSURANCE_BILLING_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'getInsurance',
      'verifyInsuranceCoverage',
      'getBalance',
      'processPayment',
    ],
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to book an appointment.',
        'booking',
      ),
      promptEdge(
        'Caller wants to update personal (non-insurance) info.',
        'patient_records',
      ),
      promptEdge(
        'Caller asks a general question about the clinic (hours, location, services, dentists, parking, etc.) that cannot be answered with the current context.',
        'faq',
      ),
      promptEdge(
        'Agent has already answered the insurance/billing question and offered a callback, but the caller keeps asking repeated detailed follow-up questions. The conversation is going in circles.',
        'end_call',
      ),
      promptEdge(
        'Task is complete or caller needs general help.',
        'receptionist',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const emergencyNode: ConversationFlowConversationNode = {
    id: 'emergency',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_EMERGENCY_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'checkAvailability',
      'bookAppointment',
    ],
    edges: [
      promptEdge(
        'Agent has given the same advice (call 911, or refused medication advice, or refused medical guidance) at least twice and the caller keeps repeating themselves or the conversation is going in circles.',
        'end_call',
      ),
      ...(config.clinicPhone
        ? [
            promptEdge(
              'Caller needs to be connected to clinic staff for urgent non-life-threatening emergency.',
              'transfer_clinic',
            ),
          ]
        : []),
      promptEdge(
        'Emergency is assessed and patient needs a follow-up appointment.',
        'booking',
      ),
      promptEdge(
        'Emergency is handled and caller says goodbye.',
        'end_call',
      ),
    ],
  };

  const faqNode: ConversationFlowConversationNode = {
    id: 'faq',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_FAQ_PROMPT, cn) },
    ...(config.knowledgeBaseIds?.length
      ? { knowledge_base_ids: config.knowledgeBaseIds }
      : {}),
    edges: [
      promptEdge(
        'Caller wants to book an appointment or continue booking.',
        'booking',
      ),
      promptEdge(
        'Caller wants to cancel, reschedule, or manage an existing appointment.',
        'appt_mgmt',
      ),
      promptEdge(
        'Caller has questions about insurance, billing, or payments.',
        'insurance_billing',
      ),
      promptEdge(
        'Caller has another question or needs other help.',
        'receptionist',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const nodes: ConversationFlowNode[] = [
    receptionistNode,
    bookingNode,
    apptMgmtNode,
    patientRecordsNode,
    insuranceBillingNode,
    emergencyNode,
    faqNode,
  ];

  // Take-message node: collects caller info when transfer fails or staff unavailable
  const takeMessageNode: ConversationFlowConversationNode = {
    id: 'take_message',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_TAKE_MESSAGE_PROMPT, cn) },
    tool_ids: ['takeMessage'],
    edges: [
      promptEdge(
        'Message has been taken and confirmed, or caller declines to leave info.',
        'end_call',
      ),
    ],
  };
  nodes.push(takeMessageNode);

  // Transfer call node (only if clinic phone is configured and valid E.164)
  const normalizedClinicPhone = config.clinicPhone ? normalizeToE164(config.clinicPhone) : null;
  if (normalizedClinicPhone) {
    nodes.push({
      id: 'transfer_clinic',
      type: 'transfer_call',
      transfer_destination: {
        type: 'predefined',
        number: normalizedClinicPhone,
      },
      transfer_option: {
        type: 'cold_transfer',
      },
      edge: {
        id: 'edge_transfer_failed',
        transition_condition: { type: 'prompt', prompt: 'Transfer failed' },
        destination_node_id: 'take_message',
      },
      speak_during_execution: true,
      instruction: {
        type: 'prompt',
        text: 'Let me get you help right now.',
      },
    });
  }

  // End node
  nodes.push({
    id: 'end_call',
    type: 'end',
    speak_during_execution: true,
    instruction: {
      type: 'prompt',
      text: `Thank you for calling ${cn}. Have a great day!`,
    },
  });

  // ------- Global prompt -------

  const globalPrompt = [
    `You are an AI assistant for ${cn}, a dental clinic.`,
    '',
    '## RULES',
    '- Match the caller\'s language. If they switch, follow.',
    '- NEVER give medical advice — redirect to scheduling a visit.',
    '- **BE BRIEF**: 1-2 short sentences per turn. Use caller\'s name when known. Show empathy.',
    '- Never mention system internals (nodes, flow, routing, transferring).',
    '- Speak dates naturally ("tomorrow at 2 PM"), never ISO. Read phone numbers digit by digit.',
    '- **PHONE VERIFY**: Read back any phone number digit by digit before searching. When calling lookupPatient, provide both phone AND name when available.',
    '- If a tool returns [ERROR], the action FAILED — never say it succeeded.',
    '- **NO LOOPS**: After refusing or advising the same thing twice, give a final answer and end the call.',
    '- **PRIVACY**: Only share patient details with the patient. Refuse third parties up to 2×, then end call.',
    '- **NO FABRICATION**: If info isn\'t in the KB or a tool result, say you\'ll have the team follow up.',
    '',
    '## SHARED STATE',
    '{{patient_id}}, {{patient_name}}, {{customer_phone}} persist across nodes. Don\'t re-ask if already known.',
  ].join('\n');

  return {
    start_speaker: 'agent',
    model_choice: {
      type: 'cascading',
      model: 'gemini-3.0-flash',
      high_priority: true,
    },
    global_prompt: globalPrompt,
    default_dynamic_variables: {
      customer_phone: '',
      patient_id: '',
      patient_name: '',
      now: new Date().toISOString(),
    },
    tools: allTools,
    start_node_id: 'receptionist',
    nodes,
  };
}
