#!/usr/bin/env npx tsx
/**
 * Model Comparison Test Runner
 *
 * Creates temporary test squads with different LLM models, runs the same
 * test scenarios against each, and produces a side-by-side comparison of
 * latency, pass rate, cost, and quality.
 *
 * Usage:
 *   VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx run-model-comparison.ts
 *   VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx run-model-comparison.ts --suite booking
 *   VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx run-model-comparison.ts --models gpt-4.1,gpt-5.2-chat-latest
 *   VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx run-model-comparison.ts --keep
 *
 * Options:
 *   --suite <name>     Test suite to run (default: booking). Options: booking, tool, hipaa, emergency, appt, all
 *   --models <list>    Comma-separated model names (default: gpt-4.1,gpt-5.2-chat-latest)
 *   --keep             Don't delete test squads after comparison
 *   --concurrency <n>  Max concurrent scenarios per model (default: 1)
 *
 * Environment:
 *   VAPI_API_KEY       Required
 *   VAPI_SQUAD_ID      Required (source squad to clone)
 */

import * as fs from 'fs';
import * as path from 'path';

const VAPI_API_KEY = process.env.VAPI_API_KEY ?? '';
const SOURCE_SQUAD_ID = process.env.VAPI_SQUAD_ID ?? '';
const VAPI_BASE = 'https://api.vapi.ai';

