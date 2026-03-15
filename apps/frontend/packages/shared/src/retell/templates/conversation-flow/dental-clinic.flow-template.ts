/**
 * Dental Clinic Conversation Flow Template — v2.0
 *
 * Two-tier hybrid architecture:
 *   Tier 1 — Hub nodes (free-form): greeting, faq, post_action
 *   Tier 2 — Action sub-flows (rigid): booking, appt_mgmt
 *
 * Entry sequence: fn_get_context (function) -> greeting (0 tools, KB)
 * Booking sub-flow: booking_collect -> fn_check_avail -> booking_pick_slot
 *   -> booking_contact -> fn_book -> booking_done / booking_failed
 * Appt mgmt sub-flow: appt_mgmt -> fn_get_appts -> [appt_cancel / appt_resched]
 *   -> fn_cancel / fn_reschedule -> appt_mgmt_done / appt_mgmt_failed
 *
 * Function nodes execute deterministically (no tool-selection overhead).
 * Equation-based edges route on response_variables (no LLM evaluation).
 */

import {
  FLOW_GREETING_PROMPT,
  FLOW_BOOKING_COLLECT_PROMPT,
  FLOW_BOOKING_PICK_SLOT_PROMPT,
  FLOW_BOOKING_CONTACT_PROMPT,
  FLOW_BOOKING_DONE_PROMPT,
  FLOW_BOOKING_FAILED_PROMPT,
  FLOW_POST_ACTION_PROMPT,
  FLOW_APPT_MGMT_ENTRY_PROMPT,
  FLOW_APPT_CANCEL_PROMPT,
  FLOW_APPT_RESCHED_PROMPT,
  FLOW_APPT_MGMT_DONE_PROMPT,
  FLOW_APPT_MGMT_FAILED_PROMPT,
  FLOW_PATIENT_RECORDS_PROMPT,
  FLOW_INSURANCE_BILLING_PROMPT,
  FLOW_EMERGENCY_PROMPT,
  FLOW_FAQ_PROMPT,
  FLOW_TAKE_MESSAGE_PROMPT,
  GLOBAL_PROMPT_STAY_ON_TASK,
} from './flow-prompts';

import type {
  ConversationFlowConfig,
  ConversationFlowNode,
  ConversationFlowTool,
  ConversationFlowEdge,
  ConversationFlowConversationNode,
  ConversationFlowFunctionNode,
  ConversationFlowEquation,
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

export const CONVERSATION_FLOW_VERSION = 'cf-v2.1';

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
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
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
    ...(tool.response_variables ? { response_variables: tool.response_variables } : {}),
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

/**
 * Build an equation-based edge. Used after function nodes to route on
 * response_variables without LLM evaluation.
 */
function equationEdge(
  equations: ConversationFlowEquation[],
  operator: '||' | '&&',
  destinationNodeId: string,
  description?: string,
): ConversationFlowEdge {
  _edgeCounter++;
  return {
    id: `edge_${_edgeCounter}`,
    description,
    transition_condition: { type: 'equation', equations, operator },
    destination_node_id: destinationNodeId,
  };
}

function elseEdge(id: string, destinationNodeId: string) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: { type: 'prompt' as const, prompt: 'Else' },
  };
}

const FAST_MODEL = { type: 'cascading' as const, model: 'gemini-3.0-flash' };

