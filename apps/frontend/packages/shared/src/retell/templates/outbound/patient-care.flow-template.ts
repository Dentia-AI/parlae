/**
 * Patient Care Agent — Outbound Conversation Flow Template
 *
 * A single Retell conversation flow that handles all patient-care outbound call types.
 * The router node reads the `call_type` dynamic variable and branches to the
 * appropriate call-type node (recall, reminder, follow-up, no-show, etc.).
 *
 * Structure:
 *   Router -> [Recall, Reminder, Follow-Up, No-Show, Treatment Plan, Post-Op, Reactivation, Survey, Welcome] -> End
 *            Each node can route to Booking sub-flow for scheduling
 */

import {
  OUTBOUND_GLOBAL_PROMPT,
  OUTBOUND_ROUTER_PROMPT,
  OUTBOUND_RECALL_PROMPT,
  OUTBOUND_REMINDER_PROMPT,
  OUTBOUND_FOLLOWUP_PROMPT,
  OUTBOUND_NOSHOW_PROMPT,
  OUTBOUND_TREATMENT_PLAN_PROMPT,
  OUTBOUND_POSTOP_PROMPT,
  OUTBOUND_REACTIVATION_PROMPT,
  OUTBOUND_SURVEY_PROMPT,
  OUTBOUND_WELCOME_PROMPT,
  OUTBOUND_BOOKING_COLLECT_PROMPT,
  OUTBOUND_BOOKING_PICK_SLOT_PROMPT,
  OUTBOUND_BOOKING_DONE_PROMPT,
  OUTBOUND_BOOKING_FAILED_PROMPT,
} from './patient-care-prompts';

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
  retellLookupPatientTool,
  retellCheckAvailabilityTool,
  retellBookAppointmentTool,
  retellGetAppointmentsTool,
  retellRescheduleAppointmentTool,
  retellCancelAppointmentTool,
  retellVerifyInsuranceCoverageTool,
} from '../../retell-pms-tools.config';

export const OUTBOUND_PATIENT_CARE_FLOW_VERSION = 'ob-pc-v2.0';

export interface OutboundFlowBuildConfig {
  clinicName: string;
  clinicPhone?: string;
  webhookUrl: string;
  webhookSecret: string;
  accountId: string;
  knowledgeBaseIds?: string[];
}

function hydratePrompt(text: string, clinicName: string, clinicPhone: string): string {
  return text
    .replace(/\{\{clinic_name\}\}/g, clinicName)
    .replace(/\{\{clinic_phone\}\}/g, clinicPhone);
}

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

const FAST_MODEL = { type: 'cascading' as const, model: 'gemini-3.0-flash' };

function elseEdge(id: string, destinationNodeId: string) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: { type: 'prompt' as const, prompt: 'Else' },
  };
}

let _edgeCounter = 0;

function promptEdge(
  prompt: string,
  destinationNodeId: string,
  description?: string,
): ConversationFlowEdge {
  _edgeCounter++;
  return {
    id: `ob_edge_${_edgeCounter}`,
    description,
    transition_condition: { type: 'prompt', prompt },
    destination_node_id: destinationNodeId,
  };
}

function equationEdge(
  equations: ConversationFlowEquation[],
  destinationNodeId: string,
  description?: string,
): ConversationFlowEdge {
  _edgeCounter++;
  return {
    id: `ob_edge_${_edgeCounter}`,
    description,
    transition_condition: { type: 'equation', equations, operator: '||' },
    destination_node_id: destinationNodeId,
  };
}

function eqVar(variable: string, operator: ConversationFlowEquation['operator'], right?: string): ConversationFlowEquation {
  return right !== undefined ? { left: variable, operator, right } : { left: variable, operator };
}

