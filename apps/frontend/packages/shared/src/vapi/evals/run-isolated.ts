#!/usr/bin/env npx tsx
/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │              ISOLATED TEST RUNNER                           │
 * │                                                             │
 * │  Runs focused test suites one at a time so you can fix      │
 * │  issues incrementally. Uses settings from eval-config.ts.   │
 * │                                                             │
 * │  1. Edit eval-config.ts to set your model & temperature     │
 * │  2. Run:  npx tsx run-isolated.ts <suite> [group]           │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Examples:
 *   npx tsx run-isolated.ts triage                    # all triage tests (~85 tests)
 *   npx tsx run-isolated.ts triage emergency          # only emergency routing tests
 *   npx tsx run-isolated.ts triage scheduling         # only scheduling routing tests
 *   npx tsx run-isolated.ts triage priority           # only priority/edge case tests
 *   npx tsx run-isolated.ts scheduling                # all scheduling tests (~30 tests)
 *   npx tsx run-isolated.ts scheduling takeover       # only handoff takeover tests
 *   npx tsx run-isolated.ts scheduling continuation   # only "no dead air" tests
 *   npx tsx run-isolated.ts scheduling paramValidation # only param validation tests
 *   npx tsx run-isolated.ts tool-calls                # all tool param + response tests (~50 tests)
 *   npx tsx run-isolated.ts tool-calls scheduling     # scheduling tool param tests only
 *   npx tsx run-isolated.ts tool-calls insurance      # insurance tool param tests only
 *   npx tsx run-isolated.ts tool-calls payment        # payment tool param tests only
 *   npx tsx run-isolated.ts tool-calls response       # response evaluation tests only
 *   npx tsx run-isolated.ts hipaa                     # all HIPAA guardrail tests (~17 tests)
 *   npx tsx run-isolated.ts hipaa verification        # caller identity verification tests
 *   npx tsx run-isolated.ts hipaa phi-redaction       # PHI filtering / redaction tests
 *   npx tsx run-isolated.ts hipaa family              # family account handling tests
 *   npx tsx run-isolated.ts hipaa anti-hallucination  # medical advice refusal tests
 *   npx tsx run-isolated.ts hipaa renamed-tools       # v4.1 renamed tool verification
 *   npx tsx run-isolated.ts hipaa third-party         # third-party access prevention
 *   npx tsx run-isolated.ts list                      # show all available suites/groups
 *   npx tsx run-isolated.ts cleanup                   # delete all evals from Vapi
 */

import {
  VAPI_API_KEY,
  VAPI_SQUAD_ID,
  VAPI_BASE_URL,
  ACTIVE_MODEL,
  PROMPT_OVERRIDES,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  getEffectiveTemperature,
  getRunLabel,
} from './eval-config';

import {
  ALL_TRIAGE_TESTS,
  TRIAGE_TEST_GROUPS,
  TRIAGE_SUMMARY,
  type TriageTestGroup,
} from './tests/triage-handoff.tests';

import {
  ALL_SCHEDULING_TESTS,
  SCHEDULING_TEST_GROUPS,
  SCHEDULING_SUMMARY,
  type SchedulingTestGroup,
} from './tests/scheduling-flow.tests';

import {
  ALL_TOOL_CALL_TESTS,
  TOOL_CALL_TEST_GROUPS,
  TOOL_CALL_SUMMARY,
  type ToolCallTestGroup,
} from './tests/tool-calls.tests';

import {
  ALL_HIPAA_TESTS,
  HIPAA_TEST_GROUPS,
  HIPAA_SUMMARY,
  type HipaaTestGroup,
} from './tests/hipaa-guardrails.tests';

import type { EvalDefinition } from './dental-clinic-eval-suite';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

