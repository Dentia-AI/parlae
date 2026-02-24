#!/usr/bin/env npx tsx
/**
 * Retell AI Simulation Test Runner
 *
 * Uses Retell's native batch test API to:
 *   1. Deploy a test set of 6 agents (or reuse existing)
 *   2. Create test case definitions with tool mocks
 *   3. Run batch tests per model (gpt-5.2, gpt-4.1, gemini-3.0-flash)
 *   4. Poll for results and compare latency / pass rate
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx run-retell-sim.ts
 *   RETELL_API_KEY=... npx tsx run-retell-sim.ts --models gpt-4.1,gpt-5.2,gemini-3.0-flash
 *   RETELL_API_KEY=... npx tsx run-retell-sim.ts --keep-model gpt-5.2   # keep only gpt-5.2 agents
 *   RETELL_API_KEY=... npx tsx run-retell-sim.ts --suite booking         # run only booking suite
 *   RETELL_API_KEY=... npx tsx run-retell-sim.ts --suite all --keep      # run all, keep everything
 *
 * Environment:
 *   RETELL_API_KEY          Required
 *   RETELL_WEBHOOK_SECRET   Optional (defaults to 'test-secret')
 *   BACKEND_URL             Optional (defaults to 'https://httpbin.org/post')
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RETELL_API_KEY = process.env.RETELL_API_KEY ?? '';
const RETELL_WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET ?? 'test-secret';
const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://httpbin.org/post';
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

const MODELS = (getArg('--models') || 'gpt-4.1,gpt-5.2,gemini-3.0-flash').split(',').map((s) => s.trim());
const KEEP_ALL = cliArgs.includes('--keep');
const KEEP_MODEL = getArg('--keep-model');
const SUITE_NAME = getArg('--suite') || 'all';
const TARGET_ROLE = getArg('--agent-role');

// ---------------------------------------------------------------------------
// HTTP client
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
// Imports
// ---------------------------------------------------------------------------

import {
  RETELL_AGENT_DEFINITIONS,
  RETELL_POST_CALL_ANALYSIS,
  SHARED_RETELL_AGENT_CONFIG,
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

import type { RetellCustomTool, RetellTool } from '../retell.service';

import {
  ALL_RETELL_SCENARIOS,
  SCENARIO_SUITES,
  type RetellTestScenario,
} from './retell-test-scenarios';

const SKIP_AGENT_SWAP = !cliArgs.includes('--with-agent-swap');

function hydratePlaceholders(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tool resolution
// ---------------------------------------------------------------------------

const TOOL_GROUP_MAP: Record<string, RetellCustomTool[]> = {
  receptionist: RETELL_RECEPTIONIST_TOOLS,
  booking: RETELL_BOOKING_TOOLS,
  appointmentMgmt: RETELL_APPOINTMENT_MGMT_TOOLS,
  patientRecords: RETELL_PATIENT_RECORDS_TOOLS,
  insuranceBilling: RETELL_INSURANCE_BILLING_TOOLS,
  emergency: RETELL_EMERGENCY_TOOLS,
};

function hydrateTools(tools: RetellCustomTool[], webhookUrl: string, secret: string, accountId: string): RetellCustomTool[] {
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
// Deploy agents for testing (one set per model)
// ---------------------------------------------------------------------------

interface DeployedAgent {
  llmId: string;
  agentId: string;
  role: RetellAgentRole;
}

async function deployTestAgents(model: string): Promise<DeployedAgent[]> {
  const templateVars = {
    clinicName: 'Test Dental Clinic',
    clinicPhone: '+10000000000',
    accountId: 'sim-test',
  };

  const agents: DeployedAgent[] = [];
  const rolesToDeploy = TARGET_ROLE
    ? RETELL_AGENT_DEFINITIONS.filter((d) => d.role === TARGET_ROLE)
    : RETELL_AGENT_DEFINITIONS;

  const llmMap: Record<string, string> = {};
  const agentMap: Record<string, string> = {};
  const originalToolsMap: Record<string, RetellTool[]> = {};

  for (const def of rolesToDeploy) {
    const prompt = hydratePlaceholders(def.systemPrompt, templateVars);
    const beginMsg = hydratePlaceholders(def.beginMessage, templateVars);
    const pmsTools = hydrateTools(
      TOOL_GROUP_MAP[def.toolGroup] || [],
      BACKEND_URL,
      RETELL_WEBHOOK_SECRET,
      'sim-test',
    );

    const endCallTool = {
      type: 'end_call' as const,
      name: 'end_call',
      description: 'End the call when the caller is done.',
    };

    const baseTools: RetellTool[] = [...pmsTools, endCallTool];
    originalToolsMap[def.role] = baseTools;

    const llm = await retellRequest<any>('POST', '/create-retell-llm', {
      general_prompt: prompt,
      general_tools: baseTools,
      model,
      model_temperature: 0.3,
      tool_call_strict_mode: true,
      start_speaker: def.startSpeaker,
      begin_message: beginMsg,
    });
    llmMap[def.role] = llm.llm_id;

    await sleep(300);

    const agent = await retellRequest<any>('POST', '/create-agent', {
      agent_name: `SIM-${model}-${def.name}`,
      response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
      voice_id: '11labs-Adrian',
      ...SHARED_RETELL_AGENT_CONFIG,
      post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
      metadata: { role: def.role, model, isTest: true },
    });
    agentMap[def.role] = agent.agent_id;

    agents.push({ llmId: llm.llm_id, agentId: agent.agent_id, role: def.role });
    await sleep(300);
  }

  // Wire agent_swap tools (skip in simulation mode — Retell sim can't mock agent_swap)
  if (!SKIP_AGENT_SWAP) {
    for (const def of rolesToDeploy) {
      if (def.swapTargets.length === 0) continue;

      const swapTools = def.swapTargets
        .filter((t) => agentMap[t.role])
        .map((t) => ({
          type: 'agent_swap' as const,
          name: t.toolName,
          description: t.description,
          agent_id: agentMap[t.role],
          post_call_analysis_setting: 'both_agents' as const,
        }));

      if (swapTools.length === 0) continue;

      const baseTools = originalToolsMap[def.role] || [];
      await retellRequest('PATCH', `/update-retell-llm/${llmMap[def.role]}`, {
        general_tools: [...baseTools, ...swapTools],
      });
      await sleep(200);
    }
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Create test cases and run batch
// ---------------------------------------------------------------------------

interface TestCaseMapping {
  id: string;
  name: string;
  category: string;
}

async function createTestCases(
  agents: DeployedAgent[],
  scenarios: RetellTestScenario[],
): Promise<TestCaseMapping[]> {
  const testCases: TestCaseMapping[] = [];

  for (const scenario of scenarios) {
    const agent = agents.find((a) => a.role === scenario.role);
    if (!agent) {
      console.log(`    Skipping "${scenario.name}" — no agent for role ${scenario.role}`);
      continue;
    }

    const testCase = await retellRequest<any>('POST', '/create-test-case-definition', {
      name: scenario.name,
      response_engine: { type: 'retell-llm', llm_id: agent.llmId },
      user_prompt: scenario.userPrompt,
      metrics: scenario.metrics,
      tool_mocks: scenario.toolMocks,
    });

    testCases.push({
      id: testCase.test_case_definition_id,
      name: scenario.name,
      category: scenario.category,
    });
    console.log(`    Created: "${scenario.name}" (${testCase.test_case_definition_id})`);
    await sleep(200);
  }

  return testCases;
}

async function runBatchTest(
  testCaseIds: string[],
  llmId: string,
  label: string,
): Promise<any> {
  const batch = await retellRequest<any>('POST', '/create-batch-test', {
    test_case_definition_ids: testCaseIds,
    response_engine: { type: 'retell-llm', llm_id: llmId },
  });

  console.log(`    Batch ${label}: ${batch.test_case_batch_job_id} (${batch.total_count} tests)`);

  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const status = await retellRequest<any>(
      'GET',
      `/get-batch-test/${batch.test_case_batch_job_id}`,
    );

    const completed = status.pass_count + status.fail_count + status.error_count;
    process.stdout.write(`\r    [${label}] ${completed}/${status.total_count} (pass: ${status.pass_count}, fail: ${status.fail_count}, err: ${status.error_count})`);

    if (status.status === 'complete') {
      console.log(' — DONE');
      return status;
    }
  }

  throw new Error(`Batch test ${label} timed out after 10 minutes`);
}

async function getTestRuns(batchJobId: string): Promise<any[]> {
  return retellRequest<any[]>('GET', `/list-test-runs/${batchJobId}`);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function teardownAgents(agents: DeployedAgent[]): Promise<void> {
  for (const a of agents) {
    try {
      await retellRequest('DELETE', `/delete-agent/${a.agentId}`);
      await sleep(200);
      await retellRequest('DELETE', `/delete-retell-llm/${a.llmId}`);
      await sleep(200);
    } catch { /* best effort */ }
  }
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
// Comparison output with latency
// ---------------------------------------------------------------------------