// ---------------------------------------------------------------------------
// Node visual layout (positions + readable names for Retell dashboard)
// ---------------------------------------------------------------------------

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Entry (top center)
  fn_get_context: { x: 500, y: 0 },
  greeting: { x: 500, y: 500 },

  // Emergency (far left column)
  emergency: { x: -1200, y: 1200 },

  // Booking sub-flow (left column)
  booking_collect: { x: -400, y: 1200 },
  fn_check_avail: { x: -400, y: 1800 },
  booking_pick_slot: { x: -400, y: 2400 },
  booking_contact: { x: -400, y: 3000 },
  fn_book: { x: -400, y: 3600 },
  booking_done: { x: -700, y: 4200 },
  booking_failed: { x: -100, y: 4200 },

  // Appt mgmt sub-flow (center column)
  appt_mgmt: { x: 500, y: 1200 },
  fn_get_appts: { x: 500, y: 1800 },
  appt_cancel: { x: 200, y: 2400 },
  fn_cancel: { x: 200, y: 3000 },
  appt_resched: { x: 800, y: 2400 },
  fn_reschedule: { x: 800, y: 3000 },
  appt_mgmt_done: { x: 300, y: 3600 },
  appt_mgmt_failed: { x: 700, y: 3600 },

  // Hub nodes (center-right column)
  post_action: { x: 1400, y: 1200 },
  faq: { x: 1400, y: 1800 },

  // Standalone nodes (right column)
  patient_records: { x: 2200, y: 1200 },
  insurance_billing: { x: 2200, y: 1800 },

  // Utility (far right column)
  take_message: { x: 3000, y: 1200 },
  transfer_clinic: { x: 3000, y: 1800 },

  // End (bottom center)
  end_call: { x: 1000, y: 4800 },
};

const NODE_NAMES: Record<string, string> = {
  fn_get_context: 'Get Caller Context',
  greeting: 'Greeting',
  booking_collect: 'Collect Booking Info',
  fn_check_avail: 'Check Availability',
  booking_pick_slot: 'Pick Time Slot',
  booking_contact: 'Confirm Contact',
  fn_book: 'Book Appointment',
  booking_done: 'Booking Confirmed',
  booking_failed: 'Booking Failed',
  appt_mgmt: 'Manage Appointment',
  fn_get_appts: 'Fetch Appointments',
  appt_cancel: 'Confirm Cancellation',
  fn_cancel: 'Cancel Appointment',
  appt_resched: 'Reschedule Details',
  fn_reschedule: 'Reschedule Appointment',
  appt_mgmt_done: 'Action Confirmed',
  appt_mgmt_failed: 'Action Failed',
  post_action: 'Anything Else?',
  faq: 'FAQ',
  emergency: 'Emergency',
  patient_records: 'Patient Records',
  insurance_billing: 'Insurance & Billing',
  take_message: 'Take Message',
  transfer_clinic: 'Transfer to Clinic',
  end_call: 'End Call',
};

/**
 * Assign display_position and name to every node so API-created flows
 * render with an organized layout in the Retell dashboard instead of
 * all nodes clumped in a pile.
 */
