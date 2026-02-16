/**
 * Template Utilities
 *
 * Hydrates squad templates with clinic-specific values and injects
 * runtime dependencies (tools, webhook config, knowledge base).
 */

import {
  SCHEDULING_TOOLS,
  EMERGENCY_TOOLS,
  CLINIC_INFO_TOOLS,
  PMS_SYSTEM_PROMPT_ADDITION,
} from '../vapi-pms-tools.config';

import type {
  DentalClinicTemplateConfig,
  SquadMemberTemplate,
} from './dental-clinic.template';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Variables replaced in {{placeholder}} strings */
export interface TemplateVariables {
  clinicName: string;
  clinicHours?: string;
  clinicLocation?: string;
  clinicInsurance?: string;
  clinicServices?: string;
}

/** Runtime config injected during squad creation (not stored in template) */
export interface RuntimeConfig {
  webhookUrl: string;
  webhookSecret?: string;
  knowledgeFileIds?: string[];
  /** Clinic's original phone number for emergency human transfers (E.164 format) */
  clinicPhoneNumber?: string;
}

// ---------------------------------------------------------------------------
// Placeholder hydration
// ---------------------------------------------------------------------------

/**
 * Replace all `{{key}}` placeholders in a string with values from `vars`.
 * Unmatched placeholders (like `{{call.customer.number}}`) are left as-is
 * so Vapi can resolve them at runtime.
 */
export function hydratePlaceholders(
  text: string,
  vars: TemplateVariables,
): string {
  const defaults: Record<string, string> = {
    clinicName: vars.clinicName,
    clinicHours: vars.clinicHours || 'Contact us for current hours',
    clinicLocation: vars.clinicLocation || '',
    clinicInsurance:
      vars.clinicInsurance ||
      'We accept most major dental insurance plans including Blue Cross Blue Shield, Aetna, Cigna, UnitedHealthcare, Medicare, and Medicaid. We also offer competitive self-pay rates.',
    clinicServices:
      vars.clinicServices ||
      'Full range of dental services including cleanings, exams, fillings, crowns, root canals, extractions, and cosmetic dentistry',
  };

  let result = text;

  for (const [key, value] of Object.entries(defaults)) {
    // Replace all occurrences of {{key}}
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      value,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool group resolution
// ---------------------------------------------------------------------------

const TOOL_GROUPS: Record<string, unknown[]> = {
  scheduling: SCHEDULING_TOOLS,
  emergency: EMERGENCY_TOOLS,
  clinicInfo: CLINIC_INFO_TOOLS,
  none: [],
};

function resolveToolGroup(groupKey: string): unknown[] {
  return TOOL_GROUPS[groupKey] ?? [];
}

// ---------------------------------------------------------------------------
// Squad builder
// ---------------------------------------------------------------------------

/**
 * Build a Vapi-ready squad creation payload from a template.
 *
 * Steps:
 * 1. Replace {{placeholder}} variables with clinic values
 * 2. Inject PMS_SYSTEM_PROMPT_ADDITION for scheduling assistant
 * 3. Resolve tool groups to actual tool definitions
 * 4. Add webhook / knowledge base config
 */
export function buildSquadPayloadFromTemplate(
  template: DentalClinicTemplateConfig,
  variables: TemplateVariables,
  runtime: RuntimeConfig,
): Record<string, unknown> {
  const members = template.members.map((member) =>
    buildMemberPayload(member, variables, runtime),
  );

  return {
    name: `${variables.clinicName} - ${template.displayName}`,
    members,
  };
}

function buildMemberPayload(
  member: SquadMemberTemplate,
  vars: TemplateVariables,
  runtime: RuntimeConfig,
): Record<string, unknown> {
  const a = member.assistant;

  // Hydrate system prompt
  let systemPrompt = hydratePlaceholders(a.systemPrompt, vars);

  // Inject PMS prompt addition for scheduling assistant
  if (a.toolGroup === 'scheduling') {
    systemPrompt = appendPmsPrompt(systemPrompt, vars);
  }

  // Resolve tools
  const tools: unknown[] = [
    ...resolveToolGroup(a.toolGroup),
    ...(a.extraTools ?? []),
  ];

  // Inject transferCall tool for Emergency Transfer when clinic phone is available
  if (a.name === 'Emergency Transfer' && runtime.clinicPhoneNumber) {
    tools.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: runtime.clinicPhoneNumber,
          message: 'Transferring to the clinic for immediate assistance.',
          description:
            'Transfer to the clinic front desk for any emergency or urgent matter that needs human attention',
        },
      ],
    });
  }

  // Build model config
  const modelConfig: Record<string, unknown> = {
    provider: a.model.provider,
    model: a.model.model,
    systemPrompt,
    temperature: a.model.temperature,
    maxTokens: a.model.maxTokens,
  };

  // Add knowledge base for assistants that need it (Triage + Clinic Info)
  if (
    runtime.knowledgeFileIds &&
    runtime.knowledgeFileIds.length > 0 &&
    (a.name === 'Triage Receptionist' || a.name === 'Clinic Information')
  ) {
    modelConfig.knowledgeBase = {
      provider: 'canonical',
      topK: a.name === 'Triage Receptionist' ? 3 : 5,
      fileIds: runtime.knowledgeFileIds,
    };
  }

  // Build assistant payload
  const assistantPayload: Record<string, unknown> = {
    name: a.name,
    voice: { ...a.voice },
    model: modelConfig,
    firstMessage: hydratePlaceholders(a.firstMessage, vars),
    firstMessageMode: a.firstMessageMode,
    recordingEnabled: a.recordingEnabled,
    serverUrl: runtime.webhookUrl,
    serverUrlSecret: runtime.webhookSecret,
    startSpeakingPlan: { ...a.startSpeakingPlan },
    stopSpeakingPlan: { ...a.stopSpeakingPlan },
  };

  // Add tools if any
  if (tools.length > 0) {
    assistantPayload.tools = tools;
  }

  // Add analysis schema if present
  if (a.analysisSchema) {
    assistantPayload.analysisSchema = a.analysisSchema;
  }

  return {
    assistant: assistantPayload,
    assistantDestinations: member.assistantDestinations,
  };
}