interface ModelResult {
  model: string;
  batch: any;
  runs: any[];
  testCases: TestCaseMapping[];
  agents: DeployedAgent[];
  testCaseIds: string[];
}

function extractLatencyStats(runs: any[]): {
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  minMs: number;
  totalMs: number;
} {
  const durations = runs
    .map((r: any) => r.call_duration_ms ?? r.duration_ms ?? r.latency_ms ?? r.e2e_latency_ms ?? null)
    .filter((d: any): d is number => d !== null && d > 0);

  if (durations.length === 0) {
    return { avgMs: 0, p95Ms: 0, maxMs: 0, minMs: 0, totalMs: 0 };
  }

  durations.sort((a, b) => a - b);
  const sum = durations.reduce((s, d) => s + d, 0);
  const p95Idx = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);

  return {
    avgMs: Math.round(sum / durations.length),
    p95Ms: durations[p95Idx],
    maxMs: durations[durations.length - 1],
    minMs: durations[0],
    totalMs: sum,
  };
}

function printComparison(results: ModelResult[]): void {
  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  RETELL MODEL COMPARISON RESULTS (${results[0]?.testCases.length ?? 0} scenarios)`);
  console.log(`${'═'.repeat(90)}`);

  const colWidth = 22;
  const metricWidth = 28;
  const header = '  ' + 'Metric'.padEnd(metricWidth) + results.map((r) => r.model.padStart(colWidth)).join('');
  console.log(header);
  console.log('  ' + '─'.repeat(metricWidth + colWidth * results.length));

  const rows: [string, ...string[]][] = results.length > 0 ? [
    ['Total', ...results.map((r) => `${r.batch.total_count}`)],
    ['Passed', ...results.map((r) => `${r.batch.pass_count}`)],
    ['Failed', ...results.map((r) => `${r.batch.fail_count}`)],
    ['Errors', ...results.map((r) => `${r.batch.error_count}`)],
    ['Pass Rate', ...results.map((r) => {
      const total = r.batch.total_count || 1;
      return `${((r.batch.pass_count / total) * 100).toFixed(1)}%`;
    })],
  ] : [];

  for (const [metric, ...vals] of rows) {
    console.log('  ' + metric.padEnd(metricWidth) + vals.map((v) => v.padStart(colWidth)).join(''));
  }

  // Latency section
  const latencyStats = results.map((r) => extractLatencyStats(r.runs));
  const hasLatency = latencyStats.some((s) => s.avgMs > 0);

  if (hasLatency) {
    console.log('');
    console.log('  ' + '─'.repeat(metricWidth + colWidth * results.length));
    console.log('  ' + 'LATENCY'.padEnd(metricWidth));
    console.log('  ' + '─'.repeat(metricWidth + colWidth * results.length));

    const latencyRows: [string, ...string[]][] = [
      ['Avg Call Duration', ...latencyStats.map((s) => s.avgMs ? `${(s.avgMs / 1000).toFixed(1)}s` : 'N/A')],
      ['P95 Call Duration', ...latencyStats.map((s) => s.p95Ms ? `${(s.p95Ms / 1000).toFixed(1)}s` : 'N/A')],
      ['Max Call Duration', ...latencyStats.map((s) => s.maxMs ? `${(s.maxMs / 1000).toFixed(1)}s` : 'N/A')],
      ['Min Call Duration', ...latencyStats.map((s) => s.minMs ? `${(s.minMs / 1000).toFixed(1)}s` : 'N/A')],
    ];

    for (const [metric, ...vals] of latencyRows) {
      console.log('  ' + metric.padEnd(metricWidth) + vals.map((v) => v.padStart(colWidth)).join(''));
    }
  } else {
    console.log('\n  (Latency data not available from batch test runs — Retell may not expose per-run timing in this API)');
  }

  // Per-category breakdown
  if (results.length > 0 && results[0].testCases.length > 0) {
    const categories = [...new Set(results[0].testCases.map((tc) => tc.category))];

    console.log(`\n  Per-Category Breakdown:`);
    console.log('  ' + '─'.repeat(metricWidth + colWidth * results.length));

    for (const cat of categories) {
      const catNames = results[0].testCases.filter((tc) => tc.category === cat).map((tc) => tc.name);

      const catVals = results.map((r) => {
        const catTcIds = new Set(
          r.testCases.filter((tc) => catNames.includes(tc.name)).map((tc) => tc.id)
        );
        const catRuns = r.runs.filter((run: any) =>
          catTcIds.has(run.test_case_definition_id)
        );
        const passed = catRuns.filter((run: any) => run.status === 'pass').length;
        const total = catRuns.length;
        return total > 0 ? `${passed}/${total} (${((passed / total) * 100).toFixed(0)}%)` : 'N/A';
      });

      console.log('  ' + cat.padEnd(metricWidth) + catVals.map((v) => v.padStart(colWidth)).join(''));
    }
  }

  // Per-test breakdown — match by scenario name (test case IDs differ across models)
  if (results.length > 0 && results[0].testCases.length > 0) {
    console.log(`\n  Per-Test Detail:`);
    console.log('  ' + '─'.repeat(metricWidth + colWidth * results.length));

    for (const tc of results[0].testCases) {
      const shortName = tc.name.length > metricWidth - 2
        ? tc.name.substring(0, metricWidth - 5) + '...'
        : tc.name;

      const vals = results.map((r) => {
        const matchingTc = r.testCases.find((t) => t.name === tc.name);
        if (!matchingTc) return '—'.padStart(colWidth);
        const run = r.runs.find((run: any) => run.test_case_definition_id === matchingTc.id);
        if (!run) return '?'.padStart(colWidth);
        const icon = run.status === 'pass' ? '✅' : run.status === 'fail' ? '❌' : '💥';
        return `${icon} ${run.status}`.padStart(colWidth);
      });
      console.log('  ' + shortName.padEnd(metricWidth) + vals.join(''));
    }
  }

  console.log(`\n${'═'.repeat(90)}\n`);
}

function saveResults(results: ModelResult[]): string {
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dir = process.env.RESULTS_DIR || path.dirname(new URL(import.meta.url).pathname);
  const file = path.join(dir, `retell-sim-comparison-${ts}.json`);

  const latencyStats = results.map((r) => ({
    model: r.model,
    ...extractLatencyStats(r.runs),
  }));

  fs.writeFileSync(file, JSON.stringify({
    timestamp: new Date().toISOString(),
    suite: SUITE_NAME,
    scenarioCount: results[0]?.testCases.length ?? 0,
    models: MODELS,
    results: results.map((r) => ({
      model: r.model,
      passRate: r.batch.total_count > 0
        ? ((r.batch.pass_count / r.batch.total_count) * 100).toFixed(1) + '%'
        : 'N/A',
      batch: r.batch,
      latency: latencyStats.find((l) => l.model === r.model),
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
  const scenarios = (() => {
    let list: RetellTestScenario[];
    if (TARGET_ROLE) {
      list = ALL_RETELL_SCENARIOS.filter((s) => s.role === TARGET_ROLE);
    } else {
      const suite = SCENARIO_SUITES[SUITE_NAME];
      if (!suite) {
        console.error(`Unknown suite: "${SUITE_NAME}". Available: ${Object.keys(SCENARIO_SUITES).join(', ')}`);
        process.exit(1);
      }
      list = suite;
    }
    if (SKIP_AGENT_SWAP) {
      const before = list.length;
      list = list.filter((s) => !s.requiresAgentSwap);
      if (list.length < before) {
        console.log(`  (Skipping ${before - list.length} handoff scenarios — agent_swap not mockable in simulation)`);
      }
    }
    return list;
  })();

  const keepLabel = KEEP_ALL
    ? 'KEEP all agents'
    : KEEP_MODEL
      ? `KEEP ${KEEP_MODEL} agents only`
      : 'DELETE after';

  console.log(`${'═'.repeat(90)}`);
  console.log(`  RETELL SIMULATION TEST`);
  console.log(`  Suite: ${SUITE_NAME} (${scenarios.length} scenarios)`);
  console.log(`  Models: ${MODELS.join(' vs ')}`);
  console.log(`  Cleanup: ${keepLabel}`);
  console.log(`${'═'.repeat(90)}`);

  const modelResults: ModelResult[] = [];

  try {
    for (const model of MODELS) {
      console.log(`\n${'─'.repeat(90)}`);
      console.log(`  Deploying agents for ${model}...`);
      const agents = await deployTestAgents(model);
      console.log(`  Deployed ${agents.length} agents`);

      console.log(`  Creating test cases (${scenarios.length})...`);
      const testCases = await createTestCases(agents, scenarios);
      const testCaseIds = testCases.map((tc) => tc.id);
      console.log(`  Created ${testCases.length} test cases`);

      if (testCaseIds.length === 0) {
        console.log(`  No test cases to run for ${model}`);
        modelResults.push({ model, batch: { total_count: 0, pass_count: 0, fail_count: 0, error_count: 0 }, runs: [], testCases, agents, testCaseIds });
        continue;
      }

      // Group test cases by role → LLM ID for separate batch runs
      const roleToLlm = new Map<string, string>();
      const roleToTestCaseIds = new Map<string, string[]>();
      for (const tc of testCases) {
        const scenario = scenarios.find((s) => s.name === tc.name);
        const role = scenario?.role || 'receptionist';
        const agent = agents.find((a) => a.role === role);
        if (!agent) continue;
        roleToLlm.set(role, agent.llmId);
        if (!roleToTestCaseIds.has(role)) roleToTestCaseIds.set(role, []);
        roleToTestCaseIds.get(role)!.push(tc.id);
      }

      console.log(`  Running batch tests (${model}, ${roleToTestCaseIds.size} role groups)...`);

      let aggregatedBatch = { total_count: 0, pass_count: 0, fail_count: 0, error_count: 0 };
      let allRuns: any[] = [];

      for (const [role, ids] of roleToTestCaseIds) {
        const llmId = roleToLlm.get(role)!;
        try {
          const batch = await runBatchTest(ids, llmId, `${model}/${role}`);
          aggregatedBatch.total_count += batch.total_count || 0;
          aggregatedBatch.pass_count += batch.pass_count || 0;
          aggregatedBatch.fail_count += batch.fail_count || 0;
          aggregatedBatch.error_count += batch.error_count || 0;

          try {
            const runs = await getTestRuns(batch.test_case_batch_job_id);
            allRuns.push(...runs);
          } catch {
            console.log(`  Warning: could not fetch runs for ${role}`);
          }
        } catch (batchErr) {
          console.log(`  Error running batch for ${role}: ${batchErr instanceof Error ? batchErr.message : batchErr}`);
          aggregatedBatch.error_count += ids.length;
          aggregatedBatch.total_count += ids.length;
        }
      }

      modelResults.push({ model, batch: aggregatedBatch, runs: allRuns, testCases, agents, testCaseIds });
    }

    printComparison(modelResults);
    saveResults(modelResults);
  } finally {
    console.log('\n  Cleaning up...');

    for (const result of modelResults) {
      const shouldKeep =
        KEEP_ALL ||
        (KEEP_MODEL && result.model === KEEP_MODEL);

      if (shouldKeep) {
        console.log(`  ✅ KEEPING ${result.model} agents for manual testing:`);
        for (const a of result.agents) {
          console.log(`    ${a.role}: agent=${a.agentId} llm=${a.llmId}`);
        }
      } else {
        console.log(`  🗑️  Deleting ${result.model} agents...`);
        await deleteTestCases(result.testCaseIds);
        await teardownAgents(result.agents);
      }
    }

    console.log('  Done');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