async function vapiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${VAPI_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

      if (attempt < MAX_RETRIES) {
        process.stdout.write(`\n     ⏳ Rate limited, waiting ${(waitMs / 1000).toFixed(0)}s (retry ${attempt + 1}/${MAX_RETRIES})... `);
        await sleep(waitMs);
        continue;
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vapi ${method} ${path} (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Vapi ${method} ${path}: max retries (${MAX_RETRIES}) exceeded`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Eval API
// ---------------------------------------------------------------------------

interface CreatedEval { id: string; name: string }

interface EvalRunCreated {
  evalRunId: string;
  workflowId: string;
}

interface EvalRunResult {
  id: string;
  evalId?: string;
  status: 'queued' | 'running' | 'ended';
  endedReason?: string;
  endedMessage?: string;
  cost?: number;
  results?: Array<{
    status: 'pass' | 'fail';
    messages: Array<{
      role: string;
      content?: string;
      toolCalls?: unknown[];
      judge?: { status: 'pass' | 'fail'; failureReason?: string };
      [key: string]: unknown;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Local eval ID cache — avoids fetching all evals from Vapi every run
// ---------------------------------------------------------------------------

const CACHE_FILE = new URL('.eval-cache.json', import.meta.url).pathname;

function loadCache(): Map<string, string> {
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, string>): void {
  const fs = require('fs');
  fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2));
}

async function upsertEval(
  def: EvalDefinition,
  cache: Map<string, string>,
): Promise<{ id: string; action: 'created' | 'updated' }> {
  const payload = {
    name: def.name,
    description: def.description,
    type: def.type,
    messages: def.messages,
  };

  const cachedId = cache.get(def.name);
  if (cachedId) {
    try {
      await vapiRequest<CreatedEval>('PATCH', `/eval/${cachedId}`, payload);
      return { id: cachedId, action: 'updated' };
    } catch (err) {
      // If 404, eval was deleted externally — fall through to create
      if (String(err).includes('404')) {
        cache.delete(def.name);
      } else {
        throw err;
      }
    }
  }

  const created = await vapiRequest<CreatedEval>('POST', '/eval', payload);
  cache.set(def.name, created.id);
  return { id: created.id, action: 'created' };
}

async function listRemoteEvals(): Promise<Array<{ id: string; name: string }>> {
  const all: Array<{ id: string; name: string }> = [];
  let page = 1;
  while (true) {
    const d = await vapiRequest<{ results: Array<{ id: string; name: string }> }>(
      'GET', `/eval?limit=100&page=${page}`,
    );
    if (!d.results || d.results.length === 0) break;
    all.push(...d.results);
    if (d.results.length < 100) break;
    page++;
    await sleep(500);
  }
  return all;
}

async function runEval(evalId: string, squadId: string): Promise<EvalRunCreated> {
  return vapiRequest<EvalRunCreated>('POST', '/eval/run', {
    type: 'eval',
    evalId,
    target: { type: 'squad', squadId },
  });
}

async function getEvalRun(runId: string): Promise<EvalRunResult> {
  return vapiRequest<EvalRunResult>('GET', `/eval/run/${runId}`);
}

async function waitForCompletion(runId: string): Promise<EvalRunResult> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const r = await getEvalRun(runId);
    if (r.status === 'ended') return r;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for eval run ${runId}`);
}

async function deleteEval(id: string): Promise<void> {
  await vapiRequest('DELETE', `/eval/${id}`);
}

// ---------------------------------------------------------------------------
// Squad model/prompt patching
// ---------------------------------------------------------------------------

async function patchSquadModel(): Promise<void> {
  const temp = getEffectiveTemperature();
  const hasPromptOverrides = Object.values(PROMPT_OVERRIDES).some((v) => v !== null);

  if (
    ACTIVE_MODEL.model === 'gpt-5-mini' &&
    ACTIVE_MODEL.provider === 'openai' &&
    temp === 0.3 &&
    !hasPromptOverrides
  ) {
    return; // defaults, no patch needed
  }

  console.log(`\n  Patching squad model → ${ACTIVE_MODEL.provider}/${ACTIVE_MODEL.model} (temp=${temp})`);

  const squad = await vapiRequest<{
    members: Array<{
      assistantId?: string;
      assistant?: { name: string; model: Record<string, unknown>; [k: string]: unknown };
      [k: string]: unknown;
    }>;
  }>('GET', `/squad/${VAPI_SQUAD_ID}`);

  const READONLY_FIELDS = ['id', 'orgId', 'createdAt', 'updatedAt', 'isServerUrlSecretSet'];

  const patchedMembers = await Promise.all(squad.members.map(async (member) => {
    if (member.assistantId) {
      const fetched = await vapiRequest<{ name: string; model: Record<string, unknown>; [k: string]: unknown }>(
        'GET', `/assistant/${member.assistantId}`,
      );
      const name = fetched.name;

      const modelOverride: Record<string, unknown> = {
        ...fetched.model,
        provider: ACTIVE_MODEL.provider,
        model: ACTIVE_MODEL.model,
        temperature: temp,
        maxTokens: ACTIVE_MODEL.maxTokens,
      };

      const overrides: Record<string, unknown> = {
        ...(member['assistantOverrides'] as Record<string, unknown> ?? {}),
        model: modelOverride,
      };

      const promptOverride = PROMPT_OVERRIDES[name];
      if (promptOverride) {
        overrides['firstMessage'] = name === 'Receptionist' ? fetched['firstMessage'] : '';
        overrides['model'] = {
          ...modelOverride,
          messages: [{ role: 'system', content: promptOverride }],
        };
        console.log(`    ↳ Prompt override applied for: ${name}`);
      }

      return { ...member, assistantOverrides: overrides };
    }

    if (!member.assistant) {
      throw new Error('Squad member has neither assistant nor assistantId');
    }

    const name = member.assistant.name;
    const stripped = { ...member.assistant };
    for (const key of READONLY_FIELDS) delete (stripped as Record<string, unknown>)[key];

    const updatedModel = {
      ...stripped.model,
      provider: ACTIVE_MODEL.provider,
      model: ACTIVE_MODEL.model,
      temperature: temp,
      maxTokens: ACTIVE_MODEL.maxTokens,
    };

    const promptOverride = PROMPT_OVERRIDES[name];
    const updatedAssistant: Record<string, unknown> = {
      ...stripped,
      model: updatedModel,
      ...(promptOverride ? { firstMessage: name === 'Receptionist' ? stripped['firstMessage'] : '' } : {}),
    };

    if (promptOverride) {
      (updatedAssistant.model as Record<string, unknown>)['messages'] = [
        { role: 'system', content: promptOverride },
      ];
      console.log(`    ↳ Prompt override applied for: ${name}`);
    }

    return { ...member, assistant: updatedAssistant };
  }));

  await vapiRequest('PATCH', `/squad/${VAPI_SQUAD_ID}`, { members: patchedMembers });
  console.log('  Squad patched successfully.\n');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface ConversationMessage {
  role: string;
  content?: string;
  toolCalls?: unknown[];
  judge?: { status: 'pass' | 'fail'; failureReason?: string };
}

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'error';
  failureReason?: string;
  durationMs?: number;
  endedReason?: string;
  conversation?: ConversationMessage[];
}

async function runTests(defs: EvalDefinition[], suiteName: string): Promise<void> {
  const label = `${suiteName}-${getRunLabel()}`;

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  ${suiteName.toUpperCase()} TESTS`);
  console.log(`  Model: ${ACTIVE_MODEL.provider}/${ACTIVE_MODEL.model}`);
  console.log(`  Temperature: ${getEffectiveTemperature()}`);
  console.log(`  Squad: ${VAPI_SQUAD_ID}`);
  console.log(`  Tests: ${defs.length}`);
  console.log(`  Label: ${label}`);
  console.log(`${'═'.repeat(65)}\n`);

  await patchSquadModel();

  const results: TestResult[] = [];
  const cache = loadCache();

  let numCreated = 0;
  let numUpdated = 0;
  const prepared: Array<{ def: EvalDefinition; evalId: string }> = [];
  console.log(`  Syncing ${defs.length} evals...\n`);
  for (const def of defs) {
    try {
      const { id, action } = await upsertEval(def, cache);
      prepared.push({ def, evalId: id });
      if (action === 'updated') numUpdated++;
      else numCreated++;
    } catch (err) {
      console.error(`  ✗ Upsert failed: ${def.name} — ${err}`);
      results.push({ name: def.name, status: 'error', failureReason: `${err}` });
    }
    await sleep(800);
  }
  saveCache(cache);

  console.log(`  ${numCreated} created, ${numUpdated} updated.\n`);
  console.log(`Running ${prepared.length} evals...\n`);

  for (const { def, evalId } of prepared) {
    const t0 = Date.now();
    try {
      process.stdout.write(`  ▶ ${def.name} ... `);
      const run = await runEval(evalId, VAPI_SQUAD_ID);
      const result = await waitForCompletion(run.evalRunId);
      const ms = Date.now() - t0;

      const evalResult = result.results?.[0];
      const status = evalResult?.status || 'error';
      let reason: string | undefined;

      if (status === 'fail') {
        reason = evalResult?.messages?.find(
          (m) => m.judge?.status === 'fail',
        )?.judge?.failureReason;
      }
      if (result.endedReason && result.endedReason !== 'mockConversation.done') {
        reason = `endedReason: ${result.endedReason}`;
      }

      const conversation: ConversationMessage[] = (evalResult?.messages ?? []).map((m) => {
        const { role, content, toolCalls, judge, ...extra } = m;
        const msg: ConversationMessage = { role };
        if (content) msg.content = content;
        if (toolCalls && (toolCalls as unknown[]).length > 0) msg.toolCalls = toolCalls;
        if (judge) msg.judge = judge;
        if (Object.keys(extra).length > 0) Object.assign(msg, extra);
        return msg;
      });

      results.push({
        name: def.name,
        status: status === 'pass' ? 'pass' : 'fail',
        failureReason: reason,
        durationMs: ms,
        endedReason: result.endedReason,
        conversation,
      });

      if (status === 'pass') {
        console.log(`✅ (${(ms / 1000).toFixed(1)}s)`);
      } else {
        console.log(`❌ (${(ms / 1000).toFixed(1)}s)`);
        if (reason) console.log(`     └─ ${reason.substring(0, 140)}`);
      }
    } catch (err) {
      results.push({ name: def.name, status: 'error', failureReason: `${err}` });
      console.log(`⚠️  Error: ${err}`);
    }
    await sleep(1500);
  }

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const rate = results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : '0';

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  RESULTS: ${label}`);
  console.log(`  Pass: ${passed}  |  Fail: ${failed}  |  Error: ${errors}  |  Rate: ${rate}%`);
  console.log(`${'═'.repeat(65)}`);

  if (failed > 0) {
    console.log('\n  FAILURES:');
    for (const r of results.filter((x) => x.status === 'fail')) {
      console.log(`    ❌ ${r.name}`);
      if (r.failureReason) console.log(`       ${r.failureReason.substring(0, 200)}`);
    }
  }

  // Save JSON
  const fs = await import('fs');
  const outFile = `eval-results-${label}.json`;
  fs.writeFileSync(outFile, JSON.stringify({ label, model: ACTIVE_MODEL, temperature: getEffectiveTemperature(), timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n  Results saved: ${outFile}\n`);

  if (failed + errors > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const SUITES: Record<string, {
  all: EvalDefinition[];
  groups: Record<string, EvalDefinition[]>;
  summary: { total: number; groups: Array<{ group: string; count: number }> };
}> = {
  triage: { all: ALL_TRIAGE_TESTS, groups: TRIAGE_TEST_GROUPS, summary: TRIAGE_SUMMARY },
  scheduling: { all: ALL_SCHEDULING_TESTS, groups: SCHEDULING_TEST_GROUPS, summary: SCHEDULING_SUMMARY },
  'tool-calls': { all: ALL_TOOL_CALL_TESTS, groups: TOOL_CALL_TEST_GROUPS, summary: TOOL_CALL_SUMMARY },
  hipaa: { all: ALL_HIPAA_TESTS, groups: HIPAA_TEST_GROUPS, summary: HIPAA_SUMMARY },
};

async function main(): Promise<void> {
  const [suite, group] = process.argv.slice(2);

  if (!suite || suite === '--help' || suite === '-h') {
    console.log(`
  Usage: npx tsx run-isolated.ts <suite> [group]

  Suites:
    triage      — Triage routing & handoff tests (${TRIAGE_SUMMARY.total} tests)
    scheduling  — Scheduling workflow & tool call tests (${SCHEDULING_SUMMARY.total} tests)
    tool-calls  — Tool param validation & response evaluation (${TOOL_CALL_SUMMARY.total} tests)
    hipaa       — HIPAA guardrails, PHI redaction & renamed tools (${HIPAA_SUMMARY.total} tests)
    list        — Show all suites, groups, and test counts
    cleanup     — Delete all evals from Vapi

  Examples:
    npx tsx run-isolated.ts triage
    npx tsx run-isolated.ts triage emergency
    npx tsx run-isolated.ts scheduling continuation
    npx tsx run-isolated.ts tool-calls scheduling
    npx tsx run-isolated.ts tool-calls response
    npx tsx run-isolated.ts hipaa
    npx tsx run-isolated.ts hipaa verification
    npx tsx run-isolated.ts hipaa family
    npx tsx run-isolated.ts list
`);
    return;
  }

  if (suite === 'list') {
    console.log('\n  Available test suites:\n');
    for (const [name, s] of Object.entries(SUITES)) {
      console.log(`  ${name} (${s.summary.total} tests)`);
      for (const { group: g, count } of s.summary.groups) {
        console.log(`    └─ ${g}: ${count} tests`);
      }
      console.log('');
    }
    console.log(`  Current model: ${ACTIVE_MODEL.provider}/${ACTIVE_MODEL.model}`);
    console.log(`  Temperature: ${getEffectiveTemperature()}`);
    console.log(`  Squad: ${VAPI_SQUAD_ID}`);
    console.log('');
    return;
  }

  if (suite === 'cleanup') {
    console.log('Fetching evals...');
    const existing = await listRemoteEvals();
    console.log(`Found ${existing.length} evals. Deleting...`);
    for (const e of existing) {
      await deleteEval(e.id);
      console.log(`  Deleted: ${e.name}`);
      await sleep(100);
    }
    saveCache(new Map());
    console.log('Local cache cleared. Done.');
    return;
  }

  const suiteConfig = SUITES[suite];
  if (!suiteConfig) {
    console.error(`Unknown suite: "${suite}". Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  let tests: EvalDefinition[];

  if (group) {
    const groupTests = suiteConfig.groups[group as string];
    if (!groupTests) {
      console.error(`Unknown group: "${group}". Available for ${suite}: ${Object.keys(suiteConfig.groups).join(', ')}`);
      process.exit(1);
    }
    tests = groupTests;
  } else {
    tests = suiteConfig.all;
  }

  await runTests(tests, group ? `${suite}-${group}` : suite);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