/**
 * Append the PMS system prompt addition to the scheduling prompt.
 * Inserts it after the "## STYLE & TONE" section (before workflows).
 */
function appendPmsPrompt(
  schedulingPrompt: string,
  vars: TemplateVariables,
): string {
  // Insert PMS addition before the "## APPOINTMENT TYPES" section
  const insertionPoint = '## APPOINTMENT TYPES';
  const idx = schedulingPrompt.indexOf(insertionPoint);

  if (idx !== -1) {
    return (
      schedulingPrompt.slice(0, idx) +
      PMS_SYSTEM_PROMPT_ADDITION +
      '\n\n' +
      schedulingPrompt.slice(idx)
    );
  }

  // Fallback: append at the end
  return schedulingPrompt + '\n\n' + PMS_SYSTEM_PROMPT_ADDITION;
}

// ---------------------------------------------------------------------------
// Template → AgentTemplate model conversion
// ---------------------------------------------------------------------------

/**
 * Convert a DentalClinicTemplateConfig to the shape stored in the
 * AgentTemplate Prisma model. Useful when saving a built-in template to DB.
 */
export function templateToDbShape(template: DentalClinicTemplateConfig) {
  return {
    name: `${template.name}-${template.version}`,
    displayName: template.displayName,
    description: `Built-in ${template.displayName} template`,
    version: template.version,
    category: template.category,
    isDefault: true,
    squadConfig: {
      memberCount: template.members.length,
      memberNames: template.members.map((m) => m.assistant.name),
      destinations: template.members.map((m) => ({
        name: m.assistant.name,
        destinations: m.assistantDestinations.map((d) => d.assistantName),
      })),
    },
    assistantConfig: {
      members: template.members.map((m) => ({
        name: m.assistant.name,
        firstMessage: m.assistant.firstMessage,
        firstMessageMode: m.assistant.firstMessageMode,
        voice: m.assistant.voice,
        recordingEnabled: m.assistant.recordingEnabled,
        startSpeakingPlan: m.assistant.startSpeakingPlan,
        stopSpeakingPlan: m.assistant.stopSpeakingPlan,
        analysisSchema: m.assistant.analysisSchema,
      })),
    },
    toolsConfig: {
      groups: template.members.reduce(
        (acc, m) => {
          acc[m.assistant.name] = m.assistant.toolGroup;
          return acc;
        },
        {} as Record<string, string>,
      ),
    },
    modelConfig: {
      members: template.members.map((m) => ({
        name: m.assistant.name,
        provider: m.assistant.model.provider,
        model: m.assistant.model.model,
        temperature: m.assistant.model.temperature,
        maxTokens: m.assistant.model.maxTokens,
        systemPrompt: m.assistant.systemPrompt,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// DB template → DentalClinicTemplateConfig conversion
// ---------------------------------------------------------------------------

/**
 * Reconstruct a DentalClinicTemplateConfig from an AgentTemplate DB record.
 * This allows loading a saved template and building a squad from it.
 */
export function dbShapeToTemplate(
  dbRecord: {
    name: string;
    displayName: string;
    version: string;
    category: string;
    squadConfig: any;
    assistantConfig: any;
    toolsConfig: any;
    modelConfig: any;
  },
): DentalClinicTemplateConfig {
  const assistantConfigs = dbRecord.assistantConfig?.members ?? [];
  const modelConfigs = dbRecord.modelConfig?.members ?? [];
  const toolGroups = dbRecord.toolsConfig?.groups ?? {};
  const destinations = dbRecord.squadConfig?.destinations ?? [];

  const members: SquadMemberTemplate[] = assistantConfigs.map(
    (ac: any, idx: number) => {
      const mc = modelConfigs[idx] ?? {};
      const dest = destinations[idx] ?? {};

      return {
        assistant: {
          name: ac.name,
          systemPrompt: mc.systemPrompt ?? '',
          firstMessage: ac.firstMessage ?? '',
          firstMessageMode:
            ac.firstMessageMode ??
            'assistant-speaks-first-with-model-generated-message',
          voice: ac.voice ?? {
            provider: 'elevenlabs',
            voiceId: '21m00Tcm4TlvDq8ikWAM',
            stability: 0.5,
            similarityBoost: 0.75,
          },
          model: {
            provider: mc.provider ?? 'openai',
            model: mc.model ?? 'gpt-4o',
            temperature: mc.temperature ?? 0.7,
            maxTokens: mc.maxTokens ?? 400,
          },
          recordingEnabled: ac.recordingEnabled ?? true,
          startSpeakingPlan: ac.startSpeakingPlan ?? {
            waitSeconds: 0.4,
            smartEndpointingPlan: { provider: 'livekit' },
          },
          stopSpeakingPlan: ac.stopSpeakingPlan ?? {
            numWords: 0,
            voiceSeconds: 0.2,
            backoffSeconds: 1,
          },
          toolGroup: toolGroups[ac.name] ?? 'none',
          analysisSchema: ac.analysisSchema,
          extraTools: ac.extraTools,
        },
        assistantDestinations: (dest.destinations ?? []).map((d: string) => ({
          type: 'assistant' as const,
          assistantName: d,
          // Descriptions are not stored in compact DB form;
          // the hydration step or the built-in template provides them.
          description: '',
        })),
      };
    },
  );

  return {
    name: dbRecord.name,
    displayName: dbRecord.displayName,
    version: dbRecord.version,
    category: dbRecord.category,
    members,
  };
}
