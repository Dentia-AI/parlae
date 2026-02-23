#!/usr/bin/env npx tsx
/**
 * Deterministic Chat-Based Test Runner
 *
 * Drives scripted text conversations against individual assistants using
 * Vapi's Chat API (POST /chat). Verifies results deterministically from
 * actual tool calls visible in the Chat API response + text assertions.
 *
 * Key insight: Chat API with individual assistantId fires real webhook
 * tools, and tool calls + backend responses appear in the response output.
 *
 * Usage:
 *   npx tsx run-chat-tests.ts booking          # run booking scenarios
 *   npx tsx run-chat-tests.ts tool             # run tool verification
 *   npx tsx run-chat-tests.ts handoff          # run handoff scenarios
 *   npx tsx run-chat-tests.ts hipaa            # run HIPAA scenarios
 *   npx tsx run-chat-tests.ts all              # run all scenarios
 *   npx tsx run-chat-tests.ts list             # show available scenarios
 */

import { VAPI_SQUAD_ID } from './sim-config';

import {
  startChat,
  continueChat,
  vapiRequest,
  type ChatResponse,
} from './sim-api';

import {
  ALL_BOOKING_SCENARIOS,
  ALL_TOOL_SCENARIOS,
  ALL_HANDOFF_SCENARIOS,
  ALL_HIPAA_SCENARIOS,
  ALL_EMERGENCY_SCENARIOS,
  ALL_APPT_MGMT_SCENARIOS,
  ALL_CHAT_SCENARIOS,
  type ChatTestScenario,
  type StepAssertion,
  type ToolCallAssertion,
  type TranscriptAssertion,
  type AssistantRole,
} from './scenarios/chat-scenarios';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Assistant ID resolution from squad
// ---------------------------------------------------------------------------

interface SquadMember {
  assistantId: string;
  assistantName?: string;
  role: AssistantRole;
}

let cachedAssistantMap: Map<AssistantRole, string> | null = null;

async function getAssistantMap(): Promise<Map<AssistantRole, string>> {
  if (cachedAssistantMap) return cachedAssistantMap;

  const squad = await vapiRequest<any>('GET', `/squad/${VAPI_SQUAD_ID}`);
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
    let systemMsg =
      m.assistantOverrides?.model?.messages?.find(
        (msg: any) => msg.role === 'system',
      )?.content || '';

    // If no inline overrides, fetch the assistant by ID and check its prompt/name
    if (!systemMsg && assistantId) {
      try {
        const assistant = await vapiRequest<any>('GET', `/assistant/${assistantId}`);
        systemMsg = assistant.model?.messages?.find(
          (msg: any) => msg.role === 'system',
        )?.content || '';

        // Also try name-based matching as fallback
        const assistantName = (assistant.name || '').toLowerCase();
        const roleByName = nameToRole[assistantName];
        if (roleByName && !map.has(roleByName)) {
          map.set(roleByName, assistantId);
          console.log(`    ${roleByName} -> ${assistantId} (${assistant.name})`);
        }
      } catch {
        // skip if fetch fails
      }
    }

    for (const [sig, role] of Object.entries(roleSignatures)) {
      if (systemMsg.includes(sig) && !map.has(role)) {
        map.set(role, assistantId);
        console.log(`    ${role} -> ${assistantId} (prompt match)`);
        break;
      }
    }
  }

  cachedAssistantMap = map;
  return map;
}

async function getAssistantId(role: AssistantRole): Promise<string> {
  const map = await getAssistantMap();
  const id = map.get(role);
  if (!id) throw new Error(`No assistant found for role: ${role}`);
  return id;
}

// ---------------------------------------------------------------------------
// Tool call extraction from Chat API response
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
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
        } catch { /* */ }

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

// ---------------------------------------------------------------------------
// Assertion evaluation
// ---------------------------------------------------------------------------

interface AssertionResult {
  label: string;
  passed: boolean;
  detail?: string;
}

