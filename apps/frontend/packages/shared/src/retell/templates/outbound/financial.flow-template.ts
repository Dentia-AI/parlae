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
} from './financial-prompts';

import type {
  ConversationFlowConfig,
  ConversationFlowNode,
  ConversationFlowTool,
  ConversationFlowEdge,
  ConversationFlowConversationNode,
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

export const OUTBOUND_FINANCIAL_FLOW_VERSION = 'ob-fin-v1.0';

export interface OutboundFlowBuildConfig {
  clinicName: string;
  clinicPhone?: string;
  webhookUrl: string;
  webhookSecret: string;
  accountId: string;
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

  const commonExitEdges = [
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

  // ── Router Node ──────────────────────────────────────────────────────

  const routerNode: ConversationFlowConversationNode = {
    id: 'router',
    type: 'conversation',
    instruction: { type: 'prompt', text: FINANCIAL_ROUTER_PROMPT },
    edges: [
      equationEdge([eqVar('{{call_type}}', '==', 'payment')], 'payment_node', 'Payment'),
      equationEdge([eqVar('{{call_type}}', '==', 'benefits')], 'benefits_node', 'Benefits'),
    ],
    else_edge: { destination_node_id: 'payment_node' },
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
      ...commonExitEdges,
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
      'checkAvailability',
      'bookAppointment',
    ],
    edges: [
      promptEdge(
        'Patient wants to schedule an appointment to use their benefits.',
        'booking_node',
        'Schedule appointment',
      ),
      ...commonExitEdges,
    ],
  };

  // ── Booking Sub-Node ─────────────────────────────────────────────────

  const bookingNode: ConversationFlowConversationNode = {
    id: 'booking_node',
    type: 'conversation',
    instruction: {
      type: 'prompt',
      text: hydratePrompt(
        `Help {{patient_name}} schedule an appointment at {{clinic_name}} to use their insurance benefits before they expire.
Use scheduling tools to find available times and book. Be efficient.`,
        cn,
        cp,
      ),
    },
    tool_ids: ['lookupPatient', 'checkAvailability', 'bookAppointment', 'getAppointments'],
    edges: [
      promptEdge(
        'Appointment booked successfully or patient defers.',
        'end_call',
        'Complete',
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
    bookingNode,
    endCallNode,
    endDncNode,
    transferBillingNode,
  ];

  return {
    start_speaker: 'agent',
    model_choice: {
      type: 'cascading',
      model: 'gpt-4.1',
      high_priority: true,
    },
    global_prompt: FINANCIAL_GLOBAL_PROMPT,
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
    },
    tools: allTools,
    start_node_id: 'router',
    nodes,
  };
}
