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
  PATIENT_RECORDS_TOOLS,
  INSURANCE_TOOLS,
  PAYMENT_TOOLS,
  BOOKING_TOOLS,
  APPOINTMENT_MGMT_TOOLS,
  RECEPTIONIST_TOOLS,
  INSURANCE_BILLING_TOOLS,
  PMS_TOOLS,
  PMS_SYSTEM_PROMPT_ADDITION,
} from '../vapi-pms-tools.config';

import {
  DENTAL_CLINIC_TEMPLATE_VERSION,
  DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME,
} from './dental-clinic.template';

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

// ---------------------------------------------------------------------------
// Knowledge Base Categories
// ---------------------------------------------------------------------------

/**
 * Knowledge base categories for organizing clinic documents in the wizard UI.
 *
 * Categories are used to help users organize their uploads. At deployment time,
 * all files across categories are merged into a **single Vapi query tool per
 * clinic** (named `kb-{accountId-prefix}`). This avoids cross-clinic
 * contamination while keeping tool count low.
 */
export const KB_CATEGORIES = [
  {
    id: 'clinic-info',
    label: 'Clinic Information',
    description: 'Business hours, location, directions, parking, contact details',
  },
  {
    id: 'services',
    label: 'Services & Procedures',
    description: 'Dental services, treatments, pricing information',
  },
  {
    id: 'insurance',
    label: 'Insurance & Coverage',
    description: 'Accepted plans, coverage policies, billing FAQs',
  },
  {
    id: 'providers',
    label: 'Doctors & Providers',
    description: 'Doctor biographies, specialties, credentials',
  },
  {
    id: 'policies',
    label: 'Office Policies',
    description: 'Cancellation rules, new patient requirements, payment terms',
  },
  {
    id: 'faqs',
    label: 'FAQs',
    description: 'Common questions, preparation & aftercare instructions',
  },
] as const;

export type KBCategoryId = (typeof KB_CATEGORIES)[number]['id'];

/**
 * Knowledge base files organized by category.
 * Each key is a category id, value is an array of Vapi file IDs.
 */
export interface KnowledgeBaseConfig {
  [categoryId: string]: string[];
}

/**
 * Assistants that should have access to the clinic's knowledge base query tool.
 */
export const KB_ASSISTANTS = [
  // v4.1: all assistants get KB access to avoid unnecessary handoffs and hallucination
  'Receptionist',
  'Booking Agent',
  'Appointment Management',
  'Patient Records',
  'Insurance & Billing',
  'Emergency',
  // v3.x legacy names (for backward compat with existing squads)
  'Triage Receptionist',
  'Clinic Information',
  'Insurance',
  'Scheduling',
  'Payment & Billing',
];

/** Runtime config injected during squad creation (not stored in template) */
export interface RuntimeConfig {
  webhookUrl: string;
  webhookSecret?: string;
  /** @deprecated Use knowledgeBaseConfig instead */
  knowledgeFileIds?: string[];
  /** Knowledge base files organized by category for query tools */
  knowledgeBaseConfig?: KnowledgeBaseConfig;
  /** Clinic's original phone number for emergency human transfers (E.164 format) */
  clinicPhoneNumber?: string;
  /**
   * Map of function name → Vapi standalone tool ID.
   *
   * When provided, function tools are referenced by `model.toolIds` instead
   * of being embedded inline. This makes them visible in the Vapi Tools UI
   * and reusable across assistants.
   */
  toolIdMap?: Map<string, string>;
  /**
   * Vapi Custom Credential ID for server authentication.
   *
   * When set, all assistant `server` configs and tool `server` configs
   * use `credentialId` instead of inline `secret`. This shows credentials
   * properly in the Vapi dashboard.
   */
  vapiCredentialId?: string;
  /**
   * Single Vapi query tool ID for this clinic's knowledge base.
   * Named `kb-{accountId-prefix}` and shared across all assistants that
   * need KB access. Set by `ensureClinicQueryTool`.
   */
  queryToolId?: string;
  /** Human-readable name of the query tool (for prompt injection). */
  queryToolName?: string;
  /**
   * Clinic account ID embedded in assistant metadata.
   * Used by the backend webhook to resolve the account without
   * relying on phone-number lookups (supports multi-number / outbound).
   */
  accountId?: string;
}