function evalTextAssertion(
  text: string,
  assertion: StepAssertion | TranscriptAssertion,
): AssertionResult {
  const label = assertion.label || `${assertion.type}: ${assertion.value}`;
  const lower = text.toLowerCase();

  switch (assertion.type) {
    case 'contains':
      return {
        label,
        passed: lower.includes(assertion.value.toLowerCase()),
        detail: !lower.includes(assertion.value.toLowerCase())
          ? `Expected to find "${assertion.value}"`
          : undefined,
      };
    case 'not_contains':
      return {
        label,
        passed: !lower.includes(assertion.value.toLowerCase()),
        detail: lower.includes(assertion.value.toLowerCase())
          ? `Found unwanted "${assertion.value}"`
          : undefined,
      };
    case 'regex': {
      try {
        const flags = assertion.value.startsWith('(?i)') ? 'i' : '';
        const pattern = assertion.value.replace(/^\(\?i\)/, '');
        const re = new RegExp(pattern, flags);
        const matched = re.test(text);
        return {
          label,
          passed: matched,
          detail: !matched ? `Regex /${pattern}/${flags} did not match` : undefined,
        };
      } catch {
        return { label, passed: false, detail: `Invalid regex: ${assertion.value}` };
      }
    }
    default:
      return { label, passed: false, detail: `Unknown assertion type` };
  }
}

function evalToolAssertion(
  toolCalls: ExtractedToolCall[],
  assertion: ToolCallAssertion,
): AssertionResult {
  const label = assertion.label || `${assertion.type}: ${assertion.toolName}`;
  const matching = toolCalls.filter((tc) => tc.toolName === assertion.toolName);

  switch (assertion.type) {
    case 'tool_called':
      return {
        label,
        passed: matching.length > 0,
        detail: matching.length === 0
          ? `${assertion.toolName} was never called (tools called: ${toolCalls.map((t) => t.toolName).join(', ') || 'none'})`
          : undefined,
      };
    case 'tool_not_called':
      return {
        label,
        passed: matching.length === 0,
        detail: matching.length > 0
          ? `${assertion.toolName} was called ${matching.length} time(s)`
          : undefined,
      };
    case 'tool_succeeded': {
      const succeeded = matching.some((tc) => tc.succeeded);
      return {
        label,
        passed: succeeded,
        detail: !succeeded
          ? matching.length === 0
            ? `${assertion.toolName} was never called`
            : `${assertion.toolName} was called but response did not include [SUCCESS]`
          : undefined,
      };
    }
    case 'tool_failed': {
      const failed = matching.some((tc) => !tc.succeeded);
      return {
        label,
        passed: failed,
        detail: !failed
          ? matching.length === 0
            ? `${assertion.toolName} was never called`
            : `${assertion.toolName} was called but all calls succeeded (expected failure)`
          : undefined,
      };
    }
    case 'tool_param_contains': {
      if (!assertion.paramKey || !assertion.paramValue) {
        return { label, passed: false, detail: 'paramKey and paramValue required' };
      }
      const found = matching.some((tc) => {
        const val = tc.arguments[assertion.paramKey!];
        return val !== undefined && String(val).toLowerCase().includes(assertion.paramValue!.toLowerCase());
      });
      return {
        label,
        passed: found,
        detail: !found
          ? `${assertion.toolName}.${assertion.paramKey} did not contain "${assertion.paramValue}" (actual: ${matching.map((tc) => JSON.stringify(tc.arguments[assertion.paramKey!])).join(', ') || 'not called'})`
          : undefined,
      };
    }
    case 'tool_param_exists': {
      if (!assertion.paramKey) {
        return { label, passed: false, detail: 'paramKey is required' };
      }
      const exists = matching.some((tc) => tc.arguments[assertion.paramKey!] !== undefined);
      return {
        label,
        passed: exists,
        detail: !exists
          ? matching.length === 0
            ? `${assertion.toolName} was never called`
            : `${assertion.toolName} was called but param "${assertion.paramKey}" was not present`
          : undefined,
      };
    }
    case 'tool_response_contains': {
      if (!assertion.paramValue) {
        return { label, passed: false, detail: 'paramValue (search text) is required' };
      }
      const respFound = matching.some((tc) =>
        tc.response.toLowerCase().includes(assertion.paramValue!.toLowerCase()),
      );
      return {
        label,
        passed: respFound,
        detail: !respFound
          ? matching.length === 0
            ? `${assertion.toolName} was never called`
            : `${assertion.toolName} response did not contain "${assertion.paramValue}"`
          : undefined,
      };
    }
    case 'tool_call_count': {
      const expected = assertion.count ?? 0;
      return {
        label,
        passed: matching.length === expected,
        detail: matching.length !== expected
          ? `${assertion.toolName} was called ${matching.length} time(s), expected ${expected}`
          : undefined,
      };
    }
    default:
      return { label, passed: false, detail: 'Unknown tool assertion type' };
  }
}

