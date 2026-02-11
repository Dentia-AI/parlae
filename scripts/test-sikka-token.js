#!/usr/bin/env node

const SIKKA_APP_ID = 'b0cac8c638d52c92f9c0312159fc4518';
const SIKKA_APP_KEY = '7beec2a9e62bd692eab2e0840b8bb2db';
const SIKKA_REQUEST_KEY = '70a2c702705ad41c395f8bd639fa7f85';
const SIKKA_OFFICE_ID = '84A9439BD3627374VGUV';
const SIKKA_SECRET_KEY = 'STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=';

async function testTokenEndpoints() {
  const endpoints = [
    'https://api.sikkasoft.com/v4/token',
    'https://api.sikkasoft.com/v4/auth/token',
    'https://api.sikkasoft.com/token',
    'https://api.sikkasoft.com/auth/token',
    'https://api.sikkasoft.com/v4/oauth/token'
  ];
  
  const payload = {
    grant_type: 'request_key',
    app_id: SIKKA_APP_ID,
    app_key: SIKKA_APP_KEY,
    office_id: SIKKA_OFFICE_ID,
    secret_key: SIKKA_SECRET_KEY
  };
  
  console.log('Testing token endpoints:\n');
  
  for (const url of endpoints) {
    try {
      console.log(`🔄 Trying: ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      console.log(`   Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('   ✅ SUCCESS!');
        console.log('   Response:', JSON.stringify(data, null, 2));
        return;
      } else {
        const text = await response.text();
        console.log(`   ❌ Failed: ${text.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log('');
  }
  
  console.log('\n💡 All endpoints failed. Sikka might use Request-Key directly without token exchange.');
}

testTokenEndpoints();