// ---------------------------------------------------------------------------
// Phone number helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a phone number to E.164 format (+1XXXXXXXXXX).
 * Returns `null` if the number cannot be normalised.
 */
function toE164(raw: string): string | null {
  // Strip everything except digits and a leading +
  const cleaned = raw.replace(/[^\d+]/g, '');

  // Already E.164
  if (/^\+1\d{10}$/.test(cleaned)) return cleaned;

  // Has +, but not +1XXXXXXXXXX — might be another country, still E.164
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;

  // 11 digits starting with 1 (e.g. 14165551234)
  if (/^1\d{10}$/.test(cleaned)) return `+${cleaned}`;

  // 10 digits (e.g. 4165551234) — assume North American
  if (/^\d{10}$/.test(cleaned)) return `+1${cleaned}`;

  return null;
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
  // v4.0 focused tool groups
  booking: BOOKING_TOOLS,
  appointmentMgmt: APPOINTMENT_MGMT_TOOLS,
  receptionist: RECEPTIONIST_TOOLS,
  insuranceBilling: INSURANCE_BILLING_TOOLS,
  // v3.x legacy groups (backward compat)
  scheduling: SCHEDULING_TOOLS,
  emergency: EMERGENCY_TOOLS,
  clinicInfo: CLINIC_INFO_TOOLS,
  patientRecords: PATIENT_RECORDS_TOOLS,
  insurance: INSURANCE_TOOLS,
  payment: PAYMENT_TOOLS,
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
  const versionMetadata: Record<string, unknown> = {
    templateVersion: DENTAL_CLINIC_TEMPLATE_VERSION,
    templateDisplayName: DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME,
    deployedAt: new Date().toISOString(),
  };

  if (runtime.accountId) {
    versionMetadata.accountId = runtime.accountId;
  }

  const members = template.members.map((member) => {
    const payload = buildMemberPayload(member, variables, runtime);
    // Tag each assistant with version metadata
    if (payload.assistant && typeof payload.assistant === 'object') {
      (payload.assistant as Record<string, unknown>).metadata = versionMetadata;
    }
    return payload;
  });

  return {
    name: `${variables.clinicName} - ${template.displayName}`,
    members,
  };
}

/**
 * Build the fully-hydrated system prompt for a single template member.
 *
 * This applies placeholder replacement, PMS injection, KB instructions,
 * human-handoff injection, and the multilingual suffix — the same pipeline
 * used during full squad creation, but returns only the prompt string.
 */
export function buildMemberSystemPrompt(
  member: SquadMemberTemplate,
  vars: TemplateVariables,
  runtime: Pick<RuntimeConfig, 'queryToolId' | 'queryToolName' | 'clinicPhoneNumber'>,
): string {
  const a = member.assistant;

  let systemPrompt = hydratePlaceholders(a.systemPrompt, vars);

  const pmsToolGroups = ['scheduling', 'booking', 'appointmentMgmt', 'emergency'];
  if (pmsToolGroups.includes(a.toolGroup)) {
    systemPrompt = appendPmsPrompt(systemPrompt, vars);
  }

  if (runtime.queryToolId && KB_ASSISTANTS.includes(a.name)) {
    const toolName = runtime.queryToolName || 'clinic-kb';
    systemPrompt += `\n\n## KNOWLEDGE BASE\nYou have access to the clinic's knowledge base through the '${toolName}' query tool. When the caller asks about clinic information, services, insurance, doctors, office policies, hours, pricing, or anything specific to this clinic, use the '${toolName}' tool to search for accurate, verified information. Always prefer knowledge base results over guessing.`;
  }

  if (runtime.clinicPhoneNumber && toE164(runtime.clinicPhoneNumber)) {
    systemPrompt += `\n\n## HUMAN HANDOFF\nIf the caller asks to speak with a human, a person, a receptionist, or someone at the clinic at any time, use the transferCall tool IMMEDIATELY. Do not try to persuade them to stay with the AI. Say: "Of course, one moment." and call the transferCall tool. Do NOT say "transferring", "connecting you", or mention any team/agent/specialist names.`;
  }

  systemPrompt += `\n\n## CONVERSATION FLOW — CRITICAL
You are on a live phone call. The caller expects a natural, continuous conversation. Follow these rules at ALL times:

1. **NEVER go silent.** After every tool call — success or failure — you MUST immediately speak. Silence loses the caller.
2. **Read tool results carefully.** Results prefixed with [SUCCESS] mean the action completed. Results prefixed with [ERROR] mean it failed.
3. **On [ERROR]: STOP and fix.** Do NOT continue to the next step. Do NOT say the action was completed. The error tells you what is missing — ask the caller for it, then retry the SAME tool. Example: if createPatient returns [ERROR] saying phone is required, ask "Could I also get your phone number?" and retry createPatient with the phone number.
4. **On [SUCCESS]: move to the next step.** Follow the [NEXT STEP] instruction immediately.
5. **NEVER HALLUCINATE RESULTS.** If a tool returned [ERROR], that action FAILED — do not tell the caller it succeeded. If you never called a tool (e.g., bookAppointment), do not tell the caller the action was done. You may ONLY confirm an action if the tool returned [SUCCESS].
6. **Never repeat yourself.** If you already told the caller something, do not say it again.
7. **You lead the conversation.** After completing each action, proactively move forward or ask "Is there anything else I can help you with?"
8. **INVISIBLE HANDOFFS.** When calling any handoff tool, say ONLY a brief natural phrase (e.g., "Sure, I can help with that"). NEVER mention agent names, transfers, connections, specialists, or teams.
9. **NO PLACEHOLDER VALUES.** Never pass template variables like "{{call.customer.number}}" or "{{now}}" as tool arguments. Only pass real values (actual phone digits, actual names, actual dates). If you don't have a value, ask the caller for it.`;

  systemPrompt += `\n\n## LANGUAGE\nYou are multilingual. Detect the language the caller is speaking and respond in that same language throughout the conversation. You support English, French, and any other language the caller may speak. If the caller switches languages mid-conversation, seamlessly switch with them. Maintain the same professional tone regardless of language.`;

  return systemPrompt;
}

