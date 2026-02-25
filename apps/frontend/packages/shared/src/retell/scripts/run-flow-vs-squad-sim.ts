#!/usr/bin/env npx tsx
/**
 * Flow vs Squad Comparison Simulation
 *
 * Deploys both a single-prompt squad (6 agents + agent_swap) and a
 * conversation-flow agent, runs the same set of test scenarios against
 * each, and prints a side-by-side comparison of pass rate + latency.
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx run-flow-vs-squad-sim.ts
 *   RETELL_API_KEY=... npx tsx run-flow-vs-squad-sim.ts --model gpt-4.1
 *   RETELL_API_KEY=... npx tsx run-flow-vs-squad-sim.ts --suite booking
 *   RETELL_API_KEY=... npx tsx run-flow-vs-squad-sim.ts --keep
 */

import * as fs from 'fs';
import * as path from 'path';

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
  type ToolMock,
} from '../tests/retell-test-scenarios';

import {
  buildDentalClinicFlow,
  CONVERSATION_FLOW_VERSION,
} from '../templates/conversation-flow/dental-clinic.flow-template';

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

const MODEL = getArg('--model') || 'gpt-4.1';
const SUITE_NAME = getArg('--suite') || 'all';
const KEEP_ALL = cliArgs.includes('--keep');

// ---------------------------------------------------------------------------
// HTTP client (retry + rate-limit handling)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function retellRequest<T = any>(
  method: string,
  apiPath: string,
  body?: any,
): Promise<T> {
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
      throw new Error(
        `Retell ${method} ${apiPath} (${res.status}): ${text.substring(0, 400)}`,
      );
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Retell ${method} ${apiPath}: max retries exceeded`);
}

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

const TOOL_GROUP_MAP: Record<string, RetellCustomTool[]> = {
  receptionist: RETELL_RECEPTIONIST_TOOLS,
  booking: RETELL_BOOKING_TOOLS,
  appointmentMgmt: RETELL_APPOINTMENT_MGMT_TOOLS,
  patientRecords: RETELL_PATIENT_RECORDS_TOOLS,
  insuranceBilling: RETELL_INSURANCE_BILLING_TOOLS,
  emergency: RETELL_EMERGENCY_TOOLS,
};

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
      'x-retell-secret': (tool.headers?.['x-retell-secret'] || '').replace(
        '{{secret}}',
        secret,
      ),
      'x-account-id': (tool.headers?.['x-account-id'] || '').replace(
        '{{accountId}}',
        accountId,
      ),
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
// Routing tool names that exist in squad but not in conversation flow
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

// ---------------------------------------------------------------------------
// Deploy squad agents (single-prompt, retell-llm)
// ---------------------------------------------------------------------------

interface DeployedSquadAgent {
  llmId: string;
  agentId: string;
  role: RetellAgentRole;
}

const SIM_ROUTING_ADDENDUM = `\n\n## SIMULATION ROUTING RULE\nWhen you call any routing tool (route_to_booking, route_to_emergency, route_to_appointment_mgmt, route_to_patient_records, route_to_insurance_billing, route_to_receptionist, transfer_call) and it returns [ROUTE_COMPLETE], the transfer is done. You MUST immediately call end_call. Do NOT speak to the caller again, do NOT attempt to help further, do NOT retry the route. Just call end_call.`;

async function deploySquadAgents(): Promise<DeployedSquadAgent[]> {
  console.log(`  Deploying squad agents (${MODEL})...`);
  const templateVars = {
    clinicName: 'Test Dental Clinic',
    clinicPhone: '+10000000000',
    accountId: 'sim-test',
  };

  const agents: DeployedSquadAgent[] = [];
  const llmMap: Record<string, string> = {};
  const originalToolsMap: Record<string, RetellTool[]> = {};

  for (const def of RETELL_AGENT_DEFINITIONS) {
    const prompt =
      hydratePlaceholders(def.systemPrompt, templateVars) + SIM_ROUTING_ADDENDUM;
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
      model: MODEL,
      model_temperature: 0.3,
      tool_call_strict_mode: true,
      start_speaker: def.startSpeaker,
      begin_message: beginMsg,
    });
    llmMap[def.role] = llm.llm_id;
    await sleep(300);

    const agent = await retellRequest<any>('POST', '/create-agent', {
      agent_name: `SIM-SQUAD-${MODEL}-${def.name}`,
      response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
      voice_id: '11labs-Adrian',
      ...SHARED_RETELL_AGENT_CONFIG,
      post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
      metadata: { role: def.role, model: MODEL, isTest: true, arch: 'squad' },
    });

    agents.push({ llmId: llm.llm_id, agentId: agent.agent_id, role: def.role });
    await sleep(300);
  }

  // Wire routing tools as mockable custom tools (simulation mode)
  for (const def of RETELL_AGENT_DEFINITIONS) {
    if (def.swapTargets.length === 0 && !def.transferToClinic) continue;

    const ROUTE_SUFFIX =
      ' [ROUTE_COMPLETE] The caller has been seamlessly transferred. Your part of this conversation is finished. Call end_call now.';

    const simRouteTools: RetellTool[] = def.swapTargets.map((t) => ({
      type: 'custom' as const,
      name: t.toolName,
      description: t.description,
      url: BACKEND_URL,
      speak_during_execution: false,
      speak_after_execution: false,
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
      headers: {},
      execution_message_description: 'Routing caller',
    }));

    if (def.transferToClinic) {
      simRouteTools.push({
        type: 'custom' as const,
        name: 'transfer_call',
        description: 'Transfer caller to clinic staff for immediate assistance.',
        url: BACKEND_URL,
        speak_during_execution: false,
        speak_after_execution: false,
        parameters: {
          type: 'object' as const,
          properties: {},
          required: [] as string[],
        },
        headers: {},
        execution_message_description: 'Transferring to clinic',
      });
    }

    const baseTools = originalToolsMap[def.role] || [];
    await retellRequest('PATCH', `/update-retell-llm/${llmMap[def.role]}`, {
      general_tools: [...baseTools, ...simRouteTools],
    });
    await sleep(200);
  }

  console.log(`  Squad: deployed ${agents.length} agents`);
  return agents;
}