if (!VAPI_API_KEY) {
  console.error('VAPI_API_KEY environment variable is required.');
  process.exit(1);
}
if (!SOURCE_SQUAD_ID) {
  console.error('VAPI_SQUAD_ID environment variable is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const cliArgs = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = cliArgs.indexOf(flag);
  return idx >= 0 && idx + 1 < cliArgs.length ? cliArgs[idx + 1] : undefined;
}

const SUITE_NAME = getArg('--suite') || 'booking';
const MODELS = (getArg('--models') || 'gpt-4.1,gpt-5.2-chat-latest').split(',').map((s) => s.trim());
const KEEP_SQUADS = cliArgs.includes('--keep');

// ---------------------------------------------------------------------------
// Vapi HTTP client
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function vapiRequest<T = any>(method: string, apiPath: string, body?: any): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${VAPI_BASE}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 429) {
      const wait = 2000 * Math.pow(2, attempt);
      process.stdout.write(`\n  Rate limited, waiting ${(wait / 1000).toFixed(0)}s...`);
      await sleep(wait);
      continue;
    }

    if (res.status === 204) return null as T;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vapi ${method} ${apiPath} (${res.status}): ${text.substring(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Vapi ${method} ${apiPath}: max retries exceeded`);
}

// ---------------------------------------------------------------------------
// Import test scenarios (re-use from the existing test runner)
// ---------------------------------------------------------------------------

import {
  ALL_BOOKING_SCENARIOS,
  ALL_TOOL_SCENARIOS,
  ALL_HANDOFF_SCENARIOS,
  ALL_HIPAA_SCENARIOS,
  ALL_EMERGENCY_SCENARIOS,
  ALL_APPT_MGMT_SCENARIOS,
  ALL_V5_SCENARIOS,
  ALL_CHAT_SCENARIOS,
  type ChatTestScenario,
  type StepAssertion,
  type ToolCallAssertion,
  type TranscriptAssertion,
  type AssistantRole,
} from './scenarios/chat-scenarios';

import { startChat, continueChat, type ChatResponse } from './sim-api';

const SUITES: Record<string, ChatTestScenario[]> = {
  booking: ALL_BOOKING_SCENARIOS,
  tool: ALL_TOOL_SCENARIOS,
  handoff: ALL_HANDOFF_SCENARIOS,
  hipaa: ALL_HIPAA_SCENARIOS,
  emergency: ALL_EMERGENCY_SCENARIOS,
  appt: ALL_APPT_MGMT_SCENARIOS,
  v5: ALL_V5_SCENARIOS,
  all: ALL_CHAT_SCENARIOS,
};

// ---------------------------------------------------------------------------
// Squad creation with model override
// ---------------------------------------------------------------------------

function resolveProvider(model: string): string {
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('llama') || model.startsWith('deepseek') || model.startsWith('groq')) return 'groq';
  return 'openai';
}

async function createModelSquad(model: string): Promise<string> {
  const squad = await vapiRequest('GET', `/squad/${SOURCE_SQUAD_ID}`);
  const provider = resolveProvider(model);

  const patchedMembers = squad.members.map((m: any) => {
    const { id, createdAt, updatedAt, orgId, ...rest } = m;

    if (rest.assistantOverrides?.model) {
      rest.assistantOverrides = {
        ...rest.assistantOverrides,
        model: {
          ...rest.assistantOverrides.model,
          model,
          provider,
        },
      };
    }

    return rest;
  });

  const payload = {
    name: `COMPARE-${model}-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}`,
    members: patchedMembers,
    membersOverrides: squad.membersOverrides,
  };

  const result = await vapiRequest<any>('POST', '/squad', payload);
  return result.id;
}

async function deleteSquad(squadId: string): Promise<void> {
  try {
    await vapiRequest('DELETE', `/squad/${squadId}`);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Assistant ID resolution from a squad
// ---------------------------------------------------------------------------

async function resolveAssistantMap(squadId: string): Promise<Map<AssistantRole, string>> {
  const squad = await vapiRequest<any>('GET', `/squad/${squadId}`);
  const members = squad.members || [];

  const roleSignatures: Record<string, AssistantRole> = {
    'Route emergencies IMMEDIATELY': 'receptionist',
    'ALWAYS ask callers to SPELL their name': 'booking',
    'ALWAYS look up the patient FIRST': 'appointment-management',
    'ALWAYS verify caller identity': 'patient-records',
    'Verify patient identity before sharing ANY financial': 'insurance-billing',
    'Act IMMEDIATELY': 'emergency',
  };

  const nameToRole: Record<string, AssistantRole> = {
    'receptionist': 'receptionist',
    'booking agent': 'booking',
    'appointment management': 'appointment-management',
    'patient records': 'patient-records',
    'insurance & billing': 'insurance-billing',
    'insurance and billing': 'insurance-billing',
    'emergency': 'emergency',
  };

  const map = new Map<AssistantRole, string>();

  for (const m of members) {
    const assistantId = m.assistantId;
    let systemMsg = m.assistantOverrides?.model?.messages?.find(
      (msg: any) => msg.role === 'system',
    )?.content || '';

    if (!systemMsg && assistantId) {
      try {
        const assistant = await vapiRequest<any>('GET', `/assistant/${assistantId}`);
        systemMsg = assistant.model?.messages?.find(
          (msg: any) => msg.role === 'system',
        )?.content || '';

        const assistantName = (assistant.name || '').toLowerCase();
        const roleByName = nameToRole[assistantName];
        if (roleByName && !map.has(roleByName)) {
          map.set(roleByName, assistantId);
        }
      } catch {
        // skip
      }
    }

    for (const [sig, role] of Object.entries(roleSignatures)) {
      if (systemMsg.includes(sig) && !map.has(role)) {
        map.set(role, assistantId);
        break;
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Tool call extraction + assertion evaluation (mirrors run-chat-tests.ts)
// ---------------------------------------------------------------------------

interface ExtractedToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  response: string;
  succeeded: boolean;
}

function extractToolCalls(response: ChatResponse): ExtractedToolCall[] {
  const output = response.output || [];
  const calls: ExtractedToolCall[] = [];

  for (let i = 0; i < output.length; i++) {
    const msg = output[i] as any;
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const toolName = tc.function?.name || 'unknown';
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* */ }

        const toolResponse = output.find(
          (m: any) => m.role === 'tool' && m.tool_call_id === tc.id,
        ) as any;
        const responseText = toolResponse?.content || '';

        calls.push({
          toolName,
          arguments: args,
          response: responseText,
          succeeded: responseText.includes('[SUCCESS]') || responseText.includes('Transfer initiated'),
        });
      }
    }
  }

  return calls;
}

interface AssertionResult {
  label: string;
  passed: boolean;
  detail?: string;
}

function evalTextAssertion(text: string, assertion: StepAssertion | TranscriptAssertion): AssertionResult {
  const label = assertion.label || `${assertion.type}: ${assertion.value}`;
  const lower = text.toLowerCase();

  switch (assertion.type) {
    case 'contains':
      return { label, passed: lower.includes(assertion.value.toLowerCase()) };
    case 'not_contains':
      return { label, passed: !lower.includes(assertion.value.toLowerCase()) };
    case 'regex': {
      try {
        const flags = assertion.value.startsWith('(?i)') ? 'i' : '';
        const pattern = assertion.value.replace(/^\(\?i\)/, '');
        return { label, passed: new RegExp(pattern, flags).test(text) };
      } catch {
        return { label, passed: false, detail: `Invalid regex` };
      }
    }
    default:
      return { label, passed: false };
  }
}

function evalToolAssertion(toolCalls: ExtractedToolCall[], assertion: ToolCallAssertion): AssertionResult {
  const label = assertion.label || `${assertion.type}: ${assertion.toolName}`;
  const matching = toolCalls.filter((tc) => tc.toolName === assertion.toolName);

  switch (assertion.type) {
    case 'tool_called':
      return { label, passed: matching.length > 0 };
    case 'tool_not_called':
      return { label, passed: matching.length === 0 };
    case 'tool_succeeded':
      return { label, passed: matching.some((tc) => tc.succeeded) };
    case 'tool_failed':
      return { label, passed: matching.some((tc) => !tc.succeeded) };
    case 'tool_param_contains':
      return {
        label,
        passed: matching.some((tc) => {
          const val = tc.arguments[assertion.paramKey!];
          return val !== undefined && String(val).toLowerCase().includes(assertion.paramValue!.toLowerCase());
        }),
      };
    case 'tool_param_exists':
      return { label, passed: matching.some((tc) => tc.arguments[assertion.paramKey!] !== undefined) };
    case 'tool_response_contains':
      return {
        label,
        passed: matching.some((tc) => tc.response.toLowerCase().includes(assertion.paramValue!.toLowerCase())),
      };
    case 'tool_call_count':
      return { label, passed: matching.length === (assertion.count ?? 0) };
    default:
      return { label, passed: false };
  }
}

// ---------------------------------------------------------------------------
// Run a single scenario against a specific squad
// ---------------------------------------------------------------------------

interface ScenarioResult {
  name: string;
  model: string;
  status: 'pass' | 'fail' | 'error';
  durationMs: number;
  stepTimesMs: number[];
  costUsd: number;
  failureReason?: string;
  toolCallCount: number;
}

async function runScenario(
  scenario: ChatTestScenario,
  assistantMap: Map<AssistantRole, string>,
  model: string,
): Promise<ScenarioResult> {
  const t0 = Date.now();
  const allToolCalls: ExtractedToolCall[] = [];
  const allResponseTexts: string[] = [];
  const stepTimesMs: number[] = [];
  let lastChatId: string | undefined;
  let totalCost = 0;

  try {
    const assistantId = assistantMap.get(scenario.targetAssistant);
    if (!assistantId) throw new Error(`No assistant for role: ${scenario.targetAssistant}`);

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepT0 = Date.now();

      let response: ChatResponse;
      if (i === 0) {
        response = await startChat(assistantId, step.userMessage);
      } else {
        response = await continueChat(lastChatId!, step.userMessage, assistantId);
      }

      const responseTimeMs = Date.now() - stepT0;
      stepTimesMs.push(responseTimeMs);
      lastChatId = response.id;
      totalCost += (response as any).cost || 0;

      const assistantMessages = (response.output || [])
        .filter((m) => m.role === 'assistant' && m.content)
        .map((m) => m.content)
        .join(' ');

      allResponseTexts.push(assistantMessages);
      const stepToolCalls = extractToolCalls(response);
      allToolCalls.push(...stepToolCalls);

      const allStepAssertions: AssertionResult[] = [];
      if (step.assertions) {
        for (const a of step.assertions) allStepAssertions.push(evalTextAssertion(assistantMessages, a));
      }
      if (step.toolAssertions) {
        for (const a of step.toolAssertions) allStepAssertions.push(evalToolAssertion(stepToolCalls, a));
      }
      if (step.maxResponseTimeMs && responseTimeMs > step.maxResponseTimeMs) {
        allStepAssertions.push({ label: `response time`, passed: false });
      }

      if (allStepAssertions.some((a) => !a.passed)) {
        return {
          name: scenario.name,
          model,
          status: 'fail',
          durationMs: Date.now() - t0,
          stepTimesMs,
          costUsd: totalCost,
          failureReason: allStepAssertions.filter((a) => !a.passed).map((a) => a.label).join('; '),
          toolCallCount: allToolCalls.length,
        };
      }

      await sleep(step.waitMs || 1000);
    }

    // Final assertions
    const fullTranscript = allResponseTexts.join('\n');
    const finalAssertions: AssertionResult[] = [];

    if (scenario.finalToolAssertions) {
      for (const a of scenario.finalToolAssertions) finalAssertions.push(evalToolAssertion(allToolCalls, a));
    }
    if (scenario.transcriptAssertions) {
      for (const a of scenario.transcriptAssertions) finalAssertions.push(evalTextAssertion(fullTranscript, a));
    }

    const anyFailed = finalAssertions.some((a) => !a.passed);

    return {
      name: scenario.name,
      model,
      status: anyFailed ? 'fail' : 'pass',
      durationMs: Date.now() - t0,
      stepTimesMs,
      costUsd: totalCost,
      failureReason: anyFailed ? finalAssertions.filter((a) => !a.passed).map((a) => a.label).join('; ') : undefined,
      toolCallCount: allToolCalls.length,
    };
  } catch (err) {
    return {
      name: scenario.name,
      model,
      status: 'error',
      durationMs: Date.now() - t0,
      stepTimesMs,
      costUsd: totalCost,
      failureReason: `${err}`,
      toolCallCount: allToolCalls.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Run all scenarios for a given model
// ---------------------------------------------------------------------------

interface ModelResults {
  model: string;
  squadId: string;
  results: ScenarioResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    passRate: string;
    avgStepMs: number;
    p95StepMs: number;
    maxStepMs: number;
    totalCost: number;
    totalDurationMs: number;
  };
}

async function runModelSuite(
  model: string,
  squadId: string,
  scenarios: ChatTestScenario[],
): Promise<ModelResults> {
  console.log(`\n  Resolving assistants for ${model}...`);
  const assistantMap = await resolveAssistantMap(squadId);
  for (const [role, id] of assistantMap) {
    console.log(`    ${role}: ${id}`);
  }

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`    ${scenario.name} [${scenario.targetAssistant}] ... `);
    const result = await runScenario(scenario, assistantMap, model);

    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '💥';
    const avgStep = result.stepTimesMs.length
      ? Math.round(result.stepTimesMs.reduce((a, b) => a + b, 0) / result.stepTimesMs.length)
      : 0;
    console.log(`${icon} ${(result.durationMs / 1000).toFixed(1)}s  avg-step: ${avgStep}ms  $${result.costUsd.toFixed(3)}`);

    if (result.status !== 'pass' && result.failureReason) {
      console.log(`      ${result.failureReason.substring(0, 120)}`);
    }

    results.push(result);
    await sleep(1500);
  }

  const allStepTimes = results.flatMap((r) => r.stepTimesMs);
  const sorted = [...allStepTimes].sort((a, b) => a - b);

  return {
    model,
    squadId,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      errors: results.filter((r) => r.status === 'error').length,
      passRate: results.length
        ? ((results.filter((r) => r.status === 'pass').length / results.length) * 100).toFixed(1)
        : '0.0',
      avgStepMs: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      p95StepMs: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
      maxStepMs: sorted.length ? sorted[sorted.length - 1] : 0,
      totalCost: results.reduce((s, r) => s + r.costUsd, 0),
      totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Comparison output
// ---------------------------------------------------------------------------

function printComparison(modelResults: ModelResults[]): void {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  MODEL COMPARISON RESULTS`);
  console.log(`${'═'.repeat(80)}`);

  // Header
  const colWidth = 22;
  const metricWidth = 20;
  const header = '  ' + 'Metric'.padEnd(metricWidth) + modelResults.map((m) => m.model.padStart(colWidth)).join('');
  console.log(header);
  console.log('  ' + '─'.repeat(metricWidth + colWidth * modelResults.length));

  const rows: [string, ...string[]][] = [
    ['Pass Rate', ...modelResults.map((m) => `${m.summary.passRate}%`)],
    ['Passed', ...modelResults.map((m) => `${m.summary.passed}/${m.summary.total}`)],
    ['Failed', ...modelResults.map((m) => `${m.summary.failed}`)],
    ['Errors', ...modelResults.map((m) => `${m.summary.errors}`)],
    ['Avg Step (ms)', ...modelResults.map((m) => `${m.summary.avgStepMs}`)],
    ['P95 Step (ms)', ...modelResults.map((m) => `${m.summary.p95StepMs}`)],
    ['Max Step (ms)', ...modelResults.map((m) => `${m.summary.maxStepMs}`)],
    ['Total Cost', ...modelResults.map((m) => `$${m.summary.totalCost.toFixed(3)}`)],
    ['Total Time', ...modelResults.map((m) => `${(m.summary.totalDurationMs / 1000).toFixed(1)}s`)],
  ];

  for (const [metric, ...vals] of rows) {
    console.log('  ' + metric.padEnd(metricWidth) + vals.map((v) => v.padStart(colWidth)).join(''));
  }

  // Per-scenario comparison
  console.log(`\n  Per-Scenario Breakdown:`);
  console.log('  ' + '─'.repeat(metricWidth + colWidth * modelResults.length));

  const scenarioNames = modelResults[0].results.map((r) => r.name);
  for (const name of scenarioNames) {
    const shortName = name.length > metricWidth - 2 ? name.substring(0, metricWidth - 5) + '...' : name;
    const vals = modelResults.map((m) => {
      const r = m.results.find((r) => r.name === name);
      if (!r) return '?'.padStart(colWidth);
      const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '💥';
      const avgStep = r.stepTimesMs.length
        ? Math.round(r.stepTimesMs.reduce((a, b) => a + b, 0) / r.stepTimesMs.length)
        : 0;
      return `${icon} ${avgStep}ms $${r.costUsd.toFixed(3)}`.padStart(colWidth);
    });
    console.log('  ' + shortName.padEnd(metricWidth) + vals.join(''));
  }

  // Winner summary
  console.log(`\n  Winner Analysis:`);

  const bestLatency = modelResults.reduce((a, b) => a.summary.avgStepMs < b.summary.avgStepMs ? a : b);
  const bestPassRate = modelResults.reduce((a, b) =>
    parseFloat(a.summary.passRate) > parseFloat(b.summary.passRate) ? a : b,
  );
  const bestCost = modelResults.reduce((a, b) => a.summary.totalCost < b.summary.totalCost ? a : b);

  console.log(`    Best Latency:   ${bestLatency.model} (avg ${bestLatency.summary.avgStepMs}ms)`);
  console.log(`    Best Pass Rate: ${bestPassRate.model} (${bestPassRate.summary.passRate}%)`);
  console.log(`    Best Cost:      ${bestCost.model} ($${bestCost.summary.totalCost.toFixed(3)})`);

  console.log(`\n${'═'.repeat(80)}\n`);
}

