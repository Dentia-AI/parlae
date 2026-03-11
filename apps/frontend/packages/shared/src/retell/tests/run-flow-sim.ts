#!/usr/bin/env npx tsx
/**
 * Retell Conversation Flow Simulation Test Runner
 *
 * Deploys a conversation flow agent and runs batch tests against it.
 * This tests the unified conversation flow architecture (single agent,
 * node-based routing) rather than the legacy squad (6 agents + agent_swap).
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx run-flow-sim.ts
 *   RETELL_API_KEY=... npx tsx run-flow-sim.ts --models gpt-4.1,gpt-5.2
 *   RETELL_API_KEY=... npx tsx run-flow-sim.ts --suite booking
 *   RETELL_API_KEY=... npx tsx run-flow-sim.ts --suite all --keep
 *
 * Environment:
 *   RETELL_API_KEY          Required
 *   RETELL_WEBHOOK_SECRET   Optional (defaults to 'test-secret')
 *   BACKEND_URL             Optional (defaults to 'https://httpbin.org/post')
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  buildDentalClinicFlow,
  CONVERSATION_FLOW_VERSION,
} from '../templates/conversation-flow/dental-clinic.flow-template';

import {
  RETELL_POST_CALL_ANALYSIS,
  SHARED_RETELL_AGENT_CONFIG,
} from '../templates/dental-clinic.retell-template';

import {
  ALL_RETELL_SCENARIOS,
  SCENARIO_SUITES,
  type RetellTestScenario,
  type ToolMock,
} from './retell-test-scenarios';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RETELL_API_KEY = process.env.RETELL_API_KEY ?? '';
const RETELL_WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET ?? 'test-secret';
const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'https://httpbin.org/post';
const BASE_URL = 'https://api.retellai.com';

if (!RETELL_API_KEY) {
  console.error('RETELL_API_KEY environment variable is required.');
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = cliArgs.indexOf(flag);
  return idx >= 0 && idx + 1 < cliArgs.length ? cliArgs[idx + 1] : undefined;
}

const MODELS = (getArg('--models') || 'gpt-4.1').split(',').map((s) => s.trim());
const KEEP_ALL = cliArgs.includes('--keep');
const SUITE_NAME = getArg('--suite') || 'all';

// ---------------------------------------------------------------------------
// HTTP client with retry + rate-limit handling
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function retellRequest<T = any>(method: string, apiPath: string, body?: any): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE_URL}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
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
      throw new Error(`Retell ${method} ${apiPath} (${res.status}): ${text.substring(0, 400)}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Retell ${method} ${apiPath}: max retries exceeded`);
}

// ---------------------------------------------------------------------------
// Routing tools that exist in squad but not in conversation flow
// ---------------------------------------------------------------------------

const ROUTING_TOOL_NAMES = new Set([
  'route_to_booking',
  'route_to_emergency',
  'route_to_appointment_mgmt',
  'route_to_patient_records',
  'route_to_insurance_billing',
  'route_to_receptionist',
  'transfer_call',
  'end_call',
]);

function stripRoutingMocks(mocks: ToolMock[]): ToolMock[] {
  return mocks.filter((m) => !ROUTING_TOOL_NAMES.has(m.tool_name));
}

// Default mocks for all PMS tools — ensures cross-node transitions don't hit unmocked URLs
const FLOW_DEFAULT_TOOL_MOCKS: ToolMock[] = [
  { tool_name: 'getProviders', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Available providers: Dr. Smith (General), Dr. Rivera (Emergency), Dr. Lee (Orthodontics).' }) },
  { tool_name: 'lookupPatient', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Patient found: Lisa Chen (pat_101). Phone: 555-0101.' }) },
  { tool_name: 'createPatient', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Patient created. ID: pat_test123. [NEXT STEP] Call bookAppointment with patientId, appointmentType, startTime, duration.' }) },
  { tool_name: 'checkAvailability', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Available slots for tomorrow: 9:00 AM, 10:30 AM, 2:00 PM, 3:30 PM. [NEXT STEP] Ask which slot the patient prefers, then look up or create the patient.' }) },
  { tool_name: 'bookAppointment', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Appointment booked. Confirmation: Tomorrow at 9:00 AM for Dental Cleaning with Dr. Smith. Duration: 60 minutes.' }) },
  { tool_name: 'getAppointments', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Upcoming: Dental Cleaning on Thursday Feb 27 at 3:30 PM. ID: appt_500.' }) },
  { tool_name: 'rescheduleAppointment', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Appointment rescheduled to the new requested time.' }) },
  { tool_name: 'cancelAppointment', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Appointment cancelled.' }) },
  { tool_name: 'updatePatient', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Patient record updated.' }) },
  { tool_name: 'addNote', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Note added to patient record.' }) },
  { tool_name: 'getInsurance', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Insurance: Blue Cross Blue Shield PPO. Member ID: BC12345. Coverage active through Dec 2026.' }) },
  { tool_name: 'verifyInsuranceCoverage', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Procedure covered at 80% after $50 deductible.' }) },
  { tool_name: 'getBalance', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Current balance: $150.00.' }) },
  { tool_name: 'processPayment', input_match_rule: { type: 'any' }, output: JSON.stringify({ result: '[SUCCESS] Payment of $150.00 processed.' }) },
];

function mergeWithDefaults(scenarioMocks: ToolMock[]): ToolMock[] {
  const scenarioToolNames = new Set(scenarioMocks.map((m) => m.tool_name));
  const merged = [...scenarioMocks];
  for (const def of FLOW_DEFAULT_TOOL_MOCKS) {
    if (!scenarioToolNames.has(def.tool_name)) {
      merged.push(def);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Deploy conversation flow agent
// ---------------------------------------------------------------------------

interface DeployedFlowAgent {
  agentId: string;
  conversationFlowId: string;
  model: string;
}

async function deployFlowAgent(model: string): Promise<DeployedFlowAgent> {
  const flowConfig = buildDentalClinicFlow({
    clinicName: 'Test Dental Clinic',
    webhookUrl: BACKEND_URL,
    webhookSecret: RETELL_WEBHOOK_SECRET,
    accountId: 'sim-test',
  });

  // Apply the model under test to the flow-level model_choice
  // (receptionist + faq use this; task nodes have per-node overrides)
  (flowConfig as any).model_choice = {
    type: 'cascading',
    model,
    high_priority: true,
  };

  const flow = await retellRequest<{
    conversation_flow_id: string;
    version: number;
  }>('POST', '/create-conversation-flow', flowConfig);

  await sleep(300);

  const agent = await retellRequest<{ agent_id: string }>('POST', '/create-agent', {
    agent_name: `SIM-FLOW-${model}`,
    response_engine: {
      type: 'conversation-flow',
      conversation_flow_id: flow.conversation_flow_id,
    },
    voice_id: '11labs-Adrian',
    ...SHARED_RETELL_AGENT_CONFIG,
    post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
    metadata: { model, isTest: true, arch: 'conversation_flow' },
  });

  return {
    agentId: agent.agent_id,
    conversationFlowId: flow.conversation_flow_id,
    model,
  };
}

// ---------------------------------------------------------------------------
// Create test cases and run batch
// ---------------------------------------------------------------------------

interface TestCaseMapping {
  id: string;
  name: string;
  category: string;
}

async function createFlowTestCases(
  flowId: string,
  scenarios: RetellTestScenario[],
): Promise<TestCaseMapping[]> {
  const cases: TestCaseMapping[] = [];
  for (const s of scenarios) {
    const flowMocks = mergeWithDefaults(stripRoutingMocks(s.toolMocks));
    const tc = await retellRequest<any>('POST', '/create-test-case-definition', {
      name: s.name,
      response_engine: {
        type: 'conversation-flow',
        conversation_flow_id: flowId,
      },
      user_prompt: s.userPrompt,
      metrics: s.metrics,
      tool_mocks: flowMocks,
    });
    cases.push({ id: tc.test_case_definition_id, name: s.name, category: s.category });
    console.log(`    Created: "${s.name}" (${tc.test_case_definition_id})`);
    await sleep(200);
  }
  return cases;
}

async function runBatchTest(
  testCaseIds: string[],
  responseEngine: Record<string, any>,
  label: string,
): Promise<{ batch: any; runs: any[] }> {
  const batch = await retellRequest<any>('POST', '/create-batch-test', {
    test_case_definition_ids: testCaseIds,
    response_engine: responseEngine,
  });

  console.log(`    Batch ${label}: ${batch.test_case_batch_job_id} (${batch.total_count} tests)`);

  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const status = await retellRequest<any>(
      'GET',
      `/get-batch-test/${batch.test_case_batch_job_id}`,
    );
    const completed = status.pass_count + status.fail_count + status.error_count;
    process.stdout.write(
      `\r    [${label}] ${completed}/${status.total_count} (pass: ${status.pass_count}, fail: ${status.fail_count}, err: ${status.error_count})`,
    );
    if (status.status === 'complete') {
      console.log(' — DONE');
      let runs: any[] = [];
      try {
        runs = await retellRequest<any[]>('GET', `/list-test-runs/${batch.test_case_batch_job_id}`);
      } catch {
        console.log(`    Warning: could not fetch runs for ${label}`);
      }
      return { batch: status, runs };
    }
  }

  throw new Error(`Batch test ${label} timed out after 10 minutes`);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function teardownFlowAgent(agent: DeployedFlowAgent): Promise<void> {
  try {
    await retellRequest('DELETE', `/delete-agent/${agent.agentId}`);
    await sleep(200);
  } catch { /* best effort */ }
  try {
    await retellRequest('DELETE', `/delete-conversation-flow/${agent.conversationFlowId}`);
  } catch { /* best effort */ }
}