// ---------------------------------------------------------------------------
// Deploy conversation flow agent
// ---------------------------------------------------------------------------

interface DeployedFlowAgent {
  agentId: string;
  conversationFlowId: string;
}

async function deployFlowAgent(): Promise<DeployedFlowAgent> {
  console.log(`  Deploying conversation flow agent (${MODEL})...`);

  const flowConfig = buildDentalClinicFlow({
    clinicName: 'Test Dental Clinic',
    // No clinicPhone — omit transfer_clinic node so sim doesn't fail on E.164 validation
    webhookUrl: BACKEND_URL,
    webhookSecret: RETELL_WEBHOOK_SECRET,
    accountId: 'sim-test',
  });

  const flow = await retellRequest<{
    conversation_flow_id: string;
    version: number;
  }>('POST', '/create-conversation-flow', flowConfig);

  await sleep(300);

  const agent = await retellRequest<{ agent_id: string }>('POST', '/create-agent', {
    agent_name: `SIM-FLOW-${MODEL}`,
    response_engine: {
      type: 'conversation-flow',
      conversation_flow_id: flow.conversation_flow_id,
    },
    voice_id: '11labs-Adrian',
    ...SHARED_RETELL_AGENT_CONFIG,
    post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
    metadata: { model: MODEL, isTest: true, arch: 'conversation_flow' },
  });

  console.log(
    `  Flow: agent=${agent.agent_id} flow=${flow.conversation_flow_id}`,
  );
  return {
    agentId: agent.agent_id,
    conversationFlowId: flow.conversation_flow_id,
  };
}

// ---------------------------------------------------------------------------
// Test case creation & batch execution
// ---------------------------------------------------------------------------

interface TestCaseMapping {
  id: string;
  name: string;
  category: string;
}

