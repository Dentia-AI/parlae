#!/usr/bin/env node
/**
 * Simplified End-to-End PMS Integration Test
 * Tests the complete PMS webhook flow without pg dependency
 */

const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000';
const VAPI_SECRET = 'parlae-vapi-webhook-secret-change-in-production';
const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440002';

function createSignature(payload) {
  return crypto
    .createHmac('sha256', VAPI_SECRET)
    .update(payload)
    .digest('hex');
}

const results = { passed: 0, failed: 0 };

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

async function runTests() {
  console.log('🧪 PMS Integration End-to-End Test\n');
  console.log('=' .repeat(60));
  log('📍', `Testing: ${BASE_URL}`);
  log('👤', `Account: ${TEST_ACCOUNT_ID}`);
  console.log('=' .repeat(60));

  try {
    // Test 1: Search Patients
    log('\n🔍', 'Test 1: Searching for patients...');
    const searchPayload = JSON.stringify({
      call: { id: `test_${Date.now()}`, metadata: { accountId: TEST_ACCOUNT_ID } },
      data: { query: 'test' }
    });
    
    const searchRes = await fetch(`${BASE_URL}/api/pms/patients/search?query=test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Signature': createSignature(searchPayload),
      },
      body: searchPayload,
    });
    
    log('  ', `Status: ${searchRes.status} ${searchRes.statusText}`);
    
    if (searchRes.ok) {
      const data = await searchRes.json();
      log('✅', `Found ${data.data?.length || 0} patient(s)`);
      results.passed++;
    } else {
      const error = await searchRes.text();
      log('❌', `Failed: ${error.substring(0, 150)}`);
      results.failed++;
    }

    // Test 2: Check Availability
    log('\n📅', 'Test 2: Checking appointment availability...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const availPayload = JSON.stringify({
      call: { id: `test_${Date.now()}`, metadata: { accountId: TEST_ACCOUNT_ID } }
    });
    
    const availRes = await fetch(
      `${BASE_URL}/api/pms/appointments/availability?date=${dateStr}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vapi-Signature': createSignature(availPayload),
        },
        body: availPayload,
      }
    );
    
    log('  ', `Date: ${dateStr}`);
    log('  ', `Status: ${availRes.status} ${availRes.statusText}`);
    
    if (availRes.ok) {
      const data = await availRes.json();
      log('✅', `Found ${data.data?.length || 0} available slots`);
      if (data.data?.[0]) {
        const slot = data.data[0];
        log('  ', `Sample: ${new Date(slot.startTime).toLocaleTimeString()} (${slot.duration}min)`);
      }
      results.passed++;
    } else {
      const error = await availRes.text();
      log('❌', `Failed: ${error.substring(0, 150)}`);
      results.failed++;
    }

    // Test 3: Verify Vapi Assistant
    log('\n🤖', 'Test 3: Verifying Vapi Assistant...');
    const assistantId = '644878a7-429b-4ed1-b850-6a9aefb8176d';
    
    const vapiRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { 'Authorization': 'Bearer 75425176-d4b2-4957-9a5d-40b18bcce434' }
    });
    
    if (vapiRes.ok) {
      const assistant = await vapiRes.json();
      log('✅', `Assistant: ${assistant.name}`);
      log('  ', `Model: ${assistant.model?.model}`);
      log('  ', `Server: ${assistant.serverUrl || 'Not configured'}`);
      results.passed++;
    } else {
      log('❌', `Assistant not found: ${vapiRes.status}`);
      results.failed++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60));
    log('✅', `Passed: ${results.passed}`);
    log('❌', `Failed: ${results.failed}`);
    console.log('');
    
    if (results.failed === 0) {
      console.log('🎉 All tests passed!\n');
      console.log('✅ PMS webhooks are working');
      console.log('✅ Sikka API is accessible');
      console.log('✅ Vapi assistant is configured');
      console.log('');
      console.log('🚀 READY FOR LIVE TESTING!');
      console.log('');
      console.log('Next Steps:');
      console.log('1. Call your Vapi phone number');
      console.log('2. Say: "I need to book an appointment"');
      console.log('3. AI will search patients and check availability');
      console.log('4. Monitor audit logs in database');
      console.log('');
      console.log('Check logs:');
      console.log('  psql postgresql://parlae:parlae@localhost:5433/parlae \\');
      console.log('    -c "SELECT * FROM pms_audit_logs ORDER BY created_at DESC LIMIT 10"');
    } else {
      console.log('⚠️  Some tests failed - review output above');
    }

    process.exit(results.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