// ---------------------------------------------------------------------------
// Node visual layout (positions + readable names for Retell dashboard)
// ---------------------------------------------------------------------------

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Router (top center)
  router: { x: 0, y: 0 },

  // Call-type nodes (fanned out)
  recall_node: { x: -600, y: 200 },
  reminder_node: { x: -400, y: 200 },
  followup_node: { x: -200, y: 200 },
  noshow_node: { x: 0, y: 200 },
  treatment_plan_node: { x: 200, y: 200 },
  postop_node: { x: 400, y: 200 },
  reactivation_node: { x: 600, y: 200 },
  survey_node: { x: 800, y: 200 },
  welcome_node: { x: 1000, y: 200 },

  // Booking sub-flow (center column)
  ob_booking_collect: { x: 0, y: 450 },
  fn_check_avail: { x: 0, y: 600 },
  ob_booking_pick_slot: { x: 0, y: 750 },
  fn_book: { x: 0, y: 900 },
  ob_booking_done: { x: -100, y: 1050 },
  ob_booking_failed: { x: 100, y: 1050 },

  // End/Transfer (bottom)
  end_call: { x: 0, y: 1250 },
  end_dnc: { x: -300, y: 1250 },
  urgent_transfer: { x: 300, y: 1250 },
};

const NODE_NAMES: Record<string, string> = {
  router: 'Router',
  recall_node: 'Recall',
  reminder_node: 'Reminder',
  followup_node: 'Follow-up',
  noshow_node: 'No-show',
  treatment_plan_node: 'Treatment Plan',
  postop_node: 'Post-op',
  reactivation_node: 'Reactivation',
  survey_node: 'Survey',
  welcome_node: 'Welcome',
  ob_booking_collect: 'Collect Booking Info',
  fn_check_avail: 'Check Availability',
  ob_booking_pick_slot: 'Pick Time Slot',
  fn_book: 'Book Appointment',
  ob_booking_done: 'Booking Confirmed',
  ob_booking_failed: 'Booking Failed',
  end_call: 'End Call',
  end_dnc: 'Do Not Call',
  urgent_transfer: 'Urgent Transfer',
};