async function createSquadTestCases(
  agents: DeployedSquadAgent[],
  scenarios: RetellTestScenario[],
): Promise<TestCaseMapping[]> {
  const cases: TestCaseMapping[] = [];
  for (const s of scenarios) {
    const agent = agents.find((a) => a.role === s.role);
    if (!agent) continue;
    const tc = await retellRequest<any>('POST', '/create-test-case-definition', {
      name: `[SQUAD] ${s.name}`,
      response_engine: { type: 'retell-llm', llm_id: agent.llmId },
      user_prompt: s.userPrompt,
      metrics: s.metrics,
      tool_mocks: s.toolMocks,
    });
    cases.push({ id: tc.test_case_definition_id, name: s.name, category: s.category });
    await sleep(200);
  }
  return cases;
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

async function createFlowTestCases(
  flowId: string,
  scenarios: RetellTestScenario[],
): Promise<TestCaseMapping[]> {
  const cases: TestCaseMapping[] = [];
  for (const s of scenarios) {
    const flowMocks = mergeWithDefaults(stripRoutingMocks(s.toolMocks));
    const tc = await retellRequest<any>('POST', '/create-test-case-definition', {
      name: `[FLOW] ${s.name}`,
      response_engine: {
        type: 'conversation-flow',
        conversation_flow_id: flowId,
      },
      user_prompt: s.userPrompt,
      metrics: s.metrics,
      tool_mocks: flowMocks,
    });
    cases.push({ id: tc.test_case_definition_id, name: s.name, category: s.category });
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

  console.log(
    `    Batch ${label}: ${batch.test_case_batch_job_id} (${batch.total_count} tests)`,
  );

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
        runs = await retellRequest<any[]>(
          'GET',
          `/list-test-runs/${batch.test_case_batch_job_id}`,
        );
      } catch {
        console.log(`    Warning: could not fetch runs for ${label}`);
      }
      return { batch: status, runs };
    }
  }

  throw new Error(`Batch test ${label} timed out after 10 minutes`);
}

// ---------------------------------------------------------------------------
// Latency extraction — focused on agent response time after user messages
// ---------------------------------------------------------------------------

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

function getTranscript(run: any): any[] {
  return (
    run?.transcript_snapshot?.transcript ??
    run?.test_case_result?.transcript ??
    run?.transcript ??
    []
  );
}

