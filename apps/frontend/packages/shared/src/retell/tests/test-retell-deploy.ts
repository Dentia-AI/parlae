#!/usr/bin/env npx tsx
/**
 * Retell Deployment Dry-Run Test
 *
 * Validates the full Retell deployment pipeline locally against the real
 * Retell API — catching schema errors, invalid params, and API rejections
 * BEFORE pushing to production.
 *
 * Creates all 6 LLMs + 6 Agents with agent_swap wiring, then tears them
 * all down. Optionally skips teardown with --keep for manual inspection.
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx test-retell-deploy.ts
 *   RETELL_API_KEY=... npx tsx test-retell-deploy.ts --keep      # don't delete after
 *   RETELL_API_KEY=... npx tsx test-retell-deploy.ts --dry-run   # validate config only, no API calls
 *
 * Environment:
 *   RETELL_API_KEY          Required
 *   RETELL_WEBHOOK_SECRET   Optional (defaults to 'test-secret')
 *   BACKEND_URL             Optional (defaults to 'https://httpbin.org/post')
 */

// ---------------------------------------------------------------------------
// Config validation (no Next.js / Prisma / server-only needed)
// ---------------------------------------------------------------------------

const RETELL_API_KEY = process.env.RETELL_API_KEY ?? '';
const RETELL_WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET ?? 'test-secret';
const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://httpbin.org/post';

if (!RETELL_API_KEY) {
  console.error('❌ RETELL_API_KEY environment variable is required.');
  process.exit(1);
}

const args = process.argv.slice(2);
const KEEP_AGENTS = args.includes('--keep');
const DRY_RUN = args.includes('--dry-run');