function saveComparison(modelResults: ModelResults[]): void {
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dir = process.env.RESULTS_DIR || path.dirname(new URL(import.meta.url).pathname);
  const file = path.join(dir, `model-comparison-${SUITE_NAME}-${ts}.json`);

  const output = {
    suite: SUITE_NAME,
    models: MODELS,
    timestamp: new Date().toISOString(),
    sourceSquadId: SOURCE_SQUAD_ID,
    comparison: modelResults.map((m) => ({
      model: m.model,
      squadId: m.squadId,
      summary: m.summary,
      results: m.results,
    })),
  };

  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  console.log(`  Results saved: ${path.basename(file)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const scenarios = SUITES[SUITE_NAME];
  if (!scenarios) {
    console.error(`Unknown suite: ${SUITE_NAME}. Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  console.log(`${'═'.repeat(80)}`);
  console.log(`  VAPI MODEL COMPARISON TEST`);
  console.log(`  Models: ${MODELS.join(' vs ')}`);
  console.log(`  Suite: ${SUITE_NAME} (${scenarios.length} scenarios)`);
  console.log(`  Source Squad: ${SOURCE_SQUAD_ID}`);
  console.log(`  Cleanup: ${KEEP_SQUADS ? 'KEEP squads' : 'DELETE after'}`);
  console.log(`${'═'.repeat(80)}`);

  const createdSquadIds: string[] = [];
  const modelResults: ModelResults[] = [];

  try {
    for (const model of MODELS) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`  Creating test squad for ${model}...`);

      const squadId = await createModelSquad(model);
      createdSquadIds.push(squadId);
      console.log(`  Squad created: ${squadId}`);

      const results = await runModelSuite(model, squadId, scenarios);
      modelResults.push(results);
    }

    printComparison(modelResults);
    saveComparison(modelResults);
  } finally {
    if (!KEEP_SQUADS) {
      console.log('\n  Cleaning up test squads...');
      for (const id of createdSquadIds) {
        await deleteSquad(id);
        console.log(`    Deleted squad ${id}`);
      }
    } else {
      console.log('\n  --keep flag: test squads preserved:');
      for (let i = 0; i < MODELS.length; i++) {
        console.log(`    ${MODELS[i]}: ${createdSquadIds[i]}`);
      }
    }
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