/** Extract all user→agent response times from a single run's transcript */
function extractResponseTimes(run: any): number[] {
  const transcript = getTranscript(run);
  if (transcript.length < 2) return [];

  const times: number[] = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    const msg = transcript[i];
    if (msg?.role !== 'user' || !msg?.created_timestamp) continue;

    // Find the next agent message (skip tool calls in between)
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

/** Compute overall call duration from transcript timestamps */
function computeRunDuration(run: any): number | null {
  if (run?.call_duration_ms) return run.call_duration_ms;
  if (run?.duration_ms) return run.duration_ms;

  const transcript = getTranscript(run);
  if (transcript.length >= 2) {
    const stamps = transcript
      .map((m: any) => m.created_timestamp)
      .filter((t: any): t is number => typeof t === 'number' && t > 0);
    if (stamps.length >= 2) return Math.max(...stamps) - Math.min(...stamps);
  }

  if (run?.creation_timestamp && run?.user_modified_timestamp) {
    const diff = run.user_modified_timestamp - run.creation_timestamp;
    if (diff > 0) return diff;
  }
  return null;
}

/** Aggregate response time stats across all runs */
function extractResponseTimeStats(runs: any[]): LatencyStats {
  const allTimes = runs.flatMap(extractResponseTimes);
  return statsFromValues(allTimes);
}

/** Aggregate call duration stats across all runs */
function extractDurationStats(runs: any[]): LatencyStats {
  const durations = runs
    .map(computeRunDuration)
    .filter((d): d is number => d !== null && d > 0);
  return statsFromValues(durations);
}

/** Per-run average response time (shown in per-test detail) */
function getRunAvgResponseMs(run: any): number | null {
  const times = extractResponseTimes(run);
  if (times.length === 0) return null;
  return Math.round(times.reduce((s, t) => s + t, 0) / times.length);
}

// ---------------------------------------------------------------------------
// Comparison printing
// ---------------------------------------------------------------------------

interface ArchResult {
  label: string;
  batch: { total_count: number; pass_count: number; fail_count: number; error_count: number };
  runs: any[];
  testCases: TestCaseMapping[];
  testCaseIds: string[];
}

function printComparison(squad: ArchResult, flow: ArchResult): void {
  const scenarioCount = squad.testCases.length;
  const COL = 22;
  const METRIC = 30;

  console.log(`\n${'═'.repeat(80)}`);
  console.log(
    `  FLOW vs SQUAD COMPARISON (${scenarioCount} scenarios, model: ${MODEL})`,
  );
  console.log(`${'═'.repeat(80)}`);

  const header =
    '  ' +
    'Metric'.padEnd(METRIC) +
    'Squad'.padStart(COL) +
    'Flow'.padStart(COL);
  console.log(header);
  console.log('  ' + '─'.repeat(METRIC + COL * 2));

  const rows: [string, string, string][] = [
    ['Total', `${squad.batch.total_count}`, `${flow.batch.total_count}`],
    ['Passed', `${squad.batch.pass_count}`, `${flow.batch.pass_count}`],
    ['Failed', `${squad.batch.fail_count}`, `${flow.batch.fail_count}`],
    ['Errors', `${squad.batch.error_count}`, `${flow.batch.error_count}`],
    [
      'Pass Rate',
      `${((squad.batch.pass_count / (squad.batch.total_count || 1)) * 100).toFixed(1)}%`,
      `${((flow.batch.pass_count / (flow.batch.total_count || 1)) * 100).toFixed(1)}%`,
    ],
  ];

  for (const [metric, sVal, fVal] of rows) {
    console.log(
      '  ' + metric.padEnd(METRIC) + sVal.padStart(COL) + fVal.padStart(COL),
    );
  }

  // Response Time (user msg → agent reply)
  const squadRT = extractResponseTimeStats(squad.runs);
  const flowRT = extractResponseTimeStats(flow.runs);
  const hasRT = squadRT.count > 0 || flowRT.count > 0;

  // Call Duration (overall)
  const squadDur = extractDurationStats(squad.runs);
  const flowDur = extractDurationStats(flow.runs);

  const fmt = (ms: number) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'N/A');
  const fmtMs = (ms: number) => (ms > 0 ? `${ms}ms` : 'N/A');

  if (hasRT) {
    console.log('');
    console.log('  ' + '─'.repeat(METRIC + COL * 2));
    console.log('  RESPONSE TIME (user msg → agent reply)');
    console.log('  ' + '─'.repeat(METRIC + COL * 2));

    const rtRows: [string, string, string][] = [
      ['Avg Response Time', fmtMs(squadRT.avgMs), fmtMs(flowRT.avgMs)],
      ['P95 Response Time', fmtMs(squadRT.p95Ms), fmtMs(flowRT.p95Ms)],
      ['Max Response Time', fmtMs(squadRT.maxMs), fmtMs(flowRT.maxMs)],
      ['Min Response Time', fmtMs(squadRT.minMs), fmtMs(flowRT.minMs)],
      ['Sample Count', `${squadRT.count}`, `${flowRT.count}`],
    ];
    for (const [metric, sVal, fVal] of rtRows) {
      console.log(
        '  ' + metric.padEnd(METRIC) + sVal.padStart(COL) + fVal.padStart(COL),
      );
    }
  } else {
    console.log(
      '\n  (Response time data not available — transcripts may lack timestamps)',
    );
  }

  if (squadDur.count > 0 || flowDur.count > 0) {
    console.log('');
    console.log('  ' + '─'.repeat(METRIC + COL * 2));
    console.log('  CALL DURATION (overall)');
    console.log('  ' + '─'.repeat(METRIC + COL * 2));

    const durRows: [string, string, string][] = [
      ['Avg Duration', fmt(squadDur.avgMs), fmt(flowDur.avgMs)],
      ['P95 Duration', fmt(squadDur.p95Ms), fmt(flowDur.p95Ms)],
      ['Max Duration', fmt(squadDur.maxMs), fmt(flowDur.maxMs)],
      ['Min Duration', fmt(squadDur.minMs), fmt(flowDur.minMs)],
    ];
    for (const [metric, sVal, fVal] of durRows) {
      console.log(
        '  ' + metric.padEnd(METRIC) + sVal.padStart(COL) + fVal.padStart(COL),
      );
    }
  }

  // Per-category
  const categories = [...new Set(squad.testCases.map((tc) => tc.category))];
  console.log('');
  console.log('  Per-Category Breakdown:');
  console.log('  ' + '─'.repeat(METRIC + COL * 2));

  for (const cat of categories) {
    const catNames = squad.testCases
      .filter((tc) => tc.category === cat)
      .map((tc) => tc.name);

    const squadCatIds = new Set(
      squad.testCases.filter((tc) => catNames.includes(tc.name)).map((tc) => tc.id),
    );
    const squadCatRuns = squad.runs.filter((r) =>
      squadCatIds.has(r.test_case_definition_id),
    );
    const sPass = squadCatRuns.filter((r) => r.status === 'pass').length;
    const sTotal = squadCatRuns.length;

    const flowCatIds = new Set(
      flow.testCases.filter((tc) => catNames.includes(tc.name)).map((tc) => tc.id),
    );
    const flowCatRuns = flow.runs.filter((r) =>
      flowCatIds.has(r.test_case_definition_id),
    );
    const fPass = flowCatRuns.filter((r) => r.status === 'pass').length;
    const fTotal = flowCatRuns.length;

    const sStr =
      sTotal > 0
        ? `${sPass}/${sTotal} (${((sPass / sTotal) * 100).toFixed(0)}%)`
        : 'N/A';
    const fStr =
      fTotal > 0
        ? `${fPass}/${fTotal} (${((fPass / fTotal) * 100).toFixed(0)}%)`
        : 'N/A';

    console.log(
      '  ' + cat.padEnd(METRIC) + sStr.padStart(COL) + fStr.padStart(COL),
    );
  }

  // Per-test detail with latency
  console.log('');
  console.log('  Per-Test Detail:');
  console.log('  ' + '─'.repeat(METRIC + COL * 2));

  for (const tc of squad.testCases) {
    const shortName =
      tc.name.length > METRIC - 2
        ? tc.name.substring(0, METRIC - 5) + '...'
        : tc.name;

    const sRun = squad.runs.find(
      (r) => r.test_case_definition_id === tc.id,
    );
    const fTc = flow.testCases.find((f) => f.name === tc.name);
    const fRun = fTc
      ? flow.runs.find((r) => r.test_case_definition_id === fTc.id)
      : null;

    const fmtRun = (run: any) => {
      if (!run) return '?';
      const icon = run.status === 'pass' ? '✅' : run.status === 'fail' ? '❌' : '💥';
      const avgRT = getRunAvgResponseMs(run);
      const rtStr = avgRT ? ` ${avgRT}ms` : '';
      return `${icon} ${run.status}${rtStr}`;
    };

    console.log(
      '  ' +
        shortName.padEnd(METRIC) +
        fmtRun(sRun).padStart(COL) +
        fmtRun(fRun).padStart(COL),
    );
  }

  console.log(`\n${'═'.repeat(80)}\n`);
}