// ---------------------------------------------------------------------------
// Run a single chat scenario
// ---------------------------------------------------------------------------

interface StepResult {
  step: number;
  message: string;
  responseSnippet: string;
  textAssertions: AssertionResult[];
  toolAssertions: AssertionResult[];
  toolCalls: ExtractedToolCall[];
}

interface ScenarioResult {
  name: string;
  category: string;
  targetAssistant: AssistantRole;
  status: 'pass' | 'fail' | 'error';
  durationMs: number;
  stepResults: StepResult[];
  finalToolResults: AssertionResult[];
  transcriptResults: AssertionResult[];
  transcript: string;
  allToolCalls: ExtractedToolCall[];
  failureReason?: string;
  costUsd: number;
}

async function runScenario(scenario: ChatTestScenario): Promise<ScenarioResult> {
  const t0 = Date.now();
  const stepResults: StepResult[] = [];
  const allResponseTexts: string[] = [];
  const allToolCalls: ExtractedToolCall[] = [];
  let lastChatId: string | undefined;
  let totalCost = 0;

  try {
    const assistantId = await getAssistantId(scenario.targetAssistant);

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];

      let response: ChatResponse;
      if (i === 0) {
        response = await startChat(assistantId, step.userMessage);
      } else {
        response = await continueChat(lastChatId!, step.userMessage, assistantId);
      }

      lastChatId = response.id;
      totalCost += (response as any).cost || 0;

      const assistantMessages = (response.output || [])
        .filter((m) => m.role === 'assistant' && m.content)
        .map((m) => m.content)
        .join(' ');

      allResponseTexts.push(assistantMessages);

      const stepToolCalls = extractToolCalls(response);
      allToolCalls.push(...stepToolCalls);

      const textAssertions: AssertionResult[] = [];
      if (step.assertions) {
        for (const a of step.assertions) {
          textAssertions.push(evalTextAssertion(assistantMessages, a));
        }
      }

      const toolAssertionResults: AssertionResult[] = [];
      if (step.toolAssertions) {
        for (const a of step.toolAssertions) {
          toolAssertionResults.push(evalToolAssertion(stepToolCalls, a));
        }
      }

      stepResults.push({
        step: i + 1,
        message: step.userMessage.slice(0, 80),
        responseSnippet: assistantMessages.slice(0, 120),
        textAssertions,
        toolAssertions: toolAssertionResults,
        toolCalls: stepToolCalls,
      });

      await sleep(step.waitMs || 1000);
    }

    const fullTranscript = allResponseTexts.join('\n');

    // Final tool assertions — checked against ALL tool calls across all steps
    const finalToolResults: AssertionResult[] = [];
    if (scenario.finalToolAssertions) {
      for (const a of scenario.finalToolAssertions) {
        finalToolResults.push(evalToolAssertion(allToolCalls, a));
      }
    }

    const transcriptResults: AssertionResult[] = [];
    if (scenario.transcriptAssertions) {
      for (const a of scenario.transcriptAssertions) {
        transcriptResults.push(evalTextAssertion(fullTranscript, a));
      }
    }

    const allAssertions = [
      ...stepResults.flatMap((s) => [...s.textAssertions, ...s.toolAssertions]),
      ...finalToolResults,
      ...transcriptResults,
    ];
    const anyFailed = allAssertions.some((a) => !a.passed);

    return {
      name: scenario.name,
      category: scenario.category,
      targetAssistant: scenario.targetAssistant,
      status: anyFailed ? 'fail' : 'pass',
      durationMs: Date.now() - t0,
      stepResults,
      finalToolResults,
      transcriptResults,
      transcript: fullTranscript,
      allToolCalls,
      failureReason: anyFailed
        ? allAssertions.filter((a) => !a.passed).map((a) => a.label).join('; ')
        : undefined,
      costUsd: totalCost,
    };
  } catch (err) {
    return {
      name: scenario.name,
      category: scenario.category,
      targetAssistant: scenario.targetAssistant,
      status: 'error',
      durationMs: Date.now() - t0,
      stepResults,
      finalToolResults: [],
      transcriptResults: [],
      transcript: allResponseTexts.join('\n'),
      allToolCalls,
      failureReason: `${err}`,
      costUsd: totalCost,
    };
  }
}