/**
 * Build hydrated system prompts for every member in a template.
 * Returns an array of `{ assistantName, systemPrompt }` that can be
 * matched against live Vapi assistants by name and PATCHed in-place.
 */
export function buildAllMemberPrompts(
  template: DentalClinicTemplateConfig,
  vars: TemplateVariables,
  runtime: Pick<RuntimeConfig, 'queryToolId' | 'queryToolName' | 'clinicPhoneNumber'>,
): { assistantName: string; systemPrompt: string }[] {
  return template.members.map((member) => ({
    assistantName: member.assistant.name,
    systemPrompt: buildMemberSystemPrompt(member, vars, runtime),
  }));
}

function buildMemberPayload(
  member: SquadMemberTemplate,
  vars: TemplateVariables,
  runtime: RuntimeConfig,
): Record<string, unknown> {
  const a = member.assistant;

  const systemPrompt = buildMemberSystemPrompt(member, vars, runtime);

  // Resolve tool definitions from template's toolGroup and extraTools
  const rawTools: unknown[] = [
    ...resolveToolGroup(a.toolGroup),
    ...(a.extraTools ?? []),
  ];

  // Separate function tools (standalone via toolIds) from other inline tools
  const standaloneToolIds: string[] = [];
  const inlineTools: unknown[] = [];

  if (runtime.toolIdMap && runtime.toolIdMap.size > 0) {
    // Standalone mode: resolve function tools to Vapi tool IDs
    for (const tool of rawTools) {
      const t = tool as any;
      if (t.type === 'function' && t.function?.name) {
        const toolId = runtime.toolIdMap.get(t.function.name);
        if (toolId) {
          standaloneToolIds.push(toolId);
        }
      } else {
        // Non-function tools (transferCall, endCall) stay inline
        inlineTools.push(t);
      }
    }
  } else {
    // Fallback: embed all tools inline (legacy mode)
    for (const tool of rawTools) {
      const cloned = JSON.parse(JSON.stringify(tool));
      if (cloned.type === 'function' && runtime.webhookUrl) {
        cloned.server = {
          ...cloned.server,
          url: runtime.webhookUrl,
          ...(runtime.webhookSecret ? { secret: runtime.webhookSecret } : {}),
        };
      }
      inlineTools.push(cloned);
    }
  }

  // Inject transferCall tool for human handoff when clinic phone is available.
  // ALL assistants get this so the caller can say "let me speak with a human" at any time.
  if (runtime.clinicPhoneNumber) {
    const e164Number = toE164(runtime.clinicPhoneNumber);
    if (e164Number) {
      inlineTools.push({
        type: 'transferCall',
        destinations: [
          {
            type: 'number',
            number: e164Number,
            message: 'Let me connect you with our team right now.',
            description:
              'Connect to the clinic staff when the caller asks to speak with a human, or for any emergency or urgent matter',
          },
        ],
      });
    }
  }

  // Build model config
  const modelConfig: Record<string, unknown> = {
    provider: a.model.provider,
    model: a.model.model,
    systemPrompt,
    temperature: a.model.temperature,
    maxTokens: a.model.maxTokens,
  };

  // Add clinic query tool for assistants with KB access.
  // Must be in standaloneToolIds so it flows through assistantPayload.toolIds
  // and gets picked up by buildAssistantPayload in vapi.service.ts.
  if (runtime.queryToolId && KB_ASSISTANTS.includes(a.name)) {
    if (!standaloneToolIds.includes(runtime.queryToolId)) {
      standaloneToolIds.push(runtime.queryToolId);
    }
  }

  // Standalone tools referenced by ID (visible in Vapi Tools UI)
  if (standaloneToolIds.length > 0) {
    modelConfig.toolIds = standaloneToolIds;
  }

  if (
    runtime.knowledgeFileIds &&
    runtime.knowledgeFileIds.length > 0 &&
    (a.name === 'Triage Receptionist' || a.name === 'Clinic Information' || a.name === 'Receptionist')
  ) {
    // Legacy fallback: use model.knowledgeBase if no query tools configured
    modelConfig.knowledgeBase = {
      provider: 'canonical',
      topK: a.name === 'Receptionist' ? 5 : a.name === 'Triage Receptionist' ? 3 : 5,
      fileIds: runtime.knowledgeFileIds,
    };
  }

  // Build assistant payload
  const assistantPayload: Record<string, unknown> = {
    name: a.name,
    transcriber: {
      provider: 'deepgram',
      model: 'nova-3',
      language: 'multi',
    },
    voice: { ...a.voice },
    model: modelConfig,
    firstMessage: hydratePlaceholders(a.firstMessage, vars),
    firstMessageMode: a.firstMessageMode,
    recordingEnabled: a.recordingEnabled,
    serverUrl: runtime.webhookUrl,
    serverUrlSecret: runtime.webhookSecret,
    startSpeakingPlan: { ...a.startSpeakingPlan },
    stopSpeakingPlan: { ...a.stopSpeakingPlan },
    ...(a.silenceTimeoutSeconds && { silenceTimeoutSeconds: a.silenceTimeoutSeconds }),
  };

  // Pass Vapi credential ID so the assistant uses credential-based auth
  if (runtime.vapiCredentialId) {
    assistantPayload.credentialId = runtime.vapiCredentialId;
  }

  // Standalone toolIds go in the assistant config for createAssistant to pick up
  if (standaloneToolIds.length > 0) {
    assistantPayload.toolIds = standaloneToolIds;
  }

  // Inline tools (transferCall, endCall, or legacy function tools)
  if (inlineTools.length > 0) {
    assistantPayload.tools = inlineTools;
  }

  // Hooks: safety net for conversation continuity.
  // If the caller is silent after the assistant speaks (e.g., after a tool call),
  // these hooks nudge the conversation forward instead of letting it stall.
  assistantPayload.hooks = [
    {
      on: 'customer.speech.timeout',
      options: {
        timeoutSeconds: 8,
        triggerMaxCount: 3,
        triggerResetMode: 'onUserSpeech',
      },
      do: [
        {
          type: 'say',
          prompt: 'The caller has been silent. Based on the conversation so far in {{transcript}}, briefly continue with the next step in your workflow or ask if they need anything else. Be concise.',
        },
      ],
      name: 'continue_after_silence',
    },
    {
      on: 'customer.speech.timeout',
      options: {
        timeoutSeconds: 20,
        triggerMaxCount: 2,
        triggerResetMode: 'onUserSpeech',
      },
      do: [
        {
          type: 'say',
          exact: 'Are you still there? I want to make sure I can help you with everything you need.',
        },
      ],
      name: 'check_still_there',
    },
  ];

  // Analysis plan: enable summaryPlan for automatic call summaries.
  // Structured data extraction is now handled by standalone Vapi Structured Outputs
  // (created via POST /structured-output and linked to assistants by ID).
  // See ensureCallAnalysisOutput() in vapi.service.ts.
  assistantPayload.analysisPlan = {
    summaryPlan: {
      enabled: true,
    },
    successEvaluationPlan: {
      enabled: false,
    },
  };

  // v4.1: Convert handoffDestinations to assistantDestinations on the squad member.
  // Vapi's POST /assistant API does NOT accept a `tools` property, and handoff tools
  // in model.tools are not recognized for squad routing. The only approach that creates
  // visible connections in the Vapi dashboard is `assistantDestinations` at the squad
  // member level. Vapi auto-generates transfer tools for the LLM from these.
  if (member.handoffDestinations && member.handoffDestinations.length > 0) {
    const handoffAsDests = member.handoffDestinations.map((dest) => ({
      type: 'assistant' as const,
      assistantName: dest.assistantName,
      description: dest.description,
      message: ' ',
    }));

    return {
      assistant: assistantPayload,
      assistantDestinations: handoffAsDests,
    };
  }

  // v3.x fallback: use legacy assistantDestinations if no handoffDestinations
  const legacyDestinations = member.assistantDestinations ?? [];
  if (legacyDestinations.length > 0) {
    const silentDestinations = legacyDestinations.map((dest) => ({
      ...dest,
      message: (dest as any).message ?? ' ',
    }));

    return {
      assistant: assistantPayload,
      assistantDestinations: silentDestinations,
    };
  }

  return {
    assistant: assistantPayload,
  };
}

