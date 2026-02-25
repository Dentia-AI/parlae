jest.mock('../vapi-pms-tools.config', () => ({
  SCHEDULING_TOOLS: [{ type: 'function', function: { name: 'checkAvailability' } }],
  EMERGENCY_TOOLS: [{ type: 'function', function: { name: 'emergencyTriage' } }],
  CLINIC_INFO_TOOLS: [],
  PATIENT_RECORDS_TOOLS: [{ type: 'function', function: { name: 'searchPatient' } }],
  INSURANCE_TOOLS: [],
  PAYMENT_TOOLS: [],
  BOOKING_TOOLS: [{ type: 'function', function: { name: 'bookAppointment' } }],
  APPOINTMENT_MGMT_TOOLS: [{ type: 'function', function: { name: 'cancelAppointment' } }],
  RECEPTIONIST_TOOLS: [{ type: 'function', function: { name: 'receptionistLookup' } }],
  INSURANCE_BILLING_TOOLS: [{ type: 'function', function: { name: 'checkInsurance' } }],
  PMS_TOOLS: [
    { type: 'function', function: { name: 'bookAppointment' } },
    { type: 'function', function: { name: 'cancelAppointment' } },
  ],
  PMS_SYSTEM_PROMPT_ADDITION: '\n## PMS INTEGRATION\nUse PMS tools.',
}));

jest.mock('./dental-clinic.template', () => ({
  DENTAL_CLINIC_TEMPLATE_VERSION: 'v-test',
  DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME: 'Test Template',
}));

import {
  hydratePlaceholders,
  buildSquadPayloadFromTemplate,
  buildMemberSystemPrompt,
  buildAllMemberPrompts,
  templateToDbShape,
  dbShapeToTemplate,
  getAllFunctionToolDefinitions,
  prepareToolDefinitionsForCreation,
  KB_CATEGORIES,
  KB_ASSISTANTS,
  type TemplateVariables,
  type RuntimeConfig,
} from './template-utils';

import type {
  DentalClinicTemplateConfig,
  SquadMemberTemplate,
} from './dental-clinic.template';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<SquadMemberTemplate['assistant']> = {}): SquadMemberTemplate {
  return {
    assistant: {
      name: 'Receptionist',
      systemPrompt: 'Welcome to {{clinicName}}. Hours: {{clinicHours}}.',
      firstMessage: 'Hello from {{clinicName}}!',
      firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
      voice: { provider: 'openai', voiceId: 'nova' },
      model: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 400 },
      recordingEnabled: true,
      startSpeakingPlan: { waitSeconds: 0.4, smartEndpointingPlan: { provider: 'livekit' } },
      stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.2, backoffSeconds: 1 },
      toolGroup: 'receptionist',
      ...overrides,
    },
    handoffDestinations: [
      { assistantName: 'Booking Agent', description: 'handle bookings' },
    ],
  };
}

function makeTemplate(members?: SquadMemberTemplate[]): DentalClinicTemplateConfig {
  return {
    name: 'test-template',
    displayName: 'Test Template',
    version: 'v-test',
    category: 'dental',
    members: members ?? [makeMember()],
  };
}

const defaultVars: TemplateVariables = {
  clinicName: 'Bright Smiles Dental',
  clinicHours: '9am-5pm Mon-Fri',
  clinicLocation: '123 Main St',
};