// ---------------------------------------------------------------------------
// Run a suite of scenarios
// ---------------------------------------------------------------------------

async function runSuite(
  suiteName: string,
  scenarios: ChatTestScenario[],
): Promise<ScenarioResult[]> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  DETERMINISTIC CHAT TESTS: ${suiteName.toUpperCase()}`);
  console.log(`  Scenarios: ${scenarios.length}`);
  console.log(`  Squad: ${VAPI_SQUAD_ID}`);
  console.log(`  Mode: Individual assistant chat (real webhook tools)`);
  console.log(`${'='.repeat(70)}\n`);

  const assistantMap = await getAssistantMap();
  console.log('  Assistant mapping:');
  for (const [role, id] of assistantMap) {
    console.log(`    ${role}: ${id}`);
  }
  console.log('');

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`  > ${scenario.name} [${scenario.targetAssistant}] ... `);

    const result = await runScenario(scenario);

    if (result.status === 'pass') {
      console.log(`PASS (${formatDuration(result.durationMs)}, $${result.costUsd.toFixed(3)})`);
    } else if (result.status === 'fail') {
      console.log(`FAIL (${formatDuration(result.durationMs)}, $${result.costUsd.toFixed(3)})`);
      const failures = [
        ...result.stepResults.flatMap((s) => [...s.textAssertions, ...s.toolAssertions]).filter((a) => !a.passed),
        ...result.finalToolResults.filter((a) => !a.passed),
        ...result.transcriptResults.filter((a) => !a.passed),
      ];
      for (const f of failures) {
        console.log(`     X ${f.label}${f.detail ? `: ${f.detail}` : ''}`);
      }
    } else {
      console.log(`ERROR (${formatDuration(result.durationMs)})`);
      console.log(`     -> ${result.failureReason}`);
    }

    if (result.allToolCalls.length > 0) {
      const summary = result.allToolCalls
        .map((t) => `${t.toolName}(${t.succeeded ? 'ok' : 'err'})`)
        .join(', ');
      console.log(`     [Tools] ${summary}`);
    }

    results.push(result);
    await sleep(1500);
  }

  printSummary(suiteName, results);
  saveResults(suiteName, results);

  return results;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printSummary(label: string, results: ScenarioResult[]): void {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const rate = results.length ? ((passed / results.length) * 100).toFixed(1) : '0.0';

  const durations = results.map((r) => r.durationMs);
  const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);

  const totalToolAssertions = results.reduce(
    (n, r) => n + r.stepResults.reduce((m, s) => m + s.toolAssertions.length, 0) + r.finalToolResults.length,
    0,
  );
  const passedToolAssertions = results.reduce(
    (n, r) => n + r.stepResults.reduce((m, s) => m + s.toolAssertions.filter((a) => a.passed).length, 0) + r.finalToolResults.filter((a) => a.passed).length,
    0,
  );

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULTS: ${label}`);
  console.log(`  Pass: ${passed}  |  Fail: ${failed}  |  Error: ${errors}  |  Rate: ${rate}%`);
  console.log(`  Avg Duration: ${formatDuration(avgMs)}  |  Total Cost: $${totalCost.toFixed(3)}`);
  if (totalToolAssertions > 0) {
    console.log(`  Tool Assertions: ${passedToolAssertions}/${totalToolAssertions} passed`);
  }
  console.log(`${'='.repeat(70)}`);

  const failures = results.filter((r) => r.status !== 'pass');
  if (failures.length) {
    console.log('\n  FAILURES:');
    for (const f of failures) {
      console.log(`    X ${f.name} [${f.targetAssistant}]`);
      if (f.failureReason) console.log(`       ${f.failureReason}`);
    }
  }

  console.log('');
}

