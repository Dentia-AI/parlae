/**
 * Simple PMS API Test Script
 * Tests the PMS API endpoints directly
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000';
const VAPI_SECRET = process.env.VAPI_SERVER_SECRET || 'parlae-vapi-webhook-secret-change-in-production';

// Simple HMAC signature for testing
function createSignature(payload) {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', VAPI_SECRET)
    .update(payload)
    .digest('hex');
}

async function testPmsApi() {
  console.log('🧪 Testing PMS API Endpoints...\n');
  console.log('Base URL:', BASE_URL);
  console.log('=' .repeat(60));
  
  // Test account ID (you'll need to replace this with a real one)
  const accountId = '550e8400-e29b-41d4-a716-446655440002';
  
  try {
    // Test 1: Check Setup Status
    console.log('\n1️⃣  Testing GET /api/pms/setup');
    console.log('   URL:', `${BASE_URL}/api/pms/setup`);
    console.log('   ⚠️  This requires authentication - skipping for now');
    
    // Test 2: Simulated Vapi Search Patients
    console.log('\n2️⃣  Testing Patient Search (Simulated Vapi Call)');
    const searchPayload = JSON.stringify({
      call: {
        id: 'test_call_' + Date.now(),
        metadata: {
          accountId: accountId,
        },
      },
      data: {
        query: 'John',
      },
    });
    
    const searchSignature = createSignature(searchPayload);
    console.log('   URL:', `${BASE_URL}/api/pms/patients/search?query=John`);
    console.log('   Method: POST');
    console.log('   Signature:', searchSignature.substring(0, 20) + '...');
    
    const searchResponse = await fetch(`${BASE_URL}/api/pms/patients/search?query=John`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Signature': searchSignature,
      },
      body: searchPayload,
    });
    
    console.log('   Status:', searchResponse.status, searchResponse.statusText);
    const searchResult = await searchResponse.json();
    console.log('   Response:', JSON.stringify(searchResult, null, 2));
    
    // Test 3: Check Availability
    console.log('\n3️⃣  Testing Availability Check (Simulated Vapi Call)');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const availPayload = JSON.stringify({
      call: {
        id: 'test_call_' + Date.now(),
        metadata: {
          accountId: accountId,
        },
      },
    });
    
    const availSignature = createSignature(availPayload);
    console.log('   URL:', `${BASE_URL}/api/pms/appointments/availability?date=${dateStr}`);
    console.log('   Method: GET (with POST body for metadata)');
    console.log('   Date:', dateStr);
    
    const availResponse = await fetch(`${BASE_URL}/api/pms/appointments/availability?date=${dateStr}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Signature': availSignature,
      },
    });
    
    console.log('   Status:', availResponse.status, availResponse.statusText);
    const availResult = await availResponse.json();
    console.log('   Response:', JSON.stringify(availResult, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ API Test completed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run if this is the main module
if (require.main === module) {
  testPmsApi().catch(console.error);
}