// ---------------------------------------------------------------------------
// Save results to JSON
// ---------------------------------------------------------------------------

function saveResults(squad: ArchResult, flow: ArchResult): string {
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dir =
    process.env.RESULTS_DIR ||
    path.dirname(new URL(import.meta.url).pathname);
  const file = path.join(dir, `flow-vs-squad-${ts}.json`);

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model: MODEL,
        suite: SUITE_NAME,
        scenarioCount: squad.testCases.length,
        squad: {
          passRate:
            squad.batch.total_count > 0
              ? `${((squad.batch.pass_count / squad.batch.total_count) * 100).toFixed(1)}%`
              : 'N/A',
          batch: squad.batch,
          responseTime: extractResponseTimeStats(squad.runs),
          callDuration: extractDurationStats(squad.runs),
          runs: squad.runs,
        },
        flow: {
          passRate:
            flow.batch.total_count > 0
              ? `${((flow.batch.pass_count / flow.batch.total_count) * 100).toFixed(1)}%`
              : 'N/A',
          batch: flow.batch,
          responseTime: extractResponseTimeStats(flow.runs),
          callDuration: extractDurationStats(flow.runs),
          runs: flow.runs,
        },
      },
      null,
      2,
    ),
  );

  console.log(`  Results saved: ${path.basename(file)}`);
  return file;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function teardownSquad(agents: DeployedSquadAgent[]): Promise<void> {
  for (const a of agents) {
    try {
      await retellRequest('DELETE', `/delete-agent/${a.agentId}`);
      await sleep(200);
      await retellRequest('DELETE', `/delete-retell-llm/${a.llmId}`);
      await sleep(200);
    } catch {
      /* best effort */
    }
  }
}