function saveResults(label: string, results: ScenarioResult[]): void {
  const fs = require('fs');
  const path = require('path');
  const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dir = process.env.RESULTS_DIR || path.dirname(new URL(import.meta.url).pathname);
  const file = path.join(
    dir,
    `chat-results-${label.toLowerCase().replace(/\s+/g, '-')}-${ts}.json`,
  );

  const output = {
    label,
    timestamp: new Date().toISOString(),
    squadId: VAPI_SQUAD_ID,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      errors: results.filter((r) => r.status === 'error').length,
      totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
    },
    results: results.map((r) => ({
      name: r.name,
      category: r.category,
      targetAssistant: r.targetAssistant,
      status: r.status,
      durationMs: r.durationMs,
      costUsd: r.costUsd,
      failureReason: r.failureReason,
      stepResults: r.stepResults,
      finalToolResults: r.finalToolResults,
      transcriptResults: r.transcriptResults,
      allToolCalls: r.allToolCalls,
      transcript: r.transcript,
    })),
  };

  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  console.log(`  Results saved: ${path.basename(file)}\n`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const SUITES: Record<string, { label: string; scenarios: ChatTestScenario[] }> = {
  booking: { label: 'Booking', scenarios: ALL_BOOKING_SCENARIOS },
  tool: { label: 'Tool Verification', scenarios: ALL_TOOL_SCENARIOS },
  handoff: { label: 'Handoff', scenarios: ALL_HANDOFF_SCENARIOS },
  hipaa: { label: 'HIPAA', scenarios: ALL_HIPAA_SCENARIOS },
  emergency: { label: 'Emergency', scenarios: ALL_EMERGENCY_SCENARIOS },
  appt: { label: 'Appointment-Mgmt', scenarios: ALL_APPT_MGMT_SCENARIOS },
  all: { label: 'All', scenarios: ALL_CHAT_SCENARIOS },
};

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === 'help') {
    console.log(`
Deterministic Chat Test Runner

Tests individual assistants via Vapi Chat API with real webhook tools.
Tool calls and responses are verified directly from the Chat API output.

Usage: npx tsx run-chat-tests.ts <suite>

Suites:
  booking        Run booking flow scenarios (${ALL_BOOKING_SCENARIOS.length})
  tool           Run tool verification scenarios (${ALL_TOOL_SCENARIOS.length})
  handoff        Run handoff scenarios (${ALL_HANDOFF_SCENARIOS.length})
  hipaa          Run HIPAA scenarios (${ALL_HIPAA_SCENARIOS.length})
  emergency      Run emergency/triage scenarios (${ALL_EMERGENCY_SCENARIOS.length})
  appt           Run cancel/reschedule scenarios (${ALL_APPT_MGMT_SCENARIOS.length})
  all            Run all scenarios (${ALL_CHAT_SCENARIOS.length})
  list           Show all scenarios

Environment:
  VAPI_API_KEY      Required
  VAPI_SQUAD_ID     Required (used to resolve assistant IDs)
    `);
    return;
  }

  if (command === 'list') {
    console.log('\nAvailable chat test scenarios:\n');
    for (const [key, suite] of Object.entries(SUITES)) {
      if (key === 'all') continue;
      console.log(`  ${key} (${suite.scenarios.length}):`);
      for (const s of suite.scenarios) {
        console.log(`    - ${s.name} [${s.targetAssistant}]`);
      }
    }
    console.log('');
    return;
  }

  const suite = SUITES[command];
  if (!suite) {
    console.error(`Unknown suite: ${command}. Run with 'help' for usage.`);
    process.exit(1);
  }

  await runSuite(suite.label, suite.scenarios);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
