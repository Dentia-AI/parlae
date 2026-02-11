#!/usr/bin/env node

const SIKKA_REQUEST_KEY = '70a2c702705ad41c395f8bd639fa7f85';

async function test() {
  console.log('Testing appointments endpoint...\n');
  
  const response = await fetch('https://api.sikkasoft.com/v4/appointments?limit=5', {
    headers: { 'Request-Key': SIKKA_REQUEST_KEY }
  });
  
  console.log('Status:', response.status);
  console.log('Headers:', Object.fromEntries(response.headers.entries()));
  
  const text = await response.text();
  console.log('\nRaw response:', text.substring(0, 500));
  
  try {
    const json = JSON.parse(text);
    console.log('\n✅ Parsed JSON:');
    console.log(`   Total: ${json.total_count}`);
    console.log(`   Records: ${json.data?.length || 0}`);
    
    if (json.data && json.data.length > 0) {
      console.log('\nFirst appointment:');
      console.log(JSON.stringify(json.data[0], null, 2));
    }
  } catch (error) {
    console.error('\n❌ JSON parse error:', error.message);
  }
}

test();
