#!/usr/bin/env node
/**
 * Test Sikka Authorization Flow
 * 
 * This script tests the complete authorization flow:
 * 1. GET /authorized_practices → Get office_id + secret_key
 * 2. POST /request_key (grant_type: request_key) → Get request_key + refresh_key
 * 3. POST /request_key (grant_type: refresh_key) → Refresh token
 * 4. GET /request_key_info → Check token status
 */

const SIKKA_APP_ID = 'b0cac8c638d52c92f9c0312159fc4518';
const SIKKA_APP_KEY = '7beec2a9e62bd692eab2e0840b8bb2db';
const SIKKA_INITIAL_REQUEST_KEY = '70a2c702705ad41c395f8bd639fa7f85'; // Provided by Sikka

let requestKey = SIKKA_INITIAL_REQUEST_KEY;
let refreshKey = null;
let officeId = null;
let secretKey = null;

async function step1_getAuthorizedPractices() {
  console.log('📋 STEP 1: Get Authorized Practices\n');
  
  try {
    const response = await fetch('https://api.sikkasoft.com/v4/authorized_practices', {
      headers: {
        'App-Id': SIKKA_APP_ID,
        'App-Key': SIKKA_APP_KEY
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed (${response.status}):`, error);
      return false;
    }
    
    const data = await response.json();
    const practices = data.items || [];
    
    console.log(`✅ Found ${practices.length} authorized practice(s)\n`);
    
    if (practices.length > 0) {
      const practice = practices[0];
      officeId = practice.office_id;
      secretKey = practice.secret_key;
      
      console.log('Practice Details:');
      console.log(`   Office ID: ${officeId}`);
      console.log(`   Secret Key: ${secretKey?.substring(0, 20)}...`);
      console.log(`   Practice Name: ${practice.practice_name || 'N/A'}`);
      console.log(`   PMS: ${practice.practice_management_system || 'N/A'}`);
      console.log('');
      
      return true;
    } else {
      console.warn('⚠️  No practices found\n');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function step2_generateRequestKey() {
  console.log('🔑 STEP 2: Generate request_key\n');
  
  if (!officeId || !secretKey) {
    console.error('❌ Missing office_id or secret_key from Step 1\n');
    return false;
  }
  
  try {
    const response = await fetch('https://api.sikkasoft.com/v4/request_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'request_key',
        office_id: officeId,
        secret_key: secretKey,
        app_id: SIKKA_APP_ID,
        app_key: SIKKA_APP_KEY
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed (${response.status}):`, error);
      return false;
    }
    
    const data = await response.json();
    
    requestKey = data.request_key;
    refreshKey = data.refresh_key;
    
    console.log('✅ Token generated successfully\n');
    console.log('Token Details:');
    console.log(`   request_key: ${requestKey?.substring(0, 20)}...`);
    console.log(`   refresh_key: ${refreshKey?.substring(0, 20)}...`);
    console.log(`   expires_in: ${data.expires_in}`);
    console.log(`   status: ${data.status}`);
    console.log('');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function step3_refreshToken() {
  console.log('🔄 STEP 3: Refresh request_key\n');
  
  if (!refreshKey) {
    console.error('❌ Missing refresh_key from Step 2\n');
    return false;
  }
  
  try {
    const response = await fetch('https://api.sikkasoft.com/v4/request_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_key',
        refresh_key: refreshKey,
        app_id: SIKKA_APP_ID,
        app_key: SIKKA_APP_KEY
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed (${response.status}):`, error);
      return false;
    }
    
    const data = await response.json();
    
    const oldRequestKey = requestKey;
    requestKey = data.request_key;
    refreshKey = data.refresh_key;
    
    console.log('✅ Token refreshed successfully\n');
    console.log('New Token Details:');
    console.log(`   Old request_key: ${oldRequestKey?.substring(0, 20)}...`);
    console.log(`   New request_key: ${requestKey?.substring(0, 20)}...`);
    console.log(`   New refresh_key: ${refreshKey?.substring(0, 20)}...`);
    console.log(`   expires_in: ${data.expires_in}`);
    console.log('');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function step4_checkRequestKeyInfo() {
  console.log('ℹ️  STEP 4: Check request_key info\n');
  
  try {
    const response = await fetch('https://api.sikkasoft.com/v4/request_key_info', {
      headers: {
        'Request-Key': requestKey
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed (${response.status}):`, error);
      return false;
    }
    
    const data = await response.json();
    
    console.log('✅ Request key info retrieved\n');
    console.log('Key Info:');
    console.log(`   Issued to: ${data.issued_to}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Expires in: ${data.expires_in}`);
    console.log(`   Request count: ${data.request_count}`);
    console.log(`   Domain: ${data.domain}`);
    console.log('');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function step5_testDataAccess() {
  console.log('📊 STEP 5: Test data access with new token\n');
  
  try {
    const response = await fetch('https://api.sikkasoft.com/v4/appointments?limit=3', {
      headers: {
        'Request-Key': requestKey
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Failed (${response.status})`);
      return false;
    }
    
    const data = await response.json();
    
    console.log('✅ Data access successful\n');
    console.log(`   Total appointments: ${data.total_count}`);
    console.log(`   Retrieved: ${data.items?.length || 0}`);
    console.log('');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('🏥 Sikka Authorization Flow Test\n');
  console.log('═'.repeat(60));
  console.log('');
  
  // Step 1: Get authorized practices
  const step1 = await step1_getAuthorizedPractices();
  if (!step1) {
    console.log('❌ Test failed at Step 1');
    process.exit(1);
  }
  
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 2: Generate request_key
  const step2 = await step2_generateRequestKey();
  if (!step2) {
    console.log('❌ Test failed at Step 2');
    process.exit(1);
  }
  
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 3: Refresh token
  const step3 = await step3_refreshToken();
  if (!step3) {
    console.log('❌ Test failed at Step 3');
    process.exit(1);
  }
  
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 4: Check request_key info
  const step4 = await step4_checkRequestKeyInfo();
  if (!step4) {
    console.log('❌ Test failed at Step 4');
    process.exit(1);
  }
  
  console.log('─'.repeat(60));
  console.log('');
  
  // Step 5: Test data access
  const step5 = await step5_testDataAccess();
  if (!step5) {
    console.log('❌ Test failed at Step 5');
    process.exit(1);
  }
  
  console.log('═'.repeat(60));
  console.log('');
  console.log('✅ ALL STEPS COMPLETED SUCCESSFULLY!\n');
  console.log('🎯 Next Steps:');
  console.log('   1. Save these tokens to your database');
  console.log('   2. Set up automatic refresh (every 23 hours)');
  console.log('   3. Test writeback operations');
  console.log('');
  console.log('📝 Tokens for database:');
  console.log(`   request_key: ${requestKey}`);
  console.log(`   refresh_key: ${refreshKey}`);
  console.log(`   office_id: ${officeId}`);
  console.log(`   secret_key: ${secretKey}`);
  console.log('');
}

main();