/**
 * Append the PMS system prompt addition to a scheduling/booking prompt.
 * Tries insertion before "## APPOINTMENT TYPES" or "## WORKFLOW" sections,
 * falls back to appending at the end.
 */
function appendPmsPrompt(
  prompt: string,
  _vars: TemplateVariables,
): string {
  const insertionPoints = ['## APPOINTMENT TYPES', '## WORKFLOW'];
  for (const point of insertionPoints) {
    const idx = prompt.indexOf(point);
    if (idx !== -1) {
      return (
        prompt.slice(0, idx) +
        PMS_SYSTEM_PROMPT_ADDITION +
        '\n\n' +
        prompt.slice(idx)
      );
    }
  }

  return prompt + '\n\n' + PMS_SYSTEM_PROMPT_ADDITION;
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
      destinations: template.members.map((m) => {
        const dests = m.handoffDestinations
          ? m.handoffDestinations.map((d) => d.assistantName)
          : (m.assistantDestinations ?? []).map((d) => d.assistantName);
        return { name: m.assistant.name, destinations: dests };
      }),
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
            provider: 'openai',
            voiceId: 'nova',
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
        handoffDestinations: (dest.destinations ?? []).map((d: string) => ({
          assistantName: d,
          description: '',
        })),
        // Legacy compat: also populate assistantDestinations for v3.x code paths
        assistantDestinations: (dest.destinations ?? []).map((d: string) => ({
          type: 'assistant' as const,
          assistantName: d,
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

// ---------------------------------------------------------------------------
// Standalone tool helpers
// ---------------------------------------------------------------------------

/**
 * Returns deduplicated array of all PMS function tool definitions.
 *
 * Pass this to `VapiService.ensureStandaloneTools()` before building the
 * squad payload to create/find tools in Vapi and get back the toolIdMap.
 */
export function getAllFunctionToolDefinitions(): any[] {
  return PMS_TOOLS;
}

/**
 * Inject runtime server config (webhookUrl, webhookSecret or credentialId) into tool
 * definitions before creating standalone tools.
 *
 * This ensures the standalone tools are created with the correct backend
 * endpoint — they persist in Vapi and don't get rebuilt every deploy.
 *
 * @param credentialId If provided, tools use credentialId instead of inline secret.
 */
export function prepareToolDefinitionsForCreation(
  toolDefs: any[],
  webhookUrl: string,
  webhookSecret?: string,
  credentialId?: string,
): any[] {
  return toolDefs.map((tool) => {
    const cloned = JSON.parse(JSON.stringify(tool));
    if (cloned.type === 'function') {
      if (credentialId) {
        cloned.server = {
          url: webhookUrl,
          credentialId,
          ...(cloned.server?.timeoutSeconds ? { timeoutSeconds: cloned.server.timeoutSeconds } : {}),
        };
      } else {
        cloned.server = {
          ...cloned.server,
          url: webhookUrl,
          ...(webhookSecret ? { secret: webhookSecret } : {}),
        };
      }
    }
    return cloned;
  });
}