function autoLayoutNodes(nodes: ConversationFlowNode[]): void {
  let fallbackY = 5400;
  for (const node of nodes) {
    const pos = NODE_POSITIONS[node.id];
    if (pos) {
      node.display_position = { ...pos };
    } else {
      node.display_position = { x: 3800, y: fallbackY };
      fallbackY += 600;
    }
    node.name = NODE_NAMES[node.id] || node.id;
  }
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

  // =====================================================================
  // ENTRY SEQUENCE: fn_get_context -> greeting
  // =====================================================================

  const fnGetContext: ConversationFlowFunctionNode = {
    id: 'fn_get_context',
    type: 'function',
    tool_id: 'getCallerContext',
    tool_type: 'local',
    wait_for_result: true,
    speak_during_execution: false,
    else_edge: elseEdge('else_fn_get_context', 'greeting'),
  };

  const greetingNode: ConversationFlowConversationNode = {
    id: 'greeting',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_GREETING_PROMPT, cn) },
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
        'booking_collect',
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
        'Caller has a general question about the clinic (hours, location, services, dentists, parking, etc.).',
        'faq',
      ),
      promptEdge(
        'Agent has refused a privacy/HIPAA request multiple times and the caller keeps pressing.',
        'end_call',
      ),
      promptEdge(
        'Caller says goodbye, hangs up, or conversation is complete.',
        'end_call',
      ),
    ],
  };

  // =====================================================================
  // BOOKING SUB-FLOW (rigid, sequential)
  // =====================================================================

  const bookingCollect: ConversationFlowConversationNode = {
    id: 'booking_collect',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_BOOKING_COLLECT_PROMPT, cn) },
    edges: [
      promptEdge(
        'Caller describes pain, bleeding, or emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller has stated both the appointment type and preferred date/time.',
        'fn_check_avail',
      ),
      promptEdge(
        'Caller changes mind and does not want to book.',
        'post_action',
      ),
    ],
  };

  const fnCheckAvail: ConversationFlowFunctionNode = {
    id: 'fn_check_avail',
    type: 'function',
    tool_id: 'checkAvailability',
    tool_type: 'local',
    wait_for_result: true,
    speak_during_execution: true,
    model_choice: FAST_MODEL,
    instruction: {
      type: 'prompt',
      text: 'Extract the date (YYYY-MM-DD) and appointmentType from the conversation.',
    },
    edges: [
      equationEdge(
        [{ left: '{{avail_success}}', operator: '==', right: 'true' }],
        '&&',
        'booking_pick_slot',
        'Availability found',
      ),
    ],
    else_edge: elseEdge('else_fn_check_avail', 'booking_failed'),
  };

  const bookingPickSlot: ConversationFlowConversationNode = {
    id: 'booking_pick_slot',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_BOOKING_PICK_SLOT_PROMPT },
    edges: [
      promptEdge(
        'Caller describes pain, bleeding, or emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller has selected a specific time slot.',
        'booking_contact',
      ),
      promptEdge(
        'Caller wants to check a different date.',
        'booking_collect',
      ),
    ],
  };

  const bookingContact: ConversationFlowConversationNode = {
    id: 'booking_contact',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_BOOKING_CONTACT_PROMPT },
    edges: [
      promptEdge(
        'Caller describes pain, bleeding, or emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller has confirmed phone number and provided or declined email, and name if new patient.',
        'fn_book',
      ),
    ],
  };

  const fnBook: ConversationFlowFunctionNode = {
    id: 'fn_book',
    type: 'function',
    tool_id: 'bookAppointment',
    tool_type: 'local',
    wait_for_result: true,
    speak_during_execution: true,
    model_choice: FAST_MODEL,
    instruction: {
      type: 'prompt',
      text: 'Extract booking details: date (YYYY-MM-DD), startTime (HH:MM), appointmentType. If {{caller_patient_id}} is set, pass it as patientId. Otherwise extract firstName, lastName, phone, email from the conversation.',
    },
    edges: [
      equationEdge(
        [{ left: '{{book_success}}', operator: '==', right: 'true' }],
        '&&',
        'booking_done',
        'Booking succeeded',
      ),
    ],
    else_edge: elseEdge('else_fn_book', 'booking_failed'),
  };

  const bookingDone: ConversationFlowConversationNode = {
    id: 'booking_done',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_BOOKING_DONE_PROMPT },
    edges: [
      promptEdge(
        'Confirmation delivered and caller responds.',
        'post_action',
      ),
    ],
  };

  const bookingFailed: ConversationFlowConversationNode = {
    id: 'booking_failed',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_BOOKING_FAILED_PROMPT },
    edges: [
      promptEdge(
        'Caller wants to try a different date or time.',
        'booking_collect',
      ),
      promptEdge(
        'Caller is done trying or wants other help.',
        'post_action',
      ),
    ],
  };

  // =====================================================================
  // HUB NODES (free-form)
  // =====================================================================

  const postAction: ConversationFlowConversationNode = {
    id: 'post_action',
    type: 'conversation',
    instruction: { type: 'prompt', text: FLOW_POST_ACTION_PROMPT },
    edges: [
      promptEdge(
        'Caller describes pain, bleeding, or emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to book a new appointment.',
        'booking_collect',
      ),
      promptEdge(
        'Caller wants to cancel, reschedule, or manage an existing appointment.',
        'appt_mgmt',
      ),
      promptEdge(
        'Caller has a general question about the clinic.',
        'faq',
      ),
      promptEdge(
        'Caller says goodbye or is done.',
        'end_call',
      ),
    ],
  };

  const faqNode: ConversationFlowConversationNode = {
    id: 'faq',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_FAQ_PROMPT, cn) },
    tool_ids: ['getProviders'],
    ...(config.knowledgeBaseIds?.length
      ? { knowledge_base_ids: config.knowledgeBaseIds }
      : {}),
    edges: [
      promptEdge(
        'Caller wants to book an appointment or continue booking.',
        'booking_collect',
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
        'greeting',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete.',
        'end_call',
      ),
    ],
  };

  // =====================================================================
  // APPOINTMENT MANAGEMENT SUB-FLOW (rigid, sequential)
  // =====================================================================

  const apptMgmtEntry: ConversationFlowConversationNode = {
    id: 'appt_mgmt',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_APPT_MGMT_ENTRY_PROMPT, cn) },
    tool_ids: ['lookupPatient'],
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller wants to book a brand new appointment (not reschedule).',
        'booking_collect',
      ),
      promptEdge(
        'Patient is identified and caller wants to cancel or reschedule — ready to fetch appointments.',
        'fn_get_appts',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const fnGetAppts: ConversationFlowFunctionNode = {
    id: 'fn_get_appts',
    type: 'function',
    tool_id: 'getAppointments',
    tool_type: 'local',
    wait_for_result: true,
    speak_during_execution: true,
    model_choice: FAST_MODEL,
    instruction: {
      type: 'prompt',
      text: 'Extract patientId. Use {{caller_patient_id}} if set, otherwise extract from the lookupPatient result in the conversation.',
    },
    edges: [
      promptEdge(
        'Caller wants to cancel an appointment.',
        'appt_cancel',
      ),
      promptEdge(
        'Caller wants to reschedule an appointment.',
        'appt_resched',
      ),
    ],
    else_edge: elseEdge('else_fn_get_appts', 'appt_mgmt'),
  };

  const apptCancel: ConversationFlowConversationNode = {
    id: 'appt_cancel',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_APPT_CANCEL_PROMPT },
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller has confirmed which appointment to cancel and optionally provided a reason.',
        'fn_cancel',
      ),
      promptEdge(
        'Caller changes mind and does not want to cancel.',
        'post_action',
      ),
    ],
  };

  const fnCancel: ConversationFlowFunctionNode = {
    id: 'fn_cancel',
    type: 'function',
    tool_id: 'cancelAppointment',
    tool_type: 'local',
    wait_for_result: true,
    speak_during_execution: true,
    model_choice: FAST_MODEL,
    instruction: {
      type: 'prompt',
      text: 'Extract appointmentId and optional reason from the conversation.',
    },
    edges: [
      equationEdge(
        [{ left: '{{cancel_success}}', operator: '==', right: 'true' }],
        '&&',
        'appt_mgmt_done',
        'Cancellation succeeded',
      ),
    ],
    else_edge: elseEdge('else_fn_cancel', 'appt_mgmt_failed'),
  };

  const apptResched: ConversationFlowConversationNode = {
    id: 'appt_resched',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_APPT_RESCHED_PROMPT, cn) },
    edges: [
      promptEdge(
        'Caller describes urgent/emergency symptoms.',
        'emergency',
      ),
      promptEdge(
        'Caller has confirmed which appointment and stated the new preferred date and time.',
        'fn_reschedule',
      ),
      promptEdge(
        'Caller changes mind and does not want to reschedule.',
        'post_action',
      ),
    ],
  };

  const fnReschedule: ConversationFlowFunctionNode = {
    id: 'fn_reschedule',
    type: 'function',
    tool_id: 'rescheduleAppointment',
    tool_type: 'local',
    wait_for_result: true,
    speak_during_execution: true,
    model_choice: FAST_MODEL,
    instruction: {
      type: 'prompt',
      text: 'Extract appointmentId, newDate (YYYY-MM-DD), and newStartTime (HH:MM) from the conversation.',
    },
    edges: [
      equationEdge(
        [{ left: '{{resched_success}}', operator: '==', right: 'true' }],
        '&&',
        'appt_mgmt_done',
        'Reschedule succeeded',
      ),
    ],
    else_edge: elseEdge('else_fn_reschedule', 'appt_mgmt_failed'),
  };

  const apptMgmtDone: ConversationFlowConversationNode = {
    id: 'appt_mgmt_done',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_APPT_MGMT_DONE_PROMPT },
    edges: [
      promptEdge(
        'Caller wants to cancel, reschedule, or manage another appointment.',
        'appt_mgmt',
      ),
      promptEdge(
        'Caller wants to book a new appointment.',
        'booking_collect',
      ),
      promptEdge(
        'Confirmation delivered and caller responds.',
        'post_action',
      ),
    ],
  };

  const apptMgmtFailed: ConversationFlowConversationNode = {
    id: 'appt_mgmt_failed',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: FLOW_APPT_MGMT_FAILED_PROMPT },
    edges: [
      promptEdge(
        'Caller wants to try again.',
        'appt_mgmt',
      ),
      promptEdge(
        'Caller is done or wants other help.',
        'post_action',
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
      promptEdge('Caller describes urgent/emergency symptoms.', 'emergency'),
      promptEdge('Caller wants to book an appointment.', 'booking_collect'),
      promptEdge('Caller wants to update insurance or check billing.', 'insurance_billing'),
      promptEdge('Caller asks a general question about the clinic.', 'faq'),
      promptEdge('Agent has refused a privacy/HIPAA request multiple times.', 'end_call'),
      promptEdge('Task is complete or caller needs general help.', 'post_action'),
      promptEdge('Caller says goodbye or conversation is complete.', 'end_call'),
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
      promptEdge('Caller describes urgent/emergency symptoms.', 'emergency'),
      promptEdge('Caller wants to book an appointment.', 'booking_collect'),
      promptEdge('Caller wants to update personal (non-insurance) info.', 'patient_records'),
      promptEdge('Caller asks a general question about the clinic.', 'faq'),
      promptEdge('Conversation is going in circles after offering callback.', 'end_call'),
      promptEdge('Task is complete or caller needs general help.', 'post_action'),
      promptEdge('Caller says goodbye or conversation is complete.', 'end_call'),
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
        'Agent has given the same advice at least twice and the caller keeps repeating.',
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
        'booking_collect',
      ),
      promptEdge(
        'Emergency is handled and caller says goodbye.',
        'end_call',
      ),
    ],
  };

  // =====================================================================
  // ASSEMBLE NODES
  // =====================================================================

  const nodes: ConversationFlowNode[] = [
    // Entry
    fnGetContext,
    greetingNode,
    // Booking sub-flow
    bookingCollect,
    fnCheckAvail,
    bookingPickSlot,
    bookingContact,
    fnBook,
    bookingDone,
    bookingFailed,
    // Appointment management sub-flow
    apptMgmtEntry,
    fnGetAppts,
    apptCancel,
    fnCancel,
    apptResched,
    fnReschedule,
    apptMgmtDone,
    apptMgmtFailed,
    // Hub
    postAction,
    faqNode,
    // Existing (Phase 3 will optimize)
    patientRecordsNode,
    insuranceBillingNode,
    emergencyNode,
  ];

  // Take-message node
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
    '- Avoid filler words (um, uh) unless a natural pause is needed.',
    '',
    '## SHARED STATE',
    '{{caller_patient_id}}, {{caller_patient_name}}, {{customer_phone}} persist across nodes. Don\'t re-ask if already known.',
    GLOBAL_PROMPT_STAY_ON_TASK,
  ].join('\n');

  autoLayoutNodes(nodes);

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
      caller_patient_type: '',
      caller_patient_name: '',
      caller_patient_id: '',
      caller_next_booking: '',
      avail_success: '',
      avail_message: '',
      book_success: '',
      book_message: '',
      appts_found: '',
      cancel_success: '',
      cancel_message: '',
      resched_success: '',
      resched_message: '',
      now: new Date().toISOString(),
    },
    tools: allTools,
    start_node_id: 'fn_get_context',
    nodes,
    begin_tag_display_position: { x: 500, y: -200 },
  };
}
