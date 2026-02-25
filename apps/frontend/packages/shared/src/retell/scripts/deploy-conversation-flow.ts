#!/usr/bin/env npx tsx
/**
 * Retell Conversation Flow Deploy Script
 *
 * Deploys a single conversation flow agent that replicates the 6-agent squad,
 * without touching the existing squad deployment.
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx deploy-conversation-flow.ts --account-id=<id>
 *   RETELL_API_KEY=... npx tsx deploy-conversation-flow.ts --account-id=<id> --voice-id=retell-Grace
 *   RETELL_API_KEY=... npx tsx deploy-conversation-flow.ts --teardown --agent-id=<id> --flow-id=<id>
 *
 * Environment:
 *   RETELL_API_KEY          Required
 *   RETELL_WEBHOOK_SECRET   Optional (defaults to 'test-secret')
 *   BACKEND_URL             Optional (defaults to 'https://httpbin.org/post')
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RETELL_API_KEY = process.env.RETELL_API_KEY ?? '';
const RETELL_WEBHOOK_SECRET = process.env.RETELL_WEBHOOK_SECRET ?? 'test-secret';
const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'https://httpbin.org/post';

if (!RETELL_API_KEY) {
  console.error('RETELL_API_KEY environment variable is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

const ACCOUNT_ID = getArg('account-id') ?? 'test-account';
const CLINIC_NAME = getArg('clinic-name') ?? 'Test Dental Clinic';
const CLINIC_PHONE = getArg('clinic-phone');
const VOICE_ID = getArg('voice-id') ?? 'retell-Chloe';
const TEARDOWN = args.includes('--teardown');
const TEARDOWN_AGENT_ID = getArg('agent-id');
const TEARDOWN_FLOW_ID = getArg('flow-id');

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
      console.log(`  Rate limited on ${path}, retrying in ${waitMs}ms...`);
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
// Import flow template builder (pure data / logic, no server-only deps)
// ---------------------------------------------------------------------------

import {
  buildDentalClinicFlow,
  CONVERSATION_FLOW_VERSION,
} from '../templates/conversation-flow/dental-clinic.flow-template';

import {
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_POST_CALL_ANALYSIS,
} from '../templates/dental-clinic.retell-template';

// ---------------------------------------------------------------------------
// Voice model resolution
// ---------------------------------------------------------------------------

function resolveVoiceModel(voiceId: string): string | undefined {
  const prefix = voiceId.split('-')[0]?.toLowerCase();
  switch (prefix) {
    case '11labs':
      return 'eleven_turbo_v2_5';
    case 'cartesia':
      return 'sonic-3';
    case 'minimax':
      return 'speech-02-turbo';
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Handle teardown
  if (TEARDOWN) {
    if (!TEARDOWN_AGENT_ID || !TEARDOWN_FLOW_ID) {
      console.error('--teardown requires --agent-id=<id> and --flow-id=<id>');
      process.exit(1);
    }

    console.log(`\nTearing down conversation flow...`);
    console.log(`  Agent: ${TEARDOWN_AGENT_ID}`);
    console.log(`  Flow:  ${TEARDOWN_FLOW_ID}`);

    try {
      await retellRequest('DELETE', `/delete-agent/${TEARDOWN_AGENT_ID}`);
      console.log('  Agent deleted.');
    } catch (err) {
      console.warn(`  Agent delete failed: ${err instanceof Error ? err.message : err}`);
    }

    try {
      await retellRequest('DELETE', `/delete-conversation-flow/${TEARDOWN_FLOW_ID}`);
      console.log('  Flow deleted.');
    } catch (err) {
      console.warn(`  Flow delete failed: ${err instanceof Error ? err.message : err}`);
    }

    console.log('\nTeardown complete.');
    return;
  }

  // Deploy
  console.log('\n=== Retell Conversation Flow Deployment ===');
  console.log(`  Account ID:  ${ACCOUNT_ID}`);
  console.log(`  Clinic Name: ${CLINIC_NAME}`);
  console.log(`  Voice:       ${VOICE_ID}`);
  console.log(`  Backend URL: ${BACKEND_URL}`);
  console.log(`  Version:     ${CONVERSATION_FLOW_VERSION}`);
  console.log('');

  // 1. Build the flow config
  console.log('1. Building conversation flow config...');
  const flowConfig = buildDentalClinicFlow({
    clinicName: CLINIC_NAME,
    clinicPhone: CLINIC_PHONE,
    webhookUrl: BACKEND_URL,
    webhookSecret: RETELL_WEBHOOK_SECRET,
    accountId: ACCOUNT_ID,
  });

  console.log(`   Nodes: ${flowConfig.nodes.length}`);
  console.log(`   Tools: ${flowConfig.tools?.length ?? 0}`);
  console.log(`   Start: ${flowConfig.start_node_id}`);
  console.log('');

  // 2. Create the conversation flow
  console.log('2. Creating conversation flow on Retell...');
  const flow = await retellRequest<{ conversation_flow_id: string; version: number }>(
    'POST',
    '/create-conversation-flow',
    flowConfig,
  );
  console.log(`   Flow ID: ${flow.conversation_flow_id}`);
  console.log(`   Version: ${flow.version}`);
  console.log('');

  // 3. Create the agent
  console.log('3. Creating agent linked to conversation flow...');
  const voiceModel = resolveVoiceModel(VOICE_ID);

  const agentConfig = {
    agent_name: `${CLINIC_NAME} - Conversation Flow`,
    response_engine: {
      type: 'conversation_flow',
      conversation_flow_id: flow.conversation_flow_id,
    },
    voice_id: VOICE_ID,
    ...(voiceModel ? { voice_model: voiceModel } : {}),
    ...SHARED_RETELL_AGENT_CONFIG,
    webhook_url: `${BACKEND_URL}/retell/webhook`,
    webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
    post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
    boosted_keywords: [CLINIC_NAME, 'appointment', 'dentist', 'cleaning', 'emergency'],
    metadata: {
      accountId: ACCOUNT_ID,
      deployType: 'conversation_flow',
      version: CONVERSATION_FLOW_VERSION,
    },
  };

  const agent = await retellRequest<{ agent_id: string; version: number }>(
    'POST',
    '/create-agent',
    agentConfig,
  );
  console.log(`   Agent ID: ${agent.agent_id}`);
  console.log('');

  // 4. Summary
  console.log('=== Deployment Complete ===');
  console.log('');
  console.log(`  Agent ID: ${agent.agent_id}`);
  console.log(`  Flow ID:  ${flow.conversation_flow_id}`);
  console.log(`  Version:  ${CONVERSATION_FLOW_VERSION}`);
  console.log('');
  console.log('To test via web call, use the agent ID above in the Retell dashboard.');
  console.log('');
  console.log('To tear down:');
  console.log(
    `  RETELL_API_KEY=... npx tsx deploy-conversation-flow.ts --teardown --agent-id=${agent.agent_id} --flow-id=${flow.conversation_flow_id}`,
  );
}

main().catch((err) => {
  console.error('\nDeployment failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
