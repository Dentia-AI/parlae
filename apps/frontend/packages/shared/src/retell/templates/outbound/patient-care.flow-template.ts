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
} from './patient-care-prompts';

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
  retellRescheduleAppointmentTool,
  retellCancelAppointmentTool,
  retellVerifyInsuranceCoverageTool,
} from '../../retell-pms-tools.config';

export const OUTBOUND_PATIENT_CARE_FLOW_VERSION = 'ob-pc-v1.0';

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

  const schedulingToolIds = [
    'lookupPatient',
    'checkAvailability',
    'bookAppointment',
    'getAppointments',
    'rescheduleAppointment',
    'cancelAppointment',
  ];

  // Common edges shared by most call-type nodes
  const commonExitEdges = [
    promptEdge(
      'Patient asks to stop calling, remove from list, or says "do not call".',
      'end_dnc',
      'DNC request',
    ),
    promptEdge(
      'Patient wants to schedule, reschedule, or cancel an appointment.',
      'booking_node',
      'Scheduling request',
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
    else_edge: { destination_node_id: 'recall_node' },
  };

  // ── Call Type Nodes ──────────────────────────────────────────────────

  const recallNode: ConversationFlowConversationNode = {
    id: 'recall_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_RECALL_PROMPT, cn, cp) },
    tool_ids: schedulingToolIds,
    edges: [...commonExitEdges],
  };

  const reminderNode: ConversationFlowConversationNode = {
    id: 'reminder_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_REMINDER_PROMPT, cn, cp) },
    tool_ids: ['lookupPatient', 'getAppointments', 'rescheduleAppointment', 'cancelAppointment'],
    edges: [...commonExitEdges],
  };

  const followupNode: ConversationFlowConversationNode = {
    id: 'followup_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_FOLLOWUP_PROMPT, cn, cp) },
    tool_ids: schedulingToolIds,
    edges: [
      promptEdge(
        'Patient reports severe pain, excessive bleeding, swelling, or fever.',
        'urgent_transfer',
        'Urgent symptoms',
      ),
      ...commonExitEdges,
    ],
  };

  const noshowNode: ConversationFlowConversationNode = {
    id: 'noshow_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_NOSHOW_PROMPT, cn, cp) },
    tool_ids: schedulingToolIds,
    edges: [...commonExitEdges],
  };

  const treatmentPlanNode: ConversationFlowConversationNode = {
    id: 'treatment_plan_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_TREATMENT_PLAN_PROMPT, cn, cp) },
    tool_ids: [...schedulingToolIds, 'verifyInsuranceCoverage'],
    edges: [...commonExitEdges],
  };

  const postopNode: ConversationFlowConversationNode = {
    id: 'postop_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_POSTOP_PROMPT, cn, cp) },
    tool_ids: schedulingToolIds,
    edges: [
      promptEdge(
        'Patient reports severe pain, excessive bleeding, swelling, or fever.',
        'urgent_transfer',
        'Urgent symptoms',
      ),
      ...commonExitEdges,
    ],
  };

  const reactivationNode: ConversationFlowConversationNode = {
    id: 'reactivation_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_REACTIVATION_PROMPT, cn, cp) },
    tool_ids: schedulingToolIds,
    edges: [...commonExitEdges],
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
      ...commonExitEdges,
    ],
  };

  const welcomeNode: ConversationFlowConversationNode = {
    id: 'welcome_node',
    type: 'conversation',
    instruction: { type: 'prompt', text: hydratePrompt(OUTBOUND_WELCOME_PROMPT, cn, cp) },
    tool_ids: schedulingToolIds,
    edges: [...commonExitEdges],
  };

  // ── Booking Sub-Node ─────────────────────────────────────────────────

  const bookingNode: ConversationFlowConversationNode = {
    id: 'booking_node',
    type: 'conversation',
    instruction: {
      type: 'prompt',
      text: hydratePrompt(
        `You are helping {{patient_name}} schedule an appointment at {{clinic_name}}.
Use the scheduling tools to find available times and book the appointment.
Be efficient — the patient didn't call you, so respect their time.
Once booked, confirm the details and return to wrapping up the call.`,
        cn,
        cp,
      ),
    },
    tool_ids: schedulingToolIds,
    edges: [
      promptEdge(
        'Appointment has been booked, rescheduled, or cancelled successfully.',
        'end_call',
        'Booking complete',
      ),
      promptEdge(
        'Patient changed their mind or wants to call back later.',
        'end_call',
        'Patient defers',
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
    bookingNode,
    endCallNode,
    endDncNode,
    urgentTransferNode,
  ];

  return {
    start_speaker: 'agent',
    model_choice: {
      type: 'cascading',
      model: 'gpt-4.1',
      high_priority: true,
    },
    global_prompt: OUTBOUND_GLOBAL_PROMPT,
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
    },
    tools: allTools,
    start_node_id: 'router',
    nodes,
  };
}
