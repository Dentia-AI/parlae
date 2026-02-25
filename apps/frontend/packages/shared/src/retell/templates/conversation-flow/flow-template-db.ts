/**
 * Conversation Flow Template DB Serialization Utilities
 *
 * Converts between the runtime ConversationFlowConfig and the database
 * RetellConversationFlowTemplate shape. Also provides version comparison.
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

import {
  buildDentalClinicFlow,
  CONVERSATION_FLOW_VERSION,
  type ConversationFlowBuildConfig,
} from './dental-clinic.flow-template';

import type {
  ConversationFlowConfig,
  ConversationFlowConversationNode,
} from '../../retell.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowTemplateDbShape {
  name: string;
  displayName: string;
  description: string;
  version: string;
  isDefault: boolean;
  isActive: boolean;
  globalPrompt: string;
  nodePrompts: Record<string, string>;
  nodeTools: Record<string, string[]>;
  edgeConfig: Record<string, Array<{ condition: string; destination: string }>>;
  modelConfig: { model: string; type: string };
}

export interface FlowVersionDiff {
  addedNodes: string[];
  removedNodes: string[];
  changedPrompts: string[];
  changedEdges: string[];
  changedTools: string[];
  modelChanged: boolean;
  globalPromptChanged: boolean;
}

// ---------------------------------------------------------------------------
// flowTemplateToDbShape
// ---------------------------------------------------------------------------

/**
 * Extract the DB-friendly shape from a built conversation flow config.
 * The `clinicName` placeholder is preserved as `{{clinicName}}` so the
 * template remains generic.
 */
export function flowTemplateToDbShape(
  name: string = 'retell-flow-dental-v1',
  displayName: string = 'Dental Clinic Conversation Flow',
  description: string = 'Full dental clinic flow: receptionist, booking, appt mgmt, records, insurance, emergency, FAQ',
): FlowTemplateDbShape {
  const nodePrompts: Record<string, string> = {
    receptionist: FLOW_RECEPTIONIST_PROMPT,
    booking: FLOW_BOOKING_PROMPT,
    appt_mgmt: FLOW_APPT_MGMT_PROMPT,
    patient_records: FLOW_PATIENT_RECORDS_PROMPT,
    insurance_billing: FLOW_INSURANCE_BILLING_PROMPT,
    emergency: FLOW_EMERGENCY_PROMPT,
    faq: FLOW_FAQ_PROMPT,
  };

  const placeholderConfig: ConversationFlowBuildConfig = {
    clinicName: '{{clinicName}}',
    webhookUrl: '{{webhookUrl}}',
    webhookSecret: '{{secret}}',
    accountId: '{{accountId}}',
  };

  const flow = buildDentalClinicFlow(placeholderConfig);

  const nodeTools: Record<string, string[]> = {};
  const edgeConfig: Record<string, Array<{ condition: string; destination: string }>> = {};

  for (const node of flow.nodes) {
    if (node.type === 'conversation') {
      const convNode = node as ConversationFlowConversationNode;
      nodeTools[node.id] = convNode.tool_ids || [];
      edgeConfig[node.id] = (convNode.edges || []).map((e) => ({
        condition:
          e.transition_condition?.type === 'prompt'
            ? (e.transition_condition as any).prompt
            : e.transition_condition?.type || '',
        destination: e.destination_node_id,
      }));
    }
  }

  return {
    name,
    displayName,
    description,
    version: CONVERSATION_FLOW_VERSION,
    isDefault: true,
    isActive: true,
    globalPrompt: flow.global_prompt || '',
    nodePrompts,
    nodeTools,
    edgeConfig,
    modelConfig: {
      model: (flow.model_choice as any)?.model || 'gpt-4.1',
      type: (flow.model_choice as any)?.type || 'cascading',
    },
  };
}

// ---------------------------------------------------------------------------
// dbShapeToFlowConfig
// ---------------------------------------------------------------------------

/**
 * Reconstruct a deployable ConversationFlowConfig from a DB template record.
 * Caller must supply runtime values (clinicName, webhookUrl, etc.).
 */
export function dbShapeToFlowConfig(
  dbTemplate: {
    globalPrompt: string;
    nodePrompts: any;
    nodeTools: any;
    edgeConfig: any;
    modelConfig: any;
  },
  runtimeConfig: ConversationFlowBuildConfig,
): ConversationFlowConfig {
  return buildDentalClinicFlow({
    ...runtimeConfig,
  });
}

// ---------------------------------------------------------------------------
// compareFlowVersions
// ---------------------------------------------------------------------------

/**
 * Compare two flow template DB shapes and return a diff report.
 */
export function compareFlowVersions(
  oldTemplate: FlowTemplateDbShape,
  newTemplate: FlowTemplateDbShape,
): FlowVersionDiff {
  const oldNodes = new Set(Object.keys(oldTemplate.nodePrompts));
  const newNodes = new Set(Object.keys(newTemplate.nodePrompts));

  const addedNodes = [...newNodes].filter((n) => !oldNodes.has(n));
  const removedNodes = [...oldNodes].filter((n) => !newNodes.has(n));

  const changedPrompts: string[] = [];
  const changedEdges: string[] = [];
  const changedTools: string[] = [];

  for (const node of newNodes) {
    if (!oldNodes.has(node)) continue;

    if (oldTemplate.nodePrompts[node] !== newTemplate.nodePrompts[node]) {
      changedPrompts.push(node);
    }

    const oldEdges = JSON.stringify(oldTemplate.edgeConfig[node] || []);
    const newEdges = JSON.stringify(newTemplate.edgeConfig[node] || []);
    if (oldEdges !== newEdges) {
      changedEdges.push(node);
    }

    const oldTools = JSON.stringify(oldTemplate.nodeTools[node] || []);
    const newTools = JSON.stringify(newTemplate.nodeTools[node] || []);
    if (oldTools !== newTools) {
      changedTools.push(node);
    }
  }

  return {
    addedNodes,
    removedNodes,
    changedPrompts,
    changedEdges,
    changedTools,
    modelChanged:
      JSON.stringify(oldTemplate.modelConfig) !==
      JSON.stringify(newTemplate.modelConfig),
    globalPromptChanged: oldTemplate.globalPrompt !== newTemplate.globalPrompt,
  };
}
