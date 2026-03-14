/**
 * Financial Agent — Outbound Conversation Flow Template
 *
 * Handles payment collection and insurance benefits expiring calls.
 * Router reads call_type and branches to the appropriate node.
 *
 * Structure:
 *   Router -> [Payment, Benefits] -> Booking (optional) -> End
 */

import {
  FINANCIAL_GLOBAL_PROMPT,
  FINANCIAL_ROUTER_PROMPT,
  FINANCIAL_PAYMENT_PROMPT,
  FINANCIAL_BENEFITS_PROMPT,
  FINANCIAL_BOOKING_COLLECT_PROMPT,
  FINANCIAL_BOOKING_PICK_SLOT_PROMPT,
  FINANCIAL_BOOKING_DONE_PROMPT,
  FINANCIAL_BOOKING_FAILED_PROMPT,
} from './financial-prompts';

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
  retellGetBalanceTool,
  retellProcessPaymentTool,
  retellVerifyInsuranceCoverageTool,
  retellGetInsuranceTool,
} from '../../retell-pms-tools.config';

export const OUTBOUND_FINANCIAL_FLOW_VERSION = 'ob-fin-v2.0';

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
    id: `fin_edge_${_edgeCounter}`,
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
    id: `fin_edge_${_edgeCounter}`,
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

  // Call-type nodes
  payment_node: { x: -200, y: 200 },
  benefits_node: { x: 200, y: 200 },

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
  transfer_billing: { x: 300, y: 1250 },
};

const NODE_NAMES: Record<string, string> = {
  router: 'Router',
  payment_node: 'Payment',
  benefits_node: 'Benefits',
  ob_booking_collect: 'Collect Booking Info',
  fn_check_avail: 'Check Availability',
  ob_booking_pick_slot: 'Pick Time Slot',
  fn_book: 'Book Appointment',
  ob_booking_done: 'Booking Confirmed',
  ob_booking_failed: 'Booking Failed',
  end_call: 'End Call',
  end_dnc: 'Do Not Call',
  transfer_billing: 'Transfer to Billing',
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

export function buildFinancialOutboundFlow(
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
    retellGetBalanceTool,
    retellProcessPaymentTool,
    retellVerifyInsuranceCoverageTool,
    retellGetInsuranceTool,
  ].map(toFlowTool).map(hydrateTool);

  const commonExitEdges = () => [
    promptEdge(
      'Patient asks to stop calling, remove from list, or says "do not call".',
      'end_dnc',
      'DNC request',
    ),
    promptEdge(
      'Conversation is complete, patient says goodbye, or patient is unavailable.',
      'end_call',
      'End call',
    ),
  ];

  const bookingExitEdge = () =>
    promptEdge(
      'Patient wants to schedule an appointment.',
      'ob_booking_collect',
      'Schedule appointment',
    );

  // ── Router Node ──────────────────────────────────────────────────────

  const routerNode: ConversationFlowConversationNode = {
    id: 'router',
    type: 'conversation',
    instruction: { type: 'prompt', text: FINANCIAL_ROUTER_PROMPT },
    edges: [
      equationEdge([eqVar('{{call_type}}', '==', 'payment')], 'payment_node', 'Payment'),
      equationEdge([eqVar('{{call_type}}', '==', 'benefits')], 'benefits_node', 'Benefits'),
    ],
    else_edge: elseEdge('else_router', 'payment_node'),
  };

  // ── Payment Node ─────────────────────────────────────────────────────

  const paymentNode: ConversationFlowConversationNode = {
    id: 'payment_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FINANCIAL_PAYMENT_PROMPT, cn, cp) },
    tool_ids: ['lookupPatient', 'getBalance', 'processPayment'],
    edges: [
      promptEdge(
        'Patient wants to discuss payment plan or disputes charges — needs human help.',
        'transfer_billing',
        'Billing transfer',
      ),
      ...commonExitEdges(),
    ],
  };

  // ── Benefits Node ────────────────────────────────────────────────────

  const benefitsNode: ConversationFlowConversationNode = {
    id: 'benefits_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FINANCIAL_BENEFITS_PROMPT, cn, cp) },
    tool_ids: [
      'lookupPatient',
      'getInsurance',
      'verifyInsuranceCoverage',
    ],
    edges: [
      bookingExitEdge(),
      ...commonExitEdges(),
    ],
  };

  // ── Booking Sub-Flow (rigid, sequential) ─────────────────────────────

  const obBookingCollect: ConversationFlowConversationNode = {
    id: 'ob_booking_collect',
    type: 'conversation',
    model_choice: FAST_MODEL,
    instruction: { type: 'prompt', text: hydratePrompt(FINANCIAL_BOOKING_COLLECT_PROMPT, cn, cp) },
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
    instruction: { type: 'prompt', text: hydratePrompt(FINANCIAL_BOOKING_PICK_SLOT_PROMPT, cn, cp) },
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
    instruction: { type: 'prompt', text: hydratePrompt(FINANCIAL_BOOKING_DONE_PROMPT, cn, cp) },
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
    instruction: { type: 'prompt', text: hydratePrompt(FINANCIAL_BOOKING_FAILED_PROMPT, cn, cp) },
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
        'Thank the patient for their time. Remind them they can reach {{clinic_name}} at {{clinic_phone}} for any billing or insurance questions. Say goodbye warmly.',
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
      text: 'The patient has requested to not be called again. Apologize for the inconvenience, confirm removal from the call list, and end politely.',
    },
    speak_during_execution: true,
  };

  const transferBillingNode: ConversationFlowNode = config.clinicPhone
    ? {
        id: 'transfer_billing',
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
          text: `Let the patient know you're connecting them to the billing department. Say: "I'll connect you with our billing team now so they can assist you further."`,
        },
        speak_during_execution: true,
      }
    : {
        id: 'transfer_billing',
        type: 'end' as const,
        instruction: {
          type: 'prompt',
          text: hydratePrompt(
            'Advise the patient to call {{clinic_name}} at {{clinic_phone}} to speak with the billing team. End the call.',
            cn,
            cp,
          ),
        },
        speak_during_execution: true,
      };

  // ── Assemble Flow ────────────────────────────────────────────────────

  const nodes: ConversationFlowNode[] = [
    routerNode,
    paymentNode,
    benefitsNode,
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
    transferBillingNode,
  ];

  autoLayoutNodes(nodes);

  return {
    start_speaker: 'agent',
    model_choice: {
      type: 'cascading',
      model: 'gemini-3.0-flash',
      high_priority: true,
    },
    global_prompt: FINANCIAL_GLOBAL_PROMPT,
    ...(config.knowledgeBaseIds?.length
      ? { knowledge_base_ids: config.knowledgeBaseIds }
      : {}),
    default_dynamic_variables: {
      call_type: 'payment',
      patient_name: '',
      patient_id: '',
      clinic_name: cn,
      clinic_phone: cp,
      balance_amount: '',
      last_statement_date: '',
      payment_plan_available: 'true',
      insurance_provider: '',
      benefits_expiry_date: '',
      remaining_benefits: '',
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