async function deleteTestCases(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await retellRequest('DELETE', `/delete-test-case-definition/${id}`);
      await sleep(100);
    } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Latency extraction
// ---------------------------------------------------------------------------

function getTranscript(run: any): any[] {
  return run?.transcript_snapshot?.transcript ?? run?.test_case_result?.transcript ?? run?.transcript ?? [];
}

function extractResponseTimes(run: any): number[] {
  const transcript = getTranscript(run);
  if (transcript.length < 2) return [];
  const times: number[] = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    const msg = transcript[i];
    if (msg?.role !== 'user' || !msg?.created_timestamp) continue;
    for (let j = i + 1; j < transcript.length; j++) {
      const next = transcript[j];
      if (next?.role === 'agent' && next?.created_timestamp) {
        const delta = next.created_timestamp - msg.created_timestamp;
        if (delta > 0) times.push(delta);
        break;
      }
      if (next?.role === 'user') break;
    }
  }
  return times;
}

interface LatencyStats {
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  minMs: number;
  totalMs: number;
  count: number;
}

function emptyStats(): LatencyStats {
  return { avgMs: 0, p95Ms: 0, maxMs: 0, minMs: 0, totalMs: 0, count: 0 };
}

function statsFromValues(values: number[]): LatencyStats {
  if (values.length === 0) return emptyStats();
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, d) => s + d, 0);
  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  return {
    avgMs: Math.round(sum / sorted.length),
    p95Ms: sorted[p95Idx]!,
    maxMs: sorted[sorted.length - 1]!,
    minMs: sorted[0]!,
    totalMs: sum,
    count: sorted.length,
  };
}