const defaultRuntime: RuntimeConfig = {
  webhookUrl: 'https://api.example.com/vapi/webhook',
  webhookSecret: 'secret123',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('template-utils', () => {
  describe('hydratePlaceholders', () => {
    it('replaces known placeholders', () => {
      const result = hydratePlaceholders(
        'Welcome to {{clinicName}}. Hours: {{clinicHours}}.',
        defaultVars,
      );
      expect(result).toBe('Welcome to Bright Smiles Dental. Hours: 9am-5pm Mon-Fri.');
    });

    it('replaces multiple occurrences of the same placeholder', () => {
      const result = hydratePlaceholders(
        '{{clinicName}} is great. Visit {{clinicName}} today!',
        defaultVars,
      );
      expect(result).toBe('Bright Smiles Dental is great. Visit Bright Smiles Dental today!');
    });

    it('leaves Vapi runtime placeholders like {{call.customer.number}} untouched', () => {
      const result = hydratePlaceholders(
        'Call from {{call.customer.number}} to {{clinicName}}',
        defaultVars,
      );
      expect(result).toContain('{{call.customer.number}}');
      expect(result).toContain('Bright Smiles Dental');
    });

    it('uses empty string for missing optional vars', () => {
      const result = hydratePlaceholders('Hours: {{clinicHours}}', { clinicName: 'Test' });
      expect(result).toBe('Hours: ');
    });

    it('uses provided clinicInsurance when given', () => {
      const vars: TemplateVariables = {
        clinicName: 'Test',
        clinicInsurance: 'Delta Dental only',
      };
      const result = hydratePlaceholders('Insurance: {{clinicInsurance}}', vars);
      expect(result).toBe('Insurance: Delta Dental only');
    });

    it('uses provided clinicServices when given', () => {
      const vars: TemplateVariables = {
        clinicName: 'Test',
        clinicServices: 'Cleanings, Fillings',
      };
      const result = hydratePlaceholders('Services: {{clinicServices}}', vars);
      expect(result).toBe('Services: Cleanings, Fillings');
    });
  });

  describe('buildMemberSystemPrompt', () => {
    it('hydrates placeholders in the system prompt', () => {
      const member = makeMember();
      const prompt = buildMemberSystemPrompt(member, defaultVars, {});
      expect(prompt).toContain('Bright Smiles Dental');
      expect(prompt).toContain('9am-5pm Mon-Fri');
    });

    it('appends PMS prompt for scheduling/booking tool groups', () => {
      for (const toolGroup of ['scheduling', 'booking', 'appointmentMgmt', 'emergency']) {
        const member = makeMember({ toolGroup });
        const prompt = buildMemberSystemPrompt(member, defaultVars, {});
        expect(prompt).toContain('PMS INTEGRATION');
      }
    });

    it('does NOT append PMS prompt for non-scheduling tool groups', () => {
      const member = makeMember({ toolGroup: 'receptionist' });
      const prompt = buildMemberSystemPrompt(member, defaultVars, {});
      expect(prompt).not.toContain('PMS INTEGRATION');
    });

    it('appends KB instructions when queryToolId is set and assistant is in KB_ASSISTANTS', () => {
      const member = makeMember({ name: 'Receptionist' });
      const prompt = buildMemberSystemPrompt(member, defaultVars, {
        queryToolId: 'tool-123',
        queryToolName: 'clinic-kb',
      });
      expect(prompt).toContain('KNOWLEDGE BASE');
      expect(prompt).toContain("'clinic-kb'");
    });

    it('skips KB instructions when assistant is NOT in KB_ASSISTANTS', () => {
      const member = makeMember({ name: 'Unknown Agent' });
      const prompt = buildMemberSystemPrompt(member, defaultVars, {
        queryToolId: 'tool-123',
      });
      expect(prompt).not.toContain('KNOWLEDGE BASE');
    });

    it('appends human handoff instructions when clinicPhoneNumber is valid', () => {
      const member = makeMember();
      const prompt = buildMemberSystemPrompt(member, defaultVars, {
        clinicPhoneNumber: '+14165551234',
      });
      expect(prompt).toContain('HUMAN HANDOFF');
    });

    it('skips human handoff when phone number is invalid', () => {
      const member = makeMember();
      const prompt = buildMemberSystemPrompt(member, defaultVars, {
        clinicPhoneNumber: '123', // too short
      });
      expect(prompt).not.toContain('HUMAN HANDOFF');
    });

    it('always appends CONVERSATION FLOW and LANGUAGE sections', () => {
      const member = makeMember();
      const prompt = buildMemberSystemPrompt(member, defaultVars, {});
      expect(prompt).toContain('CONVERSATION FLOW');
      expect(prompt).toContain('LANGUAGE');
      expect(prompt).toContain('multilingual');
    });
  });

  describe('buildAllMemberPrompts', () => {
    it('returns a prompt for every template member', () => {
      const template = makeTemplate([
        makeMember({ name: 'Receptionist' }),
        makeMember({ name: 'Booking Agent', toolGroup: 'booking' }),
      ]);

      const prompts = buildAllMemberPrompts(template, defaultVars, {});

      expect(prompts).toHaveLength(2);
      expect(prompts[0]!.assistantName).toBe('Receptionist');
      expect(prompts[1]!.assistantName).toBe('Booking Agent');
      expect(prompts[0]!.systemPrompt).toContain('Bright Smiles Dental');
    });
  });

  describe('buildSquadPayloadFromTemplate', () => {
    it('generates a squad payload with the clinic name in the squad name', () => {
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, defaultRuntime);

      expect(payload.name).toContain('Bright Smiles Dental');
      expect(payload.name).toContain('Test Template');
    });

    it('includes members array with assistant payload', () => {
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, defaultRuntime);
      const members = payload.members as any[];

      expect(members).toHaveLength(1);
      expect(members[0].assistant).toBeDefined();
      expect(members[0].assistant.name).toBe('Receptionist');
    });

    it('attaches version metadata to each assistant', () => {
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, defaultRuntime);
      const members = payload.members as any[];

      expect(members[0].assistant.metadata).toEqual(
        expect.objectContaining({
          templateVersion: 'v-test',
          templateDisplayName: 'Test Template',
        }),
      );
    });

    it('includes accountId in metadata when provided', () => {
      const runtime: RuntimeConfig = { ...defaultRuntime, accountId: 'acc-123' };
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, runtime);
      const members = payload.members as any[];

      expect(members[0].assistant.metadata.accountId).toBe('acc-123');
    });

    it('sets serverUrl and serverUrlSecret on each assistant', () => {
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, defaultRuntime);
      const members = payload.members as any[];

      expect(members[0].assistant.serverUrl).toBe('https://api.example.com/vapi/webhook');
      expect(members[0].assistant.serverUrlSecret).toBe('secret123');
    });

    it('converts handoffDestinations to assistantDestinations', () => {
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, defaultRuntime);
      const members = payload.members as any[];

      expect(members[0].assistantDestinations).toBeDefined();
      expect(members[0].assistantDestinations[0].assistantName).toBe('Booking Agent');
      expect(members[0].assistantDestinations[0].type).toBe('assistant');
    });

    it('injects transferCall tool when clinicPhoneNumber is valid E.164', () => {
      const runtime: RuntimeConfig = { ...defaultRuntime, clinicPhoneNumber: '+14165551234' };
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, runtime);
      const members = payload.members as any[];
      const tools = members[0].assistant.tools ?? [];
      const transferTool = tools.find((t: any) => t.type === 'transferCall');

      expect(transferTool).toBeDefined();
      expect(transferTool.destinations[0].number).toBe('+14165551234');
    });

    it('uses toolIdMap for standalone function tools when provided', () => {
      const runtime: RuntimeConfig = {
        ...defaultRuntime,
        toolIdMap: new Map([['receptionistLookup', 'vapi-tool-id-1']]),
      };
      const template = makeTemplate();
      const payload = buildSquadPayloadFromTemplate(template, defaultVars, runtime);
      const members = payload.members as any[];

      expect(members[0].assistant.toolIds).toContain('vapi-tool-id-1');
    });
  });

  describe('templateToDbShape', () => {
    it('converts a template config to DB model shape', () => {
      const template = makeTemplate();
      const dbShape = templateToDbShape(template);

      expect(dbShape.name).toBe('test-template-v-test');
      expect(dbShape.displayName).toBe('Test Template');
      expect(dbShape.version).toBe('v-test');
      expect(dbShape.isDefault).toBe(true);
      expect(dbShape.squadConfig.memberCount).toBe(1);
      expect(dbShape.squadConfig.memberNames).toContain('Receptionist');
      expect(dbShape.modelConfig.members[0].provider).toBe('openai');
    });

    it('maps handoffDestinations into squadConfig.destinations', () => {
      const template = makeTemplate();
      const dbShape = templateToDbShape(template);

      expect(dbShape.squadConfig.destinations[0].destinations).toContain('Booking Agent');
    });
  });

  describe('dbShapeToTemplate', () => {
    it('reconstructs a DentalClinicTemplateConfig from DB record', () => {
      const dbRecord = {
        name: 'dental-clinic-v1',
        displayName: 'Dental Clinic',
        version: 'v1',
        category: 'dental',
        squadConfig: {
          memberCount: 1,
          memberNames: ['Receptionist'],
          destinations: [{ name: 'Receptionist', destinations: ['Booking Agent'] }],
        },
        assistantConfig: {
          members: [{
            name: 'Receptionist',
            firstMessage: 'Hello!',
            firstMessageMode: 'assistant-speaks-first-with-model-generated-message',
            voice: { provider: 'openai', voiceId: 'nova' },
            recordingEnabled: true,
            startSpeakingPlan: { waitSeconds: 0.4, smartEndpointingPlan: { provider: 'livekit' } },
            stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.2, backoffSeconds: 1 },
          }],
        },
        toolsConfig: {
          groups: { Receptionist: 'receptionist' },
        },
        modelConfig: {
          members: [{
            name: 'Receptionist',
            provider: 'openai',
            model: 'gpt-4o',
            temperature: 0.7,
            maxTokens: 400,
            systemPrompt: 'You are a receptionist at {{clinicName}}.',
          }],
        },
      };

      const template = dbShapeToTemplate(dbRecord);

      expect(template.name).toBe('dental-clinic-v1');
      expect(template.members).toHaveLength(1);
      expect(template.members[0]!.assistant.name).toBe('Receptionist');
      expect(template.members[0]!.assistant.toolGroup).toBe('receptionist');
      expect(template.members[0]!.handoffDestinations![0]!.assistantName).toBe('Booking Agent');
    });

    it('provides defaults for missing fields', () => {
      const dbRecord = {
        name: 'minimal',
        displayName: 'Minimal',
        version: 'v0',
        category: 'test',
        squadConfig: { destinations: [{}] },
        assistantConfig: { members: [{ name: 'Agent' }] },
        toolsConfig: { groups: {} },
        modelConfig: { members: [{}] },
      };

      const template = dbShapeToTemplate(dbRecord);
      const member = template.members[0]!;

      expect(member.assistant.model.provider).toBe('openai');
      expect(member.assistant.model.model).toBe('gpt-4o');
      expect(member.assistant.toolGroup).toBe('none');
    });
  });

  describe('KB_CATEGORIES', () => {
    it('has at least 5 categories', () => {
      expect(KB_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });

    it('each category has id, label, and description', () => {
      for (const cat of KB_CATEGORIES) {
        expect(cat.id).toBeTruthy();
        expect(cat.label).toBeTruthy();
        expect(cat.description).toBeTruthy();
      }
    });
  });

  describe('KB_ASSISTANTS', () => {
    it('includes Receptionist', () => {
      expect(KB_ASSISTANTS).toContain('Receptionist');
    });

    it('includes legacy names for backward compat', () => {
      expect(KB_ASSISTANTS).toContain('Triage Receptionist');
      expect(KB_ASSISTANTS).toContain('Clinic Information');
    });
  });

  describe('getAllFunctionToolDefinitions', () => {
    it('returns an array of PMS tool definitions', () => {
      const tools = getAllFunctionToolDefinitions();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('prepareToolDefinitionsForCreation', () => {
    const sampleTools = [
      { type: 'function', function: { name: 'bookAppointment' }, server: {} },
      { type: 'transferCall', destinations: [] },
    ];

    it('sets webhookUrl and secret on function tools', () => {
      const result = prepareToolDefinitionsForCreation(
        sampleTools,
        'https://api.example.com/webhook',
        'my-secret',
      );

      expect(result[0].server.url).toBe('https://api.example.com/webhook');
      expect(result[0].server.secret).toBe('my-secret');
      // Non-function tools are untouched
      expect(result[1].type).toBe('transferCall');
    });

    it('uses credentialId instead of secret when provided', () => {
      const result = prepareToolDefinitionsForCreation(
        sampleTools,
        'https://api.example.com/webhook',
        'my-secret',
        'cred-abc',
      );

      expect(result[0].server.credentialId).toBe('cred-abc');
      expect(result[0].server.secret).toBeUndefined();
    });

    it('does not mutate the original tool definitions', () => {
      const original = JSON.parse(JSON.stringify(sampleTools));
      prepareToolDefinitionsForCreation(sampleTools, 'https://x.com', 'secret');
      expect(sampleTools).toEqual(original);
    });
  });
});
