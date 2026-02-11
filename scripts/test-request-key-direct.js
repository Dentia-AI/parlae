#!/usr/bin/env node

const SIKKA_REQUEST_KEY = '70a2c702705ad41c395f8bd639fa7f85';

async function testDirectRequestKey() {
  console.log('Testing Request-Key direct access:\n');
  
  try {
    const response = await fetch('https://api.sikkasoft.com/v4/appointments', {
      method: 'GET',
      headers: {
        'Request-Key': SIKKA_REQUEST_KEY
      }
    });
    
    console.log(`Status: ${response.status}`);
    const text = await response.text();
    console.log(`Response: ${text.substring(0, 200)}`);
    
    if (response.ok) {
      console.log('\n✅ Request-Key direct access works!');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDirectRequestKey();