function autoLayoutNodes(nodes: ConversationFlowNode[]): void {
  let fallbackY = 1400;
  for (const node of nodes) {
    const pos = NODE_POSITIONS[node.id];
    if (pos) {
      node.display_position = { ...pos };
    } else {
      node.display_position = { x: 600, y: fallbackY };
      fallbackY += 150;
    }
    node.name = NODE_NAMES[node.id] || node.id;
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPatientCareOutboundFlow(
  config: OutboundFlowBuildConfig,
): ConversationFlowConfig {
  _edgeCounter = 0;

  const cn = config.clinicName;
  const cp = config.clinicPhone || '';

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

  const allTools: ConversationFlowTool[] = [
    retellLookupPatientTool,
    retellCheckAvailabilityTool,
    retellBookAppointmentTool,
    retellGetAppointmentsTool,
    retellRescheduleAppointmentTool,
    retellCancelAppointmentTool,
    retellVerifyInsuranceCoverageTool,
  ].map(toFlowTool).map(hydrateTool);

  const commonExitEdges = () => [
    promptEdge(
      'Patient asks to stop calling, remove from list, or says "do not call".',
      'end_dnc',
      'DNC request',
    ),
    promptEdge(
      'Patient wants to schedule, reschedule, or cancel an appointment.',
      'ob_booking_collect',
      'Scheduling request',
    ),
    promptEdge(
      'Conversation is complete: the patient said goodbye, declined to book, or is unavailable.',
      'end_call',
      'End call',
    ),
  ];

  // ── Router Node ──────────────────────────────────────────────────────

  const routerNode: ConversationFlowConversationNode = {
    id: 'router',
    type: 'conversation',
    instruction: { type: 'prompt', text: OUTBOUND_ROUTER_PROMPT },
    edges: [
      equationEdge([eqVar('{{call_type}}', '==', 'recall')], 'recall_node', 'Recall'),
      equationEdge([eqVar('{{call_type}}', '==', 'reminder')], 'reminder_node', 'Reminder'),
      equationEdge([eqVar('{{call_type}}', '==', 'followup')], 'followup_node', 'Follow-up'),
      equationEdge([eqVar('{{call_type}}', '==', 'noshow')], 'noshow_node', 'No-show'),
      equationEdge([eqVar('{{call_type}}', '==', 'treatment_plan')], 'treatment_plan_node', 'Treatment plan'),
      equationEdge([eqVar('{{call_type}}', '==', 'postop')], 'postop_node', 'Post-op'),
      equationEdge([eqVar('{{call_type}}', '==', 'reactivation')], 'reactivation_node', 'Reactivation'),
      equationEdge([eqVar('{{call_type}}', '==', 'survey')], 'survey_node', 'Survey'),
      equationEdge([eqVar('{{call_type}}', '==', 'welcome')], 'welcome_node', 'Welcome'),
    ],
    else_edge: elseEdge('else_router', 'recall_node'),
  };

  // ── Call Type Nodes ──────────────────────────────────────────────────

  const recallNode: ConversationFlowConversationNode = {
    id: 'recall_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_RECALL_PROMPT, cn, cp) },
    edges: commonExitEdges(),
  };

  const reminderNode: ConversationFlowConversationNode = {
    id: 'reminder_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_REMINDER_PROMPT, cn, cp) },
    tool_ids: ['lookupPatient', 'getAppointments', 'rescheduleAppointment', 'cancelAppointment'],
    edges: commonExitEdges(),
  };

  const followupNode: ConversationFlowConversationNode = {
    id: 'followup_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_FOLLOWUP_PROMPT, cn, cp) },
    edges: [
      promptEdge(
        'Patient reports severe pain, excessive bleeding, swelling, or fever.',
        'urgent_transfer',
        'Urgent symptoms',
      ),
      ...commonExitEdges(),
    ],
  };

  const noshowNode: ConversationFlowConversationNode = {
    id: 'noshow_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_NOSHOW_PROMPT, cn, cp) },
    edges: commonExitEdges(),
  };

  const treatmentPlanNode: ConversationFlowConversationNode = {
    id: 'treatment_plan_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_TREATMENT_PLAN_PROMPT, cn, cp) },
    tool_ids: ['verifyInsuranceCoverage'],
    edges: commonExitEdges(),
  };

  const postopNode: ConversationFlowConversationNode = {
    id: 'postop_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_POSTOP_PROMPT, cn, cp) },
    edges: [
      promptEdge(
        'Patient reports severe pain, excessive bleeding, swelling, or fever.',
        'urgent_transfer',
        'Urgent symptoms',
      ),
      ...commonExitEdges(),
    ],
  };

  const reactivationNode: ConversationFlowConversationNode = {
    id: 'reactivation_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_REACTIVATION_PROMPT, cn, cp) },
    edges: commonExitEdges(),
  };

  const surveyNode: ConversationFlowConversationNode = {
    id: 'survey_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_SURVEY_PROMPT, cn, cp) },
    tool_ids: [],
    edges: [
      promptEdge(
        'Patient had a negative experience and wants to speak to someone.',
        'urgent_transfer',
        'Escalation',
      ),
      ...commonExitEdges(),
    ],
  };

  const welcomeNode: ConversationFlowConversationNode = {
    id: 'welcome_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_WELCOME_PROMPT, cn, cp) },
    edges: commonExitEdges(),
  };

  // ── Booking Sub-Flow (rigid, sequential) ─────────────────────────────

  const obBookingCollect: ConversationFlowConversationNode = {
    id: 'ob_booking_collect',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_BOOKING_COLLECT_PROMPT, cn, cp) },
    edges: [
      promptEdge(
        'Patient has stated both the appointment type and preferred date/time.',
        'fn_check_avail',
        'Ready to check',
      ),
      promptEdge(
        'Patient changes mind and does not want to book.',
        'end_call',
        'Patient defers',
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
        [eqVar('{{avail_success}}', '==', 'true')],
        'ob_booking_pick_slot',
        'Availability found',
      ),
    ],
    else_edge: elseEdge('else_fn_check_avail', 'ob_booking_failed'),
  };

  const obBookingPickSlot: ConversationFlowConversationNode = {
    id: 'ob_booking_pick_slot',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_BOOKING_PICK_SLOT_PROMPT, cn, cp) },
    edges: [
      promptEdge(
        'Patient has selected a specific time slot.',
        'fn_book',
        'Slot selected',
      ),
      promptEdge(
        'Patient wants to check a different date.',
        'ob_booking_collect',
        'Try another date',
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
      text: 'Extract booking details: date (YYYY-MM-DD), startTime (HH:MM), appointmentType. If {{patient_id}} is set, pass it as patientId. Otherwise extract firstName, lastName, phone from the conversation.',
    },
    edges: [
      equationEdge(
        [eqVar('{{book_success}}', '==', 'true')],
        'ob_booking_done',
        'Booking succeeded',
      ),
    ],
    else_edge: elseEdge('else_fn_book', 'ob_booking_failed'),
  };

  const obBookingDone: ConversationFlowConversationNode = {
    id: 'ob_booking_done',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_BOOKING_DONE_PROMPT, cn, cp) },
    edges: [
      promptEdge(
        'Confirmation delivered and patient responds.',
        'end_call',
        'Done',
      ),
    ],
  };

  const obBookingFailed: ConversationFlowConversationNode = {
    id: 'ob_booking_failed',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_BOOKING_FAILED_PROMPT, cn, cp) },
    edges: [
      promptEdge(
        'Patient wants to try a different date or time.',
        'ob_booking_collect',
        'Retry',
      ),
      promptEdge(
        'Patient is done trying or wants to call back later.',
        'end_call',
        'Give up',
      ),
    ],
  };

  // ── End/Transfer Nodes ───────────────────────────────────────────────

  const endCallNode: ConversationFlowNode = {
    id: 'end_call',
    type: 'end' as const,
    instruction: {
      type: 'prompt',
      text: hydratePrompt(
        'Thank the patient for their time. Remind them they can reach {{clinic_name}} at {{clinic_phone}}. Say goodbye warmly.',
        cn,
        cp,
      ),
    },
    speak_during_execution: true,
  };

  const endDncNode: ConversationFlowNode = {
    id: 'end_dnc',
    type: 'end' as const,
    instruction: {
      type: 'prompt',
      text: 'The patient has requested to not be called again. Apologize for the inconvenience, confirm you will remove them from the call list, and end the call politely. Say: "I completely understand. I\'ve noted your preference and we will remove you from our call list. Sorry for the inconvenience, and have a great day!"',
    },
    speak_during_execution: true,
  };

  const urgentTransferNode: ConversationFlowNode = config.clinicPhone
    ? {
        id: 'urgent_transfer',
        type: 'transfer_call' as const,
        transfer_destination: {
          type: 'predefined' as const,
          number: config.clinicPhone,
        },
        transfer_option: {
          type: 'warm_transfer' as const,
          show_transferee_as_caller: false,
        },
        edge: promptEdge('Transfer failed', 'end_call'),
        instruction: {
          type: 'prompt',
          text: `Let the patient know you're connecting them to the clinic now. Say: "I'm going to connect you with our clinic staff right away so they can help you."`,
        },
        speak_during_execution: true,
      }
    : {
        id: 'urgent_transfer',
        type: 'end' as const,
        instruction: {
          type: 'prompt',
          text: hydratePrompt(
            'Advise the patient to call {{clinic_name}} directly at {{clinic_phone}} as soon as possible. End the call.',
            cn,
            cp,
          ),
        },
        speak_during_execution: true,
      };

  // ── Assemble Flow ────────────────────────────────────────────────────

  const nodes: ConversationFlowNode[] = [
    routerNode,
    recallNode,
    reminderNode,
    followupNode,
    noshowNode,
    treatmentPlanNode,
    postopNode,
    reactivationNode,
    surveyNode,
    welcomeNode,
    // Booking sub-flow
    obBookingCollect,
    fnCheckAvail,
    obBookingPickSlot,
    fnBook,
    obBookingDone,
    obBookingFailed,
    // End/Transfer
    endCallNode,
    endDncNode,
    urgentTransferNode,
  ];

  autoLayoutNodes(nodes);

  return {
    start_speaker: 'agent',
    model_choice: {
      type: 'cascading',
      model: 'gemini-3.0-flash',
      high_priority: true,
    },
    global_prompt: OUTBOUND_GLOBAL_PROMPT,
    ...(config.knowledgeBaseIds?.length
      ? { knowledge_base_ids: config.knowledgeBaseIds }
      : {}),
    default_dynamic_variables: {
      call_type: 'recall',
      patient_name: '',
      patient_id: '',
      clinic_name: cn,
      clinic_phone: cp,
      appointment_date: '',
      appointment_time: '',
      appointment_type: '',
      provider_name: '',
      last_visit_date: '',
      months_since_visit: '',
      procedure_name: '',
      procedure_date: '',
      treatment_details: '',
      avail_success: '',
      avail_message: '',
      book_success: '',
      book_message: '',
    },
    tools: allTools,
    start_node_id: 'router',
    nodes,
    begin_tag_display_position: { x: 0, y: -100 },
  };
}
