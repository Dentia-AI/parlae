#!/usr/bin/env npx tsx
/**
 * Dental Clinic Eval Runner
 *
 * Creates, runs, and compares chat-based evals against a Vapi squad.
 * Designed for iterating on prompts and comparing AI models.
 *
 * Usage:
 *   # Set env vars
 *   export VAPI_API_KEY="your-key"
 *   export VAPI_SQUAD_ID="your-squad-id"
 *
 *   # Run all evals
 *   npx tsx run-evals.ts
 *
 *   # Run only critical evals
 *   npx tsx run-evals.ts --tag critical
 *
 *   # Run a specific category
 *   npx tsx run-evals.ts --category triage-routing
 *
 *   # Compare models (override squad model for this run)
 *   npx tsx run-evals.ts --category scheduling --label "gpt-4o-run"
 *
 *   # List all evals and categories
 *   npx tsx run-evals.ts --list
 *
 *   # Delete all evals from Vapi (cleanup)
 *   npx tsx run-evals.ts --cleanup
 */

import {
  ALL_EVAL_DEFINITIONS,
  EVAL_CATEGORIES,
  EVAL_SUMMARY,
  type EvalCategory,
  type EvalDefinition,
} from './dental-clinic-eval-suite';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_SQUAD_ID = process.env.VAPI_SQUAD_ID;
const VAPI_BASE_URL = 'https://api.vapi.ai';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 60; // 3 min max per eval run

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
      throw new Error(`Vapi API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Vapi ${method} ${path}: max retries (${MAX_RETRIES}) exceeded`);
}

// ---------------------------------------------------------------------------
// Eval API wrappers
// ---------------------------------------------------------------------------

interface CreatedEval {
  id: string;
  name: string;
}

interface EvalRunCreated {
  evalRunId: string;
  workflowId: string;
}

interface EvalRunResult {
  id: string;
  evalId?: string;
  status: 'queued' | 'running' | 'ended';
  endedReason?: string;
  results?: Array<{
    status: 'pass' | 'fail';
    messages: Array<{
      role: string;
      content?: string;
      toolCalls?: unknown[];
      judge?: {
        status: 'pass' | 'fail';
        failureReason?: string;
      };
    }>;
  }>;
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

async function upsertEval(
  def: EvalDefinition,
  existingByName: Map<string, string>,
): Promise<CreatedEval> {
  const payload = {
    name: def.name,
    description: def.description,
    type: def.type,
    messages: def.messages,
  };

  const existingId = existingByName.get(def.name);
  if (existingId) {
    const updated = await vapiRequest<CreatedEval>('PATCH', `/eval/${existingId}`, payload);
    return { id: existingId, name: updated.name || def.name };
  }
  return vapiRequest<CreatedEval>('POST', '/eval', payload);
}

async function runEval(
  evalId: string,
  squadId: string,
): Promise<EvalRunCreated> {
  return vapiRequest<EvalRunCreated>('POST', '/eval/run', {
    type: 'eval',
    evalId,
    target: { type: 'squad', squadId },
  });
}

async function getEvalRun(runId: string): Promise<EvalRunResult> {
  return vapiRequest<EvalRunResult>('GET', `/eval/run/${runId}`);
}

async function deleteEval(evalId: string): Promise<void> {
  await vapiRequest('DELETE', `/eval/${evalId}`);
}

// ---------------------------------------------------------------------------
// Poll for completion
// ---------------------------------------------------------------------------

async function waitForCompletion(runId: string): Promise<EvalRunResult> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const result = await getEvalRun(runId);
    if (result.status === 'ended') return result;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Eval run ${runId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'error';
  failureReason?: string;
  evalId?: string;
  runId?: string;
  durationMs?: number;
}

function formatResults(results: TestResult[], label: string): string {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const total = results.length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════',
    `  EVAL RESULTS: ${label}`,
    '═══════════════════════════════════════════════════════════════',
    '',
    `  Total: ${total}  |  Pass: ${passed}  |  Fail: ${failed}  |  Error: ${errors}  |  Rate: ${passRate}%`,
    '',
    '───────────────────────────────────────────────────────────────',
  ];