async function teardownFlow(flow: DeployedFlowAgent): Promise<void> {
  try {
    await retellRequest('DELETE', `/delete-agent/${flow.agentId}`);
    await sleep(200);
  } catch {
    /* best effort */
  }
  try {
    await retellRequest(
      'DELETE',
      `/delete-conversation-flow/${flow.conversationFlowId}`,
    );
  } catch {
    /* best effort */
  }
}

async function deleteTestCases(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await retellRequest('DELETE', `/delete-test-case-definition/${id}`);
      await sleep(100);
    } catch {
      /* best effort */
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Resolve scenarios
  const suite = SCENARIO_SUITES[SUITE_NAME];
  if (!suite) {
    console.error(
      `Unknown suite: "${SUITE_NAME}". Available: ${Object.keys(SCENARIO_SUITES).join(', ')}`,
    );
    process.exit(1);
  }

  // Filter to non-routing scenarios for a fair comparison
  const scenarios = suite.filter((s) => !s.requiresAgentSwap);
  const skipped = suite.length - scenarios.length;

  console.log(`${'═'.repeat(80)}`);
  console.log(`  FLOW vs SQUAD SIMULATION`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Suite: ${SUITE_NAME} (${scenarios.length} scenarios, ${skipped} handoff-only skipped)`);
  console.log(`  Cleanup: ${KEEP_ALL ? 'KEEP all agents' : 'DELETE after'}`);
  console.log(`${'═'.repeat(80)}`);

  let squadAgents: DeployedSquadAgent[] = [];
  let flowAgent: DeployedFlowAgent | null = null;
  let squadCases: TestCaseMapping[] = [];
  let flowCases: TestCaseMapping[] = [];

  try {
    // 1. Deploy both architectures
    console.log(`\n${'─'.repeat(80)}`);
    console.log('  PHASE 1: Deploy');
    squadAgents = await deploySquadAgents();
    flowAgent = await deployFlowAgent();

    // 2. Create test cases
    console.log(`\n${'─'.repeat(80)}`);
    console.log('  PHASE 2: Create test cases');
    console.log(`  Creating ${scenarios.length} squad test cases...`);
    squadCases = await createSquadTestCases(squadAgents, scenarios);
    console.log(`  Created ${squadCases.length} squad test cases`);

    console.log(`  Creating ${scenarios.length} flow test cases...`);
    let flowBatchSupported = true;
    try {
      flowCases = await createFlowTestCases(
        flowAgent.conversationFlowId,
        scenarios,
      );
      console.log(`  Created ${flowCases.length} flow test cases`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') || msg.includes('conversation-flow')) {
        console.log(
          `  WARNING: Retell rejected conversation-flow for test cases. Flow testing unavailable.`,
        );
        flowBatchSupported = false;
      } else {
        throw err;
      }
    }

    // 3. Run batch tests
    console.log(`\n${'─'.repeat(80)}`);
    console.log('  PHASE 3: Run batch tests');

    // Squad: batch per role
    const roleToLlm = new Map<string, string>();
    const roleToTcIds = new Map<string, string[]>();
    for (const tc of squadCases) {
      const scenario = scenarios.find((s) => s.name === tc.name);
      const role = scenario?.role || 'receptionist';
      const agent = squadAgents.find((a) => a.role === role);
      if (!agent) continue;
      roleToLlm.set(role, agent.llmId);
      if (!roleToTcIds.has(role)) roleToTcIds.set(role, []);
      roleToTcIds.get(role)!.push(tc.id);
    }

    let squadBatch = {
      total_count: 0,
      pass_count: 0,
      fail_count: 0,
      error_count: 0,
    };
    let squadRuns: any[] = [];

    console.log(`  Running squad batch tests (${roleToTcIds.size} role groups)...`);
    for (const [role, ids] of roleToTcIds) {
      const llmId = roleToLlm.get(role)!;
      try {
        const { batch, runs } = await runBatchTest(
          ids,
          { type: 'retell-llm', llm_id: llmId },
          `SQUAD/${role}`,
        );
        squadBatch.total_count += batch.total_count || 0;
        squadBatch.pass_count += batch.pass_count || 0;
        squadBatch.fail_count += batch.fail_count || 0;
        squadBatch.error_count += batch.error_count || 0;
        squadRuns.push(...runs);
      } catch (batchErr) {
        console.log(
          `  Error running squad batch for ${role}: ${batchErr instanceof Error ? batchErr.message : batchErr}`,
        );
        squadBatch.error_count += ids.length;
        squadBatch.total_count += ids.length;
      }
    }

    // Flow: try batch test with conversation-flow response engine
    let flowBatch = {
      total_count: 0,
      pass_count: 0,
      fail_count: 0,
      error_count: 0,
    };
    let flowRuns: any[] = [];

    if (flowBatchSupported && flowCases.length > 0) {
      console.log(`  Running flow batch tests...`);
      try {
        const { batch, runs } = await runBatchTest(
          flowCases.map((tc) => tc.id),
          {
            type: 'conversation-flow',
            conversation_flow_id: flowAgent.conversationFlowId,
          },
          'FLOW',
        );
        flowBatch = batch;
        flowRuns = runs;
      } catch (batchErr) {
        const msg =
          batchErr instanceof Error ? batchErr.message : String(batchErr);
        if (msg.includes('400')) {
          console.log(
            `\n  WARNING: Retell batch test API does not support conversation-flow.`,
          );
          console.log(
            `  Falling back to per-role batch tests with individual LLM mapping...`,
          );
          // Fallback: run each flow test case individually as a 1-item batch
          // using the conversation-flow response engine on the test case def itself
          for (const tc of flowCases) {
            try {
              const { batch: b, runs: r } = await runBatchTest(
                [tc.id],
                {
                  type: 'conversation-flow',
                  conversation_flow_id: flowAgent.conversationFlowId,
                },
                `FLOW/${tc.name.substring(0, 30)}`,
              );
              flowBatch.total_count += b.total_count || 0;
              flowBatch.pass_count += b.pass_count || 0;
              flowBatch.fail_count += b.fail_count || 0;
              flowBatch.error_count += b.error_count || 0;
              flowRuns.push(...r);
            } catch {
              flowBatch.total_count += 1;
              flowBatch.error_count += 1;
            }
          }
        } else {
          throw batchErr;
        }
      }
    } else if (!flowBatchSupported) {
      console.log(
        `  Skipping flow batch tests (test case creation failed).`,
      );
      flowBatch.total_count = scenarios.length;
      flowBatch.error_count = scenarios.length;
    }

    // 4. Print comparison
    const squadResult: ArchResult = {
      label: 'Squad',
      batch: squadBatch,
      runs: squadRuns,
      testCases: squadCases,
      testCaseIds: squadCases.map((tc) => tc.id),
    };

    const flowResult: ArchResult = {
      label: 'Flow',
      batch: flowBatch,
      runs: flowRuns,
      testCases: flowCases,
      testCaseIds: flowCases.map((tc) => tc.id),
    };

    printComparison(squadResult, flowResult);
    saveResults(squadResult, flowResult);
  } finally {
    // 5. Cleanup
    console.log('\n  Cleaning up...');

    if (KEEP_ALL) {
      console.log('  KEEPING all agents for manual testing:');
      for (const a of squadAgents) {
        console.log(`    Squad ${a.role}: agent=${a.agentId} llm=${a.llmId}`);
      }
      if (flowAgent) {
        console.log(
          `    Flow: agent=${flowAgent.agentId} flow=${flowAgent.conversationFlowId}`,
        );
      }
    } else {
      console.log('  Deleting squad agents...');
      await deleteTestCases(squadCases.map((tc) => tc.id));
      await teardownSquad(squadAgents);

      if (flowAgent) {
        console.log('  Deleting flow agent...');
        await deleteTestCases(flowCases.map((tc) => tc.id));
        await teardownFlow(flowAgent);
      }
    }

    console.log('  Done');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