// ---------------------------------------------------------------------------
// Inline Retell HTTP client (avoids importing server-only modules)
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.retellai.com';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function retellRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 429) {
      const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.log(`  ⏳ Rate limited on ${path}, retrying in ${waitMs}ms...`);
      if (attempt < MAX_RETRIES) {
        await sleep(waitMs);
        continue;
      }
    }

    if (res.status === 204) return null as T;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Retell ${method} ${path} (${res.status}): ${text}`);
    }

    return (await res.json()) as T;
  }

  throw new Error(`Retell ${method} ${path}: max retries exceeded`);
}

// ---------------------------------------------------------------------------
// Import templates (these are pure data, no server-only deps)
// ---------------------------------------------------------------------------

import {
  RETELL_AGENT_DEFINITIONS,
  RETELL_AGENT_ROLES,
  RETELL_POST_CALL_ANALYSIS,
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_DENTAL_CLINIC_VERSION,
  type RetellAgentRole,
} from '../templates/dental-clinic.retell-template';

import {
  RETELL_BOOKING_TOOLS,
  RETELL_APPOINTMENT_MGMT_TOOLS,
  RETELL_RECEPTIONIST_TOOLS,
  RETELL_PATIENT_RECORDS_TOOLS,
  RETELL_INSURANCE_BILLING_TOOLS,
  RETELL_EMERGENCY_TOOLS,
} from '../retell-pms-tools.config';

import type {
  RetellCustomTool,
  RetellLlmConfig,
  RetellAgentConfig,
} from '../retell.service';

// Avoid importing template-utils (has server-only logger) — replicate needed bits

function hydratePlaceholders(
  text: string,
  vars: Record<string, string>,
): string {
  let result = text;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tool resolution (mirrors retell-template-utils.ts)
// ---------------------------------------------------------------------------

const TOOL_GROUP_MAP: Record<string, RetellCustomTool[]> = {
  receptionist: RETELL_RECEPTIONIST_TOOLS,
  booking: RETELL_BOOKING_TOOLS,
  appointmentMgmt: RETELL_APPOINTMENT_MGMT_TOOLS,
  patientRecords: RETELL_PATIENT_RECORDS_TOOLS,
  insuranceBilling: RETELL_INSURANCE_BILLING_TOOLS,
  emergency: RETELL_EMERGENCY_TOOLS,
};

function resolveToolGroup(groupName: string): RetellCustomTool[] {
  return TOOL_GROUP_MAP[groupName] || [];
}

function hydrateTools(
  tools: RetellCustomTool[],
  webhookUrl: string,
  secret: string,
  accountId: string,
): RetellCustomTool[] {
  return tools.map((tool) => ({
    ...tool,
    url: tool.url.replace('{{webhookUrl}}', webhookUrl),
    headers: {
      ...tool.headers,
      'x-retell-secret': (tool.headers?.['x-retell-secret'] || '').replace('{{secret}}', secret),
      'x-account-id': (tool.headers?.['x-account-id'] || '').replace('{{accountId}}', accountId),
    },
  }));
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface TestStep {
  label: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  detail?: string;
}

const results: TestStep[] = [];
const createdLlmIds: string[] = [];
const createdAgentIds: string[] = [];

function log(msg: string) {
  process.stdout.write(msg);
}

function logStep(step: TestStep) {
  const icon = step.status === 'pass' ? '✅' : step.status === 'fail' ? '❌' : '⏭️';
  const time = `(${step.durationMs}ms)`;
  console.log(`  ${icon} ${step.label} ${time}`);
  if (step.detail) console.log(`     ${step.detail}`);
  results.push(step);
}

// ---------------------------------------------------------------------------
// Test: Config Validation
// ---------------------------------------------------------------------------

function testConfigValidation(): void {
  console.log('\n─── Config Validation ─────────────────────────────────────');

  const t0 = Date.now();

  // Check all 6 agent definitions exist
  const roles = RETELL_AGENT_DEFINITIONS.map((d) => d.role);
  const expectedRoles: RetellAgentRole[] = [
    'receptionist', 'booking', 'appointmentMgmt',
    'patientRecords', 'insuranceBilling', 'emergency',
  ];

  const missingRoles = expectedRoles.filter((r) => !roles.includes(r));
  logStep({
    label: 'All 6 agent roles defined',
    status: missingRoles.length === 0 ? 'pass' : 'fail',
    durationMs: Date.now() - t0,
    detail: missingRoles.length > 0 ? `Missing: ${missingRoles.join(', ')}` : undefined,
  });

  // Check each agent has a system prompt
  for (const def of RETELL_AGENT_DEFINITIONS) {
    const t1 = Date.now();
    logStep({
      label: `${def.role}: has system prompt (${def.systemPrompt.length} chars)`,
      status: def.systemPrompt.length > 100 ? 'pass' : 'fail',
      durationMs: Date.now() - t1,
      detail: def.systemPrompt.length <= 100 ? 'Prompt too short' : undefined,
    });
  }

  // Check tool groups resolve
  for (const def of RETELL_AGENT_DEFINITIONS) {
    const t1 = Date.now();
    const tools = resolveToolGroup(def.toolGroup);
    logStep({
      label: `${def.role}: tool group "${def.toolGroup}" has ${tools.length} tools`,
      status: tools.length > 0 ? 'pass' : 'fail',
      durationMs: Date.now() - t1,
    });
  }

  // Check post-call analysis
  const t2 = Date.now();
  const enumItems = RETELL_POST_CALL_ANALYSIS.filter((p) => p.type === 'enum');
  const enumMissingChoices = enumItems.filter((p) => !p.choices || p.choices.length === 0);
  logStep({
    label: `Post-call analysis: ${RETELL_POST_CALL_ANALYSIS.length} fields, enum fields have choices`,
    status: enumMissingChoices.length === 0 ? 'pass' : 'fail',
    durationMs: Date.now() - t2,
    detail: enumMissingChoices.length > 0
      ? `Missing choices on: ${enumMissingChoices.map((p) => p.name).join(', ')}`
      : undefined,
  });

  // Check no "options" field exists (must be "choices")
  const t3 = Date.now();
  const hasOptions = RETELL_POST_CALL_ANALYSIS.some((p) => 'options' in p);
  logStep({
    label: 'Post-call analysis: no deprecated "options" field (must be "choices")',
    status: !hasOptions ? 'pass' : 'fail',
    durationMs: Date.now() - t3,
    detail: hasOptions ? 'Found "options" instead of "choices" — Retell rejects this' : undefined,
  });

  // Check swap targets reference valid roles
  for (const def of RETELL_AGENT_DEFINITIONS) {
    const t4 = Date.now();
    const invalidTargets = def.swapTargets.filter(
      (t) => !expectedRoles.includes(t.role),
    );
    logStep({
      label: `${def.role}: ${def.swapTargets.length} swap targets valid`,
      status: invalidTargets.length === 0 ? 'pass' : 'fail',
      durationMs: Date.now() - t4,
      detail: invalidTargets.length > 0
        ? `Invalid targets: ${invalidTargets.map((t) => t.role).join(', ')}`
        : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// Test: LLM Creation
// ---------------------------------------------------------------------------

const originalToolsForRole: Record<string, any[]> = {};

async function testLlmCreation(): Promise<Record<string, any>> {
  console.log('\n─── LLM Creation (Pass 1) ─────────────────────────────────');

  const llmMap: Record<string, any> = {};
  const testAccountId = 'test-deploy-validation';
  const templateVars = {
    clinicName: 'Test Dental Clinic',
    clinicPhone: '+10000000000',
    accountId: testAccountId,
  };

  for (const def of RETELL_AGENT_DEFINITIONS) {
    const t0 = Date.now();

    const hydratedPrompt = hydratePlaceholders(def.systemPrompt, templateVars);
    const hydratedBeginMessage = hydratePlaceholders(def.beginMessage, templateVars);
    const pmsTools = hydrateTools(
      resolveToolGroup(def.toolGroup),
      BACKEND_URL,
      RETELL_WEBHOOK_SECRET,
      testAccountId,
    );

    const endCallTool = {
      type: 'end_call' as const,
      name: 'end_call',
      description: 'End the call when the caller is done or says goodbye.',
      speak_during_execution: true,
      execution_message_description: 'Thank you for calling. Have a great day!',
      execution_message_type: 'static_text' as const,
    };

    const baseTools = [...pmsTools, endCallTool];
    originalToolsForRole[def.role] = baseTools;

    const llmConfig: RetellLlmConfig = {
      general_prompt: hydratedPrompt,
      general_tools: baseTools,
      model: 'gpt-4.1',
      model_temperature: 0.3,
      tool_call_strict_mode: true,
      start_speaker: def.startSpeaker,
      begin_message: hydratedBeginMessage,
      default_dynamic_variables: {
        customer_phone: '{{call.from_number}}',
      },
    };

    try {
      const llm = await retellRequest<any>('POST', '/create-retell-llm', llmConfig);
      createdLlmIds.push(llm.llm_id);
      llmMap[def.role] = llm;
      logStep({
        label: `${def.role}: LLM created (${llm.llm_id})`,
        status: 'pass',
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      logStep({
        label: `${def.role}: LLM creation FAILED`,
        status: 'fail',
        durationMs: Date.now() - t0,
        detail: err.message?.substring(0, 300),
      });
    }

    await sleep(500);
  }

  return llmMap;
}

// ---------------------------------------------------------------------------
// Test: Agent Creation
// ---------------------------------------------------------------------------

async function testAgentCreation(
  llmMap: Record<string, any>,
): Promise<Record<string, any>> {
  console.log('\n─── Agent Creation (Pass 1) ────────────────────────────────');

  const agentMap: Record<string, any> = {};
  const testAccountId = 'test-deploy-validation';

  for (const def of RETELL_AGENT_DEFINITIONS) {
    const t0 = Date.now();
    const llm = llmMap[def.role];

    if (!llm) {
      logStep({
        label: `${def.role}: Agent creation SKIPPED (no LLM)`,
        status: 'skip',
        durationMs: 0,
      });
      continue;
    }

    const agentConfig: RetellAgentConfig = {
      agent_name: `TEST - ${def.name}`,
      response_engine: {
        type: 'retell-llm',
        llm_id: llm.llm_id,
      },
      voice_id: '11labs-Adrian',
      voice_model: 'eleven_turbo_v2_5',
      ...SHARED_RETELL_AGENT_CONFIG,
      webhook_url: `${BACKEND_URL}/retell/webhook`,
      webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
      post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
      boosted_keywords: [
        'Test Dental', 'appointment', 'cleaning', 'exam',
        'dentist', 'dental', 'insurance', 'billing',
      ],
      metadata: {
        accountId: testAccountId,
        role: def.role,
        version: RETELL_DENTAL_CLINIC_VERSION,
        isTest: true,
      },
    };

    try {
      const agent = await retellRequest<any>('POST', '/create-agent', agentConfig);
      createdAgentIds.push(agent.agent_id);
      agentMap[def.role] = agent;
      logStep({
        label: `${def.role}: Agent created (${agent.agent_id})`,
        status: 'pass',
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      logStep({
        label: `${def.role}: Agent creation FAILED`,
        status: 'fail',
        durationMs: Date.now() - t0,
        detail: err.message?.substring(0, 300),
      });
    }

    await sleep(500);
  }

  return agentMap;
}

// ---------------------------------------------------------------------------
// Test: Agent Swap Wiring (Pass 2)
// ---------------------------------------------------------------------------

async function testAgentSwapWiring(
  llmMap: Record<string, any>,
  agentMap: Record<string, any>,
): Promise<void> {
  console.log('\n─── Agent Swap Wiring (Pass 2) ─────────────────────────────');

  const agentIdMap: Record<RetellAgentRole, string> = {} as any;
  for (const role of RETELL_AGENT_ROLES) {
    if (agentMap[role]) {
      agentIdMap[role] = agentMap[role].agent_id;
    }
  }

  for (const def of RETELL_AGENT_DEFINITIONS) {
    if (def.swapTargets.length === 0) {
      logStep({
        label: `${def.role}: no swap targets — skip`,
        status: 'pass',
        durationMs: 0,
      });
      continue;
    }

    const t0 = Date.now();
    const llm = llmMap[def.role];
    if (!llm) {
      logStep({
        label: `${def.role}: swap wiring SKIPPED (no LLM)`,
        status: 'skip',
        durationMs: 0,
      });
      continue;
    }

    const swapTools = def.swapTargets
      .filter((t) => agentIdMap[t.role])
      .map((target) => ({
        type: 'agent_swap' as const,
        name: target.toolName,
        description: target.description,
        agent_id: agentIdMap[target.role],
        speak_during_execution: false,
        post_call_analysis_setting: 'both_agents',
        keep_current_voice: true,
      }));

    const baseTools = originalToolsForRole[def.role] || [];
    const updatedTools = [...baseTools, ...swapTools];

    try {
      await retellRequest<any>('PATCH', `/update-retell-llm/${llm.llm_id}`, {
        general_tools: updatedTools,
      });
      logStep({
        label: `${def.role}: wired ${swapTools.length} agent_swap tools`,
        status: 'pass',
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      logStep({
        label: `${def.role}: swap wiring FAILED`,
        status: 'fail',
        durationMs: Date.now() - t0,
        detail: err.message?.substring(0, 300),
      });
    }

    await sleep(300);
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function teardown(): Promise<void> {
  console.log('\n─── Teardown ──────────────────────────────────────────────');

  for (const agentId of createdAgentIds) {
    try {
      await retellRequest('DELETE', `/delete-agent/${agentId}`);
      console.log(`  🗑️  Deleted agent ${agentId}`);
    } catch (err: any) {
      console.log(`  ⚠️  Failed to delete agent ${agentId}: ${err.message?.substring(0, 100)}`);
    }
    await sleep(200);
  }

  for (const llmId of createdLlmIds) {
    try {
      await retellRequest('DELETE', `/delete-retell-llm/${llmId}`);
      console.log(`  🗑️  Deleted LLM ${llmId}`);
    } catch (err: any) {
      console.log(`  ⚠️  Failed to delete LLM ${llmId}: ${err.message?.substring(0, 100)}`);
    }
    await sleep(200);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(): void {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RETELL DEPLOYMENT TEST RESULTS`);
  console.log(`  Pass: ${passed}  |  Fail: ${failed}  |  Skip: ${skipped}  |  Total: ${results.length}`);
  console.log(`  Duration: ${(totalMs / 1000).toFixed(1)}s`);
  if (KEEP_AGENTS) {
    console.log(`  ⚠️  --keep flag: agents NOT deleted. Clean up manually.`);
    console.log(`     Agents: ${createdAgentIds.join(', ')}`);
    console.log(`     LLMs:   ${createdLlmIds.join(', ')}`);
  }
  console.log(`${'═'.repeat(70)}`);

  if (failed > 0) {
    console.log('\n  FAILURES:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`    ❌ ${r.label}`);
      if (r.detail) console.log(`       ${r.detail}`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${'═'.repeat(70)}`);
  console.log(`  RETELL DEPLOYMENT DRY-RUN TEST`);
  console.log(`  API Key: ${RETELL_API_KEY.substring(0, 8)}...`);
  console.log(`  Backend URL: ${BACKEND_URL}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (config only)' : 'FULL (real API calls)'}`);
  console.log(`  Cleanup: ${KEEP_AGENTS ? 'KEEP agents' : 'DELETE after test'}`);
  console.log(`${'═'.repeat(70)}`);

  // Phase 1: Config validation (always runs)
  testConfigValidation();

  if (DRY_RUN) {
    printSummary();
    process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
  }

  // Phase 2: LLM creation
  const llmMap = await testLlmCreation();

  // Phase 3: Agent creation
  const agentMap = await testAgentCreation(llmMap);

  // Phase 4: Agent swap wiring
  await testAgentSwapWiring(llmMap, agentMap);

  // Phase 5: Teardown (unless --keep)
  if (!KEEP_AGENTS) {
    await teardown();
  }

  printSummary();
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}

main().catch((err) => {
  console.error('\n💀 Fatal error:', err);
  // Best-effort cleanup
  if (!KEEP_AGENTS && (createdAgentIds.length > 0 || createdLlmIds.length > 0)) {
    console.log('Attempting cleanup...');
    teardown()
      .catch(() => {})
      .finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
