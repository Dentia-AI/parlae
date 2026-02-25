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
} from '../../retell-pms-tools.config';

// ---------------------------------------------------------------------------
// Flow version
// ---------------------------------------------------------------------------

export const CONVERSATION_FLOW_VERSION = 'cf-v1.0';

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
  ].map(toFlowTool).map(hydrateTool);

  // ------- Nodes -------

  const receptionistNode: ConversationFlowConversationNode = {
    id: 'receptionist',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_RECEPTIONIST_PROMPT, cn) },
    tool_ids: ['getProviders'],
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
        'Caller says goodbye, hangs up, or conversation is complete.',
        'end_call',
      ),
    ],
  };

  const bookingNode: ConversationFlowConversationNode = {
    id: 'booking',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_BOOKING_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'createPatient',
      'checkAvailability',
      'bookAppointment',
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
        'Booking is complete and caller has no other needs, or caller needs general help.',
        'receptionist',
      ),
      promptEdge(
        'Caller says goodbye or conversation is complete after booking.',
        'end_call',
      ),
    ],
  };

  const apptMgmtNode: ConversationFlowConversationNode = {
    id: 'appt_mgmt',
    type: 'conversation',
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
    instruction: { type: 'prompt', text: hydratePrompt(FLOW_EMERGENCY_PROMPT, cn) },
    tool_ids: [
      'lookupPatient',
      'createPatient',
      'checkAvailability',
      'bookAppointment',
    ],
    edges: [
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
    edges: [
      promptEdge(
        'Caller wants to book an appointment.',
        'booking',
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

  // Transfer call node (only if clinic phone is configured)
  if (config.clinicPhone) {
    nodes.push({
      id: 'transfer_clinic',
      type: 'transfer_call',
      transfer_destination: {
        type: 'predefined',
        number: config.clinicPhone.startsWith('+') ? config.clinicPhone : `+${config.clinicPhone}`,
      },
      speak_during_execution: true,
      instruction: {
        type: 'prompt',
        text: 'Let me get you help right now.',
      },
      edges: [
        promptEdge('Transfer complete.', 'end_call'),
      ],
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
    '## GLOBAL RULES (apply to ALL nodes)',
    '1. **LANGUAGE**: Always respond in the same language the caller is speaking. If they speak French, respond in French. If they switch mid-conversation, follow their lead.',
    '2. **NEVER give medical advice, diagnoses, or medication recommendations.** Redirect to scheduling a dental visit.',
    '3. Keep responses concise — under 30 seconds of speech.',
    '4. Use the caller\'s name when you know it.',
    '5. Show empathy for medical/dental concerns.',
    '6. NEVER mention internal system details like "nodes", "flow", "routing", or "transferring".',
    '7. Use natural spoken dates and times (e.g. "tomorrow at 2 PM"), never raw ISO formats.',
    '8. Phone numbers: read digit by digit with natural grouping.',
    '9. If a tool returns [ERROR], the action FAILED. Never tell the caller it succeeded.',
    '',
    '## SHARED STATE',
    'Dynamic variables {{patient_id}}, {{patient_name}}, and {{customer_phone}} persist across all nodes.',
    'If a previous node already identified the patient, do NOT re-ask for their info.',
  ].join('\n');

  return {
    start_speaker: 'agent',
    model_choice: {
      type: 'cascading',
      model: 'gpt-4.1',
    },
    global_prompt: globalPrompt,
    default_dynamic_variables: {
      customer_phone: '{{call.from_number}}',
      patient_id: '',
      patient_name: '',
      now: new Date().toISOString(),
    },
    tools: allTools,
    start_node_id: 'receptionist',
    nodes,
    ...(config.knowledgeBaseIds?.length
      ? { knowledge_base_ids: config.knowledgeBaseIds }
      : {}),
  };
}
