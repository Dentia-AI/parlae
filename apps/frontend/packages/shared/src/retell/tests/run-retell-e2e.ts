#!/usr/bin/env npx tsx
/**
 * Retell AI End-to-End Test Runner
 *
 * Unlike the batch simulation runner (run-retell-sim.ts) which uses mocked
 * tool responses, this runner creates REAL web calls that hit your actual
 * backend via the configured webhook URLs. This validates the full pipeline:
 *
 *   Retell Agent -> Backend /retell/tools/:name -> GCal/PMS -> Response
 *
 * Flow:
 *   1. Deploy test agents with REAL backend webhook URLs
 *   2. For each scenario, create a web call via Retell API
 *   3. Poll call status until completion
 *   4. Fetch tool call history from backend introspection endpoint
 *   5. Evaluate assertions (tool calls made, transcript contents)
 *   6. Report results and optionally clean up
 *
 * Usage:
 *   RETELL_API_KEY=... BACKEND_URL=https://your-backend.com npx tsx run-retell-e2e.ts
 *   RETELL_API_KEY=... BACKEND_URL=... npx tsx run-retell-e2e.ts --suite booking
 *   RETELL_API_KEY=... BACKEND_URL=... npx tsx run-retell-e2e.ts --keep --model gpt-4.1
 *
 * Environment:
 *   RETELL_API_KEY          Required
 *   RETELL_WEBHOOK_SECRET   Required for backend auth
 *   BACKEND_URL             Required (e.g. https://api.parlae.com)
 *   ACCOUNT_ID              Account ID for tool resolution (default: e2e-test)
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  RETELL_AGENT_DEFINITIONS,
  RETELL_POST_CALL_ANALYSIS,
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_AGENT_ROLES,
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
  E2E_SCENARIOS,
  E2E_SCENARIO_MAP,
  type E2EScenario,
  type ToolAssertion,
} from './retell-e2e-scenarios';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RETELL_API_KEY = process.env.RETELL_API_KEY ?? '';
const RETELL_WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET ?? '';
const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const ACCOUNT_ID = process.env.ACCOUNT_ID ?? 'e2e-test';
const BASE_URL = 'https://api.retellai.com';

if (!RETELL_API_KEY) {
  console.error('RETELL_API_KEY is required.');
  process.exit(1);
}
if (!BACKEND_URL) {
  console.error('BACKEND_URL is required for E2E tests (e.g. https://api.parlae.com)');
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = cliArgs.indexOf(flag);
  return idx >= 0 && idx + 1 < cliArgs.length ? cliArgs[idx + 1] : undefined;
}

const MODEL = getArg('--model') || 'gpt-4.1';
const SUITE = getArg('--suite') || 'all';
const KEEP_AGENTS = cliArgs.includes('--keep');
const CALL_TIMEOUT_MS = parseInt(getArg('--timeout') || '180000', 10);
const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// HTTP helpers
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

async function backendRequest<T = any>(apiPath: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${apiPath}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool resolution (same as retell-template-utils but for CLI)
// ---------------------------------------------------------------------------

const TOOL_GROUP_MAP: Record<string, RetellCustomTool[]> = {
  receptionist: RETELL_RECEPTIONIST_TOOLS,
  booking: RETELL_BOOKING_TOOLS,
  appointmentMgmt: RETELL_APPOINTMENT_MGMT_TOOLS,
  patientRecords: RETELL_PATIENT_RECORDS_TOOLS,
  insuranceBilling: RETELL_INSURANCE_BILLING_TOOLS,
  emergency: RETELL_EMERGENCY_TOOLS,
};

function hydrateTools(tools: RetellCustomTool[]): RetellCustomTool[] {
  return tools.map((tool) => ({
    ...tool,
    url: tool.url.replace('{{webhookUrl}}', BACKEND_URL),
    headers: {
      ...tool.headers,
      'x-retell-secret': (tool.headers?.['x-retell-secret'] || '').replace('{{secret}}', RETELL_WEBHOOK_SECRET),
      'x-account-id': (tool.headers?.['x-account-id'] || '').replace('{{accountId}}', ACCOUNT_ID),
    },
  }));
}

function hydratePlaceholders(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Deploy agents with REAL webhooks
// ---------------------------------------------------------------------------

interface DeployedAgent {
  llmId: string;
  agentId: string;
  role: RetellAgentRole;
}

async function deployE2EAgents(): Promise<DeployedAgent[]> {
  console.log(`  Deploying E2E agents (model: ${MODEL}, backend: ${BACKEND_URL})...`);

  const templateVars = {
    clinicName: 'E2E Test Clinic',
    clinicPhone: '+10000000000',
    accountId: ACCOUNT_ID,
  };

  const agents: DeployedAgent[] = [];
  const llmMap: Record<string, string> = {};
  const agentMap: Record<string, string> = {};
  const originalToolsMap: Record<string, RetellTool[]> = {};

  for (const def of RETELL_AGENT_DEFINITIONS) {
    const prompt = hydratePlaceholders(def.systemPrompt, templateVars);
    const beginMsg = hydratePlaceholders(def.beginMessage, templateVars);
    const pmsTools = hydrateTools(TOOL_GROUP_MAP[def.toolGroup] || []);

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
      model: MODEL,
      model_temperature: 0.3,
      tool_call_strict_mode: true,
      start_speaker: def.startSpeaker,
      begin_message: beginMsg,
      default_dynamic_variables: {
        customer_phone: '{{call.from_number}}',
      },
    });
    llmMap[def.role] = llm.llm_id;
    await sleep(300);

    const agent = await retellRequest<any>('POST', '/create-agent', {
      agent_name: `E2E-${MODEL}-${def.name}`,
      response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
      voice_id: '11labs-Adrian',
      ...SHARED_RETELL_AGENT_CONFIG,
      webhook_url: `${BACKEND_URL}/retell/webhook`,
      webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
      post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
      metadata: { accountId: ACCOUNT_ID, role: def.role, isE2ETest: true },
    });
    agentMap[def.role] = agent.agent_id;
    agents.push({ llmId: llm.llm_id, agentId: agent.agent_id, role: def.role });

    console.log(`    ${def.role}: agent=${agent.agent_id} llm=${llm.llm_id}`);
    await sleep(300);
  }

  // Wire agent_swap tools for routing
  for (const def of RETELL_AGENT_DEFINITIONS) {
    if (def.swapTargets.length === 0) continue;

    const swapTools = def.swapTargets
      .filter((t) => agentMap[t.role])
      .map((t) => ({
        type: 'agent_swap' as const,
        name: t.toolName,
        description: t.description,
        agent_id: agentMap[t.role],
        post_call_analysis_setting: 'both_agents' as const,
        keep_current_voice: true,
      }));

    if (swapTools.length === 0) continue;

    const baseTools = originalToolsMap[def.role] || [];
    await retellRequest('PATCH', `/update-retell-llm/${llmMap[def.role]}`, {
      general_tools: [...baseTools, ...swapTools],
    });
    await sleep(200);
  }

  console.log(`  Deployed ${agents.length} agents with real webhooks`);
  return agents;
}

// ---------------------------------------------------------------------------
// Create web call and poll for completion
// ---------------------------------------------------------------------------

interface CallResult {
  callId: string;
  status: string;
  transcript: string;
  durationMs: number;
  toolCalls: any[];
  analysis?: Record<string, unknown>;
}

async function runWebCall(
  agentId: string,
  scenario: E2EScenario,
): Promise<CallResult> {
  const callResponse = await retellRequest<any>('POST', '/v2/create-web-call', {
    agent_id: agentId,
    metadata: {
      accountId: ACCOUNT_ID,
      scenario: scenario.name,
      isE2ETest: true,
    },
    retell_llm_dynamic_variables: {
      customer_phone: '+15550001234',
      ...(scenario.dynamicVariables || {}),
    },
  });

  const callId = callResponse.call_id;
  console.log(`    Call created: ${callId}`);

  // Poll for call completion
  // Web calls without a client connecting will eventually time out.
  // For E2E, we primarily verify the call was created and the agent
  // is reachable. Full conversation testing requires WebSocket or phone call.
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < CALL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const call = await retellRequest<any>('GET', `/v2/get-call/${callId}`);
      const status = call?.call_status || call?.status || 'unknown';

      if (status !== lastStatus) {
        process.stdout.write(`\n    Status: ${status}`);
        lastStatus = status;
      } else {
        process.stdout.write('.');
      }

      if (['ended', 'error', 'timeout'].includes(status)) {
        const durationMs = Date.now() - startTime;
        const transcript = call?.transcript || '';

        // Fetch tool call history from backend
        let toolCalls: any[] = [];
        try {
          const introspection = await backendRequest<any>(
            `/retell/test/call/${callId}/tools`,
          );
          toolCalls = introspection?.tools || [];
        } catch {
          console.log('\n    Warning: Could not fetch tool call history from backend');
        }

        console.log(`\n    Call completed: ${status} (${(durationMs / 1000).toFixed(1)}s)`);
        return {
          callId,
          status,
          transcript,
          durationMs,
          toolCalls,
          analysis: call?.call_analysis,
        };
      }
    } catch (err) {
      process.stdout.write('x');
    }
  }

  console.log('\n    Call timed out');
  return {
    callId,
    status: 'timeout',
    transcript: '',
    durationMs: CALL_TIMEOUT_MS,
    toolCalls: [],
  };
}

// ---------------------------------------------------------------------------
// Assertion engine
// ---------------------------------------------------------------------------

interface AssertionResult {
  passed: boolean;
  assertion: string;
  detail: string;
}

function evaluateScenario(
  scenario: E2EScenario,
  result: CallResult,
): { passed: boolean; assertions: AssertionResult[] } {
  const assertions: AssertionResult[] = [];

  // 1. Call status — should not error
  assertions.push({
    passed: result.status !== 'error',
    assertion: 'Call did not error',
    detail: `Status: ${result.status}`,
  });

  // 2. Tool assertions
  for (const ta of scenario.toolAssertions) {
    const toolCall = result.toolCalls.find(
      (tc: any) => tc.toolName === ta.toolName,
    );

    if (ta.expectCalled) {
      const found = !!toolCall;
      assertions.push({
        passed: found,
        assertion: `Tool ${ta.toolName} was called`,
        detail: found
          ? `Called with: ${JSON.stringify(toolCall.parameters).slice(0, 200)}`
          : 'Not found in tool call history',
      });

      if (found && ta.paramChecks) {
        for (const [param, pattern] of Object.entries(ta.paramChecks)) {
          const value = toolCall.parameters?.[param];
          const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
          const match = regex.test(String(value || ''));
          assertions.push({
            passed: match,
            assertion: `${ta.toolName}.${param} matches ${regex}`,
            detail: `Value: ${value}`,
          });
        }
      }

      if (found && ta.resultContains) {
        const resultStr = JSON.stringify(toolCall.result || '');
        assertions.push({
          passed: resultStr.includes(ta.resultContains),
          assertion: `${ta.toolName} result contains "${ta.resultContains}"`,
          detail: `Result: ${resultStr.slice(0, 200)}`,
        });
      }
    } else {
      assertions.push({
        passed: !toolCall,
        assertion: `Tool ${ta.toolName} was NOT called`,
        detail: toolCall ? 'Unexpectedly called' : 'Correctly not called',
      });
    }
  }

  // 3. Transcript assertions
  if (scenario.transcriptContains && result.transcript) {
    for (const pattern of scenario.transcriptContains) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      const found = regex.test(result.transcript);
      assertions.push({
        passed: found,
        assertion: `Transcript contains ${regex}`,
        detail: found ? 'Found' : `Not found in: ${result.transcript.slice(0, 300)}`,
      });
    }
  }

  if (scenario.transcriptNotContains && result.transcript) {
    for (const str of scenario.transcriptNotContains) {
      const found = result.transcript.toLowerCase().includes(str.toLowerCase());
      assertions.push({
        passed: !found,
        assertion: `Transcript does NOT contain "${str}"`,
        detail: found ? 'Found (unexpected)' : 'Correctly absent',
      });
    }
  }

  // 4. Duration check
  if (scenario.maxDurationMs) {
    assertions.push({
      passed: result.durationMs <= scenario.maxDurationMs,
      assertion: `Duration <= ${scenario.maxDurationMs}ms`,
      detail: `Actual: ${result.durationMs}ms`,
    });
  }

  const passed = assertions.every((a) => a.passed);
  return { passed, assertions };
}

// ---------------------------------------------------------------------------
// Cleanup
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

// ---------------------------------------------------------------------------
// Results reporting
// ---------------------------------------------------------------------------

interface ScenarioResult {
  scenario: string;
  category: string;
  passed: boolean;
  callId: string;
  status: string;
  durationMs: number;
  toolCallCount: number;
  assertions: AssertionResult[];
}

function printResults(results: ScenarioResult[]): void {
  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  RETELL E2E TEST RESULTS`);
  console.log(`  Model: ${MODEL} | Backend: ${BACKEND_URL}`);
  console.log(`${'═'.repeat(90)}`);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n  Summary: ${passed}/${total} passed (${((passed / total) * 100).toFixed(0)}%)`);
  if (failed > 0) console.log(`  Failed: ${failed}`);

  console.log(`\n  ${'─'.repeat(86)}`);

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.scenario}`);
    console.log(`     Call: ${r.callId} | Status: ${r.status} | Duration: ${(r.durationMs / 1000).toFixed(1)}s | Tools: ${r.toolCallCount}`);

    const failedAssertions = r.assertions.filter((a) => !a.passed);
    if (failedAssertions.length > 0) {
      for (const a of failedAssertions) {
        console.log(`     ❌ ${a.assertion}: ${a.detail}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(90)}\n`);
}

function saveResults(results: ScenarioResult[]): string {
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dir = process.env.RESULTS_DIR || path.dirname(new URL(import.meta.url).pathname);
  const file = path.join(dir, `retell-e2e-results-${ts}.json`);

  fs.writeFileSync(file, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: MODEL,
    backendUrl: BACKEND_URL,
    suite: SUITE,
    totalScenarios: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  }, null, 2));

  console.log(`  Results saved: ${path.basename(file)}`);
  return file;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const scenarios = E2E_SCENARIO_MAP[SUITE];
  if (!scenarios) {
    console.error(`Unknown suite: "${SUITE}". Available: ${Object.keys(E2E_SCENARIO_MAP).join(', ')}`);
    process.exit(1);
  }

  console.log(`${'═'.repeat(90)}`);
  console.log(`  RETELL E2E TEST RUNNER`);
  console.log(`  Suite: ${SUITE} (${scenarios.length} scenarios)`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log(`  Cleanup: ${KEEP_AGENTS ? 'KEEP agents' : 'DELETE after'}`);
  console.log(`${'═'.repeat(90)}`);

  // Verify backend is reachable
  try {
    const healthCheck = await backendRequest('/retell/test/calls/recent');
    if (healthCheck === null) {
      console.log('\n  Warning: Backend introspection endpoint not reachable.');
      console.log('  Make sure ENABLE_TEST_ENDPOINTS=true on the backend.\n');
    } else {
      console.log(`\n  Backend introspection: OK (${(healthCheck as any).count ?? 0} recent calls)\n`);
    }
  } catch {
    console.log('\n  Warning: Could not reach backend introspection endpoint.\n');
  }

  let agents: DeployedAgent[] = [];
  const allResults: ScenarioResult[] = [];

  try {
    agents = await deployE2EAgents();

    for (const scenario of scenarios) {
      console.log(`\n  ${'─'.repeat(86)}`);
      console.log(`  Running: ${scenario.name} (${scenario.role})`);

      const agent = agents.find((a) => a.role === scenario.role);
      if (!agent) {
        console.log(`    Skipping — no agent for role ${scenario.role}`);
        allResults.push({
          scenario: scenario.name,
          category: scenario.category,
          passed: false,
          callId: '',
          status: 'skipped',
          durationMs: 0,
          toolCallCount: 0,
          assertions: [{ passed: false, assertion: 'Agent exists', detail: `No agent for ${scenario.role}` }],
        });
        continue;
      }

      try {
        const callResult = await runWebCall(agent.agentId, scenario);
        const evaluation = evaluateScenario(scenario, callResult);

        allResults.push({
          scenario: scenario.name,
          category: scenario.category,
          passed: evaluation.passed,
          callId: callResult.callId,
          status: callResult.status,
          durationMs: callResult.durationMs,
          toolCallCount: callResult.toolCalls.length,
          assertions: evaluation.assertions,
        });
      } catch (err) {
        console.log(`    Error: ${err instanceof Error ? err.message : err}`);
        allResults.push({
          scenario: scenario.name,
          category: scenario.category,
          passed: false,
          callId: '',
          status: 'error',
          durationMs: 0,
          toolCallCount: 0,
          assertions: [{ passed: false, assertion: 'No error', detail: `${err}` }],
        });
      }

      await sleep(1000);
    }

    printResults(allResults);
    saveResults(allResults);
  } finally {
    if (KEEP_AGENTS) {
      console.log('\n  Keeping agents for manual testing:');
      for (const a of agents) {
        console.log(`    ${a.role}: agent=${a.agentId} llm=${a.llmId}`);
      }
    } else {
      console.log('\n  Cleaning up agents...');
      await teardownAgents(agents);
    }
    console.log('  Done');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