function extractResponseTimeStats(runs: any[]): LatencyStats {
  return statsFromValues(runs.flatMap(extractResponseTimes));
}

function getRunAvgResponseMs(run: any): number | null {
  const times = extractResponseTimes(run);
  if (times.length === 0) return null;
  return Math.round(times.reduce((s, t) => s + t, 0) / times.length);
}

// ---------------------------------------------------------------------------
// Comparison output
// ---------------------------------------------------------------------------

interface ModelResult {
  model: string;
  batch: { total_count: number; pass_count: number; fail_count: number; error_count: number };
  runs: any[];
  testCases: TestCaseMapping[];
  testCaseIds: string[];
  agent: DeployedFlowAgent;
}

function printComparison(results: ModelResult[]): void {
  const scenarioCount = results[0]?.testCases.length ?? 0;
  const COL = 22;
  const METRIC = 28;

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  CONVERSATION FLOW SIMULATION RESULTS (${scenarioCount} scenarios)`);
  console.log(`  Version: ${CONVERSATION_FLOW_VERSION}`);
  console.log(`${'═'.repeat(90)}`);

  const header = '  ' + 'Metric'.padEnd(METRIC) + results.map((r) => r.model.padStart(COL)).join('');
  console.log(header);
  console.log('  ' + '─'.repeat(METRIC + COL * results.length));

  const rows: [string, ...string[]][] = [
    ['Total', ...results.map((r) => `${r.batch.total_count}`)],
    ['Passed', ...results.map((r) => `${r.batch.pass_count}`)],
    ['Failed', ...results.map((r) => `${r.batch.fail_count}`)],
    ['Errors', ...results.map((r) => `${r.batch.error_count}`)],
    ['Pass Rate', ...results.map((r) => {
      const total = r.batch.total_count || 1;
      return `${((r.batch.pass_count / total) * 100).toFixed(1)}%`;
    })],
  ];
  for (const [metric, ...vals] of rows) {
    console.log('  ' + metric.padEnd(METRIC) + vals.map((v) => v.padStart(COL)).join(''));
  }

  // Response time
  const latencyStats = results.map((r) => extractResponseTimeStats(r.runs));
  const hasRT = latencyStats.some((s) => s.count > 0);
  const fmtMs = (ms: number) => (ms > 0 ? `${ms}ms` : 'N/A');

  if (hasRT) {
    console.log('');
    console.log('  ' + '─'.repeat(METRIC + COL * results.length));
    console.log('  RESPONSE TIME');
    const rtRows: [string, ...string[]][] = [
      ['Avg Response Time', ...latencyStats.map((s) => fmtMs(s.avgMs))],
      ['P95 Response Time', ...latencyStats.map((s) => fmtMs(s.p95Ms))],
      ['Max Response Time', ...latencyStats.map((s) => fmtMs(s.maxMs))],
    ];
    for (const [metric, ...vals] of rtRows) {
      console.log('  ' + metric.padEnd(METRIC) + vals.map((v) => v.padStart(COL)).join(''));
    }
  }

  // Per-category breakdown
  if (results.length > 0 && results[0]!.testCases.length > 0) {
    const categories = [...new Set(results[0]!.testCases.map((tc) => tc.category))];
    console.log(`\n  Per-Category Breakdown:`);
    console.log('  ' + '─'.repeat(METRIC + COL * results.length));

    for (const cat of categories) {
      const catNames = results[0]!.testCases.filter((tc) => tc.category === cat).map((tc) => tc.name);
      const catVals = results.map((r) => {
        const catTcIds = new Set(r.testCases.filter((tc) => catNames.includes(tc.name)).map((tc) => tc.id));
        const catRuns = r.runs.filter((run: any) => catTcIds.has(run.test_case_definition_id));
        const passed = catRuns.filter((run: any) => run.status === 'pass').length;
        const total = catRuns.length;
        return total > 0 ? `${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)` : 'N/A';
      });
      console.log('  ' + cat.padEnd(METRIC) + catVals.map((v) => v.padStart(COL)).join(''));
    }
  }

  // Per-test detail
  if (results.length > 0 && results[0]!.testCases.length > 0) {
    console.log(`\n  Per-Test Detail:`);
    console.log('  ' + '─'.repeat(METRIC + COL * results.length));

    for (const tc of results[0]!.testCases) {
      const shortName = tc.name.length > METRIC - 2 ? tc.name.substring(0, METRIC - 5) + '...' : tc.name;
      const vals = results.map((r) => {
        const matchingTc = r.testCases.find((t) => t.name === tc.name);
        if (!matchingTc) return '—'.padStart(COL);
        const run = r.runs.find((run: any) => run.test_case_definition_id === matchingTc.id);
        if (!run) return '?'.padStart(COL);
        const icon = run.status === 'pass' ? '✅' : run.status === 'fail' ? '❌' : '💥';
        const avgRT = getRunAvgResponseMs(run);
        const rtStr = avgRT ? ` ${avgRT}ms` : '';
        return `${icon} ${run.status}${rtStr}`.padStart(COL);
      });
      console.log('  ' + shortName.padEnd(METRIC) + vals.join(''));
    }
  }

  console.log(`\n${'═'.repeat(90)}\n`);
}

function saveResults(results: ModelResult[]): string {
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dir = process.env.RESULTS_DIR || path.dirname(new URL(import.meta.url).pathname);
  const file = path.join(dir, `flow-sim-${ts}.json`);

  fs.writeFileSync(file, JSON.stringify({
    timestamp: new Date().toISOString(),
    suite: SUITE_NAME,
    arch: 'conversation_flow',
    version: CONVERSATION_FLOW_VERSION,
    scenarioCount: results[0]?.testCases.length ?? 0,
    models: MODELS,
    results: results.map((r) => ({
      model: r.model,
      passRate: r.batch.total_count > 0
        ? ((r.batch.pass_count / r.batch.total_count) * 100).toFixed(1) + '%'
        : 'N/A',
      batch: r.batch,
      responseTime: extractResponseTimeStats(r.runs),
      runs: r.runs,
    })),
  }, null, 2));

  console.log(`  Results saved: ${path.basename(file)}`);
  return file;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const suite = SCENARIO_SUITES[SUITE_NAME];
  if (!suite) {
    console.error(`Unknown suite: "${SUITE_NAME}". Available: ${Object.keys(SCENARIO_SUITES).join(', ')}`);
    process.exit(1);
  }

  // Filter handoff-only scenarios (routing is automatic in conversation flow)
  const scenarios = suite.filter((s) => !s.requiresAgentSwap);
  const skipped = suite.length - scenarios.length;

  console.log(`${'═'.repeat(90)}`);
  console.log(`  CONVERSATION FLOW SIMULATION TEST`);
  console.log(`  Version: ${CONVERSATION_FLOW_VERSION}`);
  console.log(`  Suite: ${SUITE_NAME} (${scenarios.length} scenarios${skipped ? `, ${skipped} handoff-only skipped` : ''})`);
  console.log(`  Models: ${MODELS.join(' vs ')}`);
  console.log(`  Cleanup: ${KEEP_ALL ? 'KEEP all agents' : 'DELETE after'}`);
  console.log(`${'═'.repeat(90)}`);

  const modelResults: ModelResult[] = [];

  try {
    for (const model of MODELS) {
      console.log(`\n${'─'.repeat(90)}`);
      console.log(`  Deploying conversation flow agent for ${model}...`);
      const agent = await deployFlowAgent(model);
      console.log(`  Deployed: agent=${agent.agentId} flow=${agent.conversationFlowId}`);

      console.log(`  Creating test cases (${scenarios.length})...`);
      let testCases: TestCaseMapping[] = [];
      try {
        testCases = await createFlowTestCases(agent.conversationFlowId, scenarios);
      } catch (err) {
        console.log(`  ERROR creating flow test cases: ${err instanceof Error ? err.message : err}`);
        modelResults.push({
          model,
          batch: { total_count: scenarios.length, pass_count: 0, fail_count: 0, error_count: scenarios.length },
          runs: [],
          testCases: [],
          testCaseIds: [],
          agent,
        });
        continue;
      }
      console.log(`  Created ${testCases.length} test cases`);

      if (testCases.length === 0) {
        modelResults.push({
          model,
          batch: { total_count: 0, pass_count: 0, fail_count: 0, error_count: 0 },
          runs: [],
          testCases,
          testCaseIds: [],
          agent,
        });
        continue;
      }

      console.log(`  Running batch tests (${model})...`);
      let batch = { total_count: 0, pass_count: 0, fail_count: 0, error_count: 0 };
      let allRuns: any[] = [];

      try {
        const result = await runBatchTest(
          testCases.map((tc) => tc.id),
          { type: 'conversation-flow', conversation_flow_id: agent.conversationFlowId },
          model,
        );
        batch = result.batch;
        allRuns = result.runs;
      } catch (batchErr) {
        console.log(`  Error running batch: ${batchErr instanceof Error ? batchErr.message : batchErr}`);
        batch.error_count += testCases.length;
        batch.total_count += testCases.length;
      }

      modelResults.push({
        model,
        batch,
        runs: allRuns,
        testCases,
        testCaseIds: testCases.map((tc) => tc.id),
        agent,
      });
    }

    printComparison(modelResults);
    saveResults(modelResults);
  } finally {
    console.log('\n  Cleaning up...');
    for (const result of modelResults) {
      if (KEEP_ALL) {
        console.log(`  KEEPING ${result.model}: agent=${result.agent.agentId} flow=${result.agent.conversationFlowId}`);
      } else {
        console.log(`  Deleting ${result.model} flow agent...`);
        await deleteTestCases(result.testCaseIds);
        await teardownFlowAgent(result.agent);
      }
    }
    console.log('  Done');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
