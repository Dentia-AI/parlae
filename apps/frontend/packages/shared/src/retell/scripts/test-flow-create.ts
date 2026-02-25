/**
 * Quick test: build the dental clinic conversation flow and POST it to Retell.
 *
 * Usage:
 *   npx tsx apps/frontend/packages/shared/src/retell/scripts/test-flow-create.ts
 *
 * Requires RETELL_API_KEY in the environment (or reads from ../../.env.local).
 */

import { buildDentalClinicFlow } from '../templates/conversation-flow/dental-clinic.flow-template';

const API_KEY =
  process.env.RETELL_API_KEY ?? 'key_2599534bab2db5b8ab1a37d7e2c9';
const BASE = 'https://api.retellai.com';

const config = {
  clinicName: 'Test Dental Clinic',
  webhookUrl: 'https://example.com/api',
  webhookSecret: 'test-secret-123',
  accountId: 'test-account-id',
};

async function main() {
  console.log('--- Building flow config ---');
  const flowConfig = buildDentalClinicFlow(config);
  console.log('  model_choice:', JSON.stringify(flowConfig.model_choice));
  console.log('  nodes:', flowConfig.nodes.length);
  console.log(
    '  tools:',
    flowConfig.tools?.length ?? 0,
  );

  console.log('\n--- POST /create-conversation-flow ---');
  const res = await fetch(`${BASE}/create-conversation-flow`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(flowConfig),
  });

  const body = await res.json();

  if (!res.ok) {
    console.error(`ERROR ${res.status}:`, JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const flowId = body.conversation_flow_id;
  console.log(`  SUCCESS  flow_id=${flowId}  version=${body.version}`);

  // Now create an agent attached to this flow
  console.log('\n--- POST /create-agent (conversation_flow) ---');
  const agentRes = await fetch(`${BASE}/create-agent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_name: 'Test Flow Agent',
      response_engine: {
        type: 'conversation-flow',
        conversation_flow_id: flowId,
      },
      voice_id: 'retell-Chloe',
      language: 'en-US',
      webhook_url: 'https://example.com/api/retell/webhook',
      webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
      metadata: { accountId: config.accountId, deployType: 'conversation_flow' },
    }),
  });

  const agentBody = await agentRes.json();
  if (!agentRes.ok) {
    console.error(`ERROR ${agentRes.status}:`, JSON.stringify(agentBody, null, 2));
    // Clean up the flow
    await fetch(`${BASE}/delete-conversation-flow/${flowId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    console.log('  (cleaned up flow)');
    process.exit(1);
  }

  const agentId = agentBody.agent_id;
  console.log(`  SUCCESS  agent_id=${agentId}`);

  // Clean up both
  console.log('\n--- Cleaning up ---');
  await fetch(`${BASE}/delete-agent/${agentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  console.log(`  Deleted agent ${agentId}`);

  await fetch(`${BASE}/delete-conversation-flow/${flowId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  console.log(`  Deleted flow ${flowId}`);
  console.log('\nAll good!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