  const byCat = new Map<string, TestResult[]>();
  for (const r of results) {
    const arr = byCat.get(r.category) || [];
    arr.push(r);
    byCat.set(r.category, arr);
  }

  for (const [cat, catResults] of byCat) {
    const catPassed = catResults.filter((r) => r.status === 'pass').length;
    lines.push(`  [${cat}] ${catPassed}/${catResults.length} passed`);
    for (const r of catResults) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
      lines.push(`    ${icon} ${r.name}`);
      if (r.failureReason) {
        lines.push(`       └─ ${r.failureReason.substring(0, 120)}`);
      }
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

function formatComparisonTable(
  runsByLabel: Map<string, TestResult[]>,
): string {
  const labels = [...runsByLabel.keys()];
  if (labels.length < 2) return '';

  const allNames = new Set<string>();
  for (const results of runsByLabel.values()) {
    for (const r of results) allNames.add(r.name);
  }

  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════',
    '  MODEL COMPARISON',
    '═══════════════════════════════════════════════════════════════',
    '',
  ];

  const header = ['Test', ...labels].map((h) => h.padEnd(25)).join(' | ');
  lines.push(`  ${header}`);
  lines.push(`  ${'─'.repeat(header.length)}`);

  for (const name of allNames) {
    const cols = [name.substring(0, 24).padEnd(25)];
    for (const label of labels) {
      const results = runsByLabel.get(label) || [];
      const r = results.find((x) => x.name === name);
      const val = r ? (r.status === 'pass' ? 'PASS' : 'FAIL') : 'N/A';
      cols.push(val.padEnd(25));
    }
    lines.push(`  ${cols.join(' | ')}`);
  }

  lines.push('');

  const summaryHeader = ['Summary', ...labels].map((h) => h.padEnd(25)).join(' | ');
  lines.push(`  ${summaryHeader}`);
  lines.push(`  ${'─'.repeat(summaryHeader.length)}`);
  const passRates = labels.map((label) => {
    const results = runsByLabel.get(label) || [];
    const passed = results.filter((r) => r.status === 'pass').length;
    return `${((passed / results.length) * 100).toFixed(1)}%`.padEnd(25);
  });
  lines.push(`  ${'Pass rate'.padEnd(25)} | ${passRates.join(' | ')}`);

  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function runAllEvals(
  defs: EvalDefinition[],
  squadId: string,
  label: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log('\n  Fetching existing evals...');
  const existing = await listRemoteEvals();
  const existingByName = new Map(existing.map((e) => [e.name, e.id]));
  console.log(`  Found ${existing.length} existing evals.\n`);

  let numCreated = 0;
  let numUpdated = 0;
  const preparedEvals: Array<{ def: EvalDefinition; evalId: string }> = [];
  for (const def of defs) {
    try {
      const isUpdate = existingByName.has(def.name);
      const result = await upsertEval(def, existingByName);
      preparedEvals.push({ def, evalId: result.id });
      if (isUpdate) numUpdated++;
      else numCreated++;
    } catch (err) {
      console.error(`  ✗ Failed: ${def.name}`, err);
      results.push({
        name: def.name,
        category: def.category,
        status: 'error',
        failureReason: `Upsert failed: ${err}`,
      });
    }
    await sleep(800);
  }

  console.log(`  ${numCreated} created, ${numUpdated} updated.\n`);
  console.log(`Running ${preparedEvals.length} evals against squad ${squadId}...`);

  for (const { def, evalId } of preparedEvals) {
    const start = Date.now();
    try {
      console.log(`  ▶ Running: ${def.name}...`);
      const run = await runEval(evalId, squadId);
      const result = await waitForCompletion(run.evalRunId);
      const durationMs = Date.now() - start;

      const overallStatus = result.results?.[0]?.status || 'error';
      let failureReason: string | undefined;

      if (overallStatus === 'fail') {
        const failedMsg = result.results?.[0]?.messages?.find(
          (m) => m.judge?.status === 'fail',
        );
        failureReason = failedMsg?.judge?.failureReason;
      }

      if (result.endedReason && result.endedReason !== 'mockConversation.done') {
        failureReason = `Ended with reason: ${result.endedReason}`;
      }

      results.push({
        name: def.name,
        category: def.category,
        status: overallStatus === 'pass' ? 'pass' : 'fail',
        failureReason,
        evalId,
        runId: run.evalRunId,
        durationMs,
      });

      const icon = overallStatus === 'pass' ? '✅' : '❌';
      console.log(`  ${icon} ${def.name} (${(durationMs / 1000).toFixed(1)}s)`);
      if (failureReason) {
        console.log(`     └─ ${failureReason.substring(0, 100)}`);
      }
    } catch (err) {
      results.push({
        name: def.name,
        category: def.category,
        status: 'error',
        failureReason: `Run error: ${err}`,
        evalId,
      });
      console.error(`  ⚠️ Error running: ${def.name}`, err);
    }
    await sleep(1500); // buffer between runs
  }

  return results;
}

async function cleanup(): Promise<void> {
  console.log('Fetching existing evals...');
  const existing = await listRemoteEvals();
  console.log(`Found ${existing.length} evals. Deleting...`);
  for (const e of existing) {
    await deleteEval(e.id);
    console.log(`  Deleted: ${e.name} (${e.id})`);
    await sleep(100);
  }
  console.log('Cleanup complete.');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('\n📋 Eval Suite Summary:');
    console.log(`   Total evals: ${EVAL_SUMMARY.total}`);
    console.log(`   Categories: ${EVAL_SUMMARY.categories}`);
    console.log(`   Critical: ${EVAL_SUMMARY.critical}`);
    console.log('\n   Breakdown:');
    for (const { category, count } of EVAL_SUMMARY.breakdown) {
      console.log(`     ${category}: ${count} evals`);
    }
    console.log('\n   All evals:');
    for (const def of ALL_EVAL_DEFINITIONS) {
      console.log(`     [${def.category}] ${def.name}`);
    }
    return;
  }

  if (!VAPI_API_KEY) {
    console.error('Error: VAPI_API_KEY env var is required.');
    process.exit(1);
  }

  if (args.includes('--cleanup')) {
    await cleanup();
    return;
  }

  if (!VAPI_SQUAD_ID) {
    console.error('Error: VAPI_SQUAD_ID env var is required.');
    process.exit(1);
  }

  // Determine which evals to run
  let evalsToRun = ALL_EVAL_DEFINITIONS;
  const catIdx = args.indexOf('--category');
  const tagIdx = args.indexOf('--tag');
  const labelIdx = args.indexOf('--label');

  if (catIdx !== -1 && args[catIdx + 1]) {
    const cat = args[catIdx + 1] as EvalCategory;
    if (!(cat in EVAL_CATEGORIES)) {
      console.error(`Unknown category: ${cat}. Available: ${Object.keys(EVAL_CATEGORIES).join(', ')}`);
      process.exit(1);
    }
    evalsToRun = EVAL_CATEGORIES[cat];
  }

  if (tagIdx !== -1 && args[tagIdx + 1]) {
    const tag = args[tagIdx + 1]!;
    evalsToRun = evalsToRun.filter((e) => e.tags.includes(tag));
  }

  const label = labelIdx !== -1 && args[labelIdx + 1]
    ? args[labelIdx + 1]!
    : `run-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;

  console.log(`\n🧪 Dental Clinic Eval Suite`);
  console.log(`   Label: ${label}`);
  console.log(`   Squad: ${VAPI_SQUAD_ID}`);
  console.log(`   Evals: ${evalsToRun.length}`);

  const results = await runAllEvals(evalsToRun, VAPI_SQUAD_ID, label);
  const report = formatResults(results, label);
  console.log(report);

  // Write results to JSON for comparison
  const outFile = `eval-results-${label}.json`;
  const fs = await import('fs');
  fs.writeFileSync(
    outFile,
    JSON.stringify({ label, timestamp: new Date().toISOString(), results }, null, 2),
  );
  console.log(`\nResults saved to ${outFile}`);

  // Exit with failure code if any tests failed
  const failCount = results.filter((r) => r.status !== 'pass').length;
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
