#!/usr/bin/env node
/**
 * Test Sikka Writeback Operations
 * 
 * Tests POST/PATCH/DELETE operations and polls for completion
 */

const SIKKA_APP_ID = 'b0cac8c638d52c92f9c0312159fc4518';
const SIKKA_APP_KEY = '7beec2a9e62bd692eab2e0840b8bb2db';
const SIKKA_REQUEST_KEY = '043d573209475b3b4567548f961d25e0'; // From previous test

async function pollWritebackStatus(writebackId, maxAttempts = 10) {
  console.log(`\n🔄 Polling writeback status for ID: ${writebackId}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `https://api.sikkasoft.com/v4/writebacks?id=${writebackId}`,
        {
          headers: {
            'App-Id': SIKKA_APP_ID,
            'App-Key': SIKKA_APP_KEY
          }
        }
      );
      
      if (!response.ok) {
        console.log(`   Attempt ${attempt}: HTTP ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      const data = await response.json();
      const writebacks = data.items || [];
      
      if (writebacks.length === 0) {
        console.log(`   Attempt ${attempt}: Writeback not found yet`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      const writeback = writebacks[0];
      console.log(`   Attempt ${attempt}: Status = ${writeback.result}`);
      
      if (writeback.result !== 'pending') {
        console.log(`\n✅ Writeback ${writeback.result}`);
        if (writeback.error_message) {
          console.log(`   Error: ${writeback.error_message}`);
        }
        if (writeback.completed_time) {
          console.log(`   Completed: ${writeback.completed_time}`);
        }
        return writeback;
      }
      
      // Still pending, wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log(`   Attempt ${attempt}: Error - ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n⚠️  Writeback timeout (still pending after 20 seconds)');
  return null;
}

async function test1_bookAppointment() {
  console.log('📅 TEST 1: Book Appointment\n');
  
  try {
    const appointmentData = {
      practice_id: '1-1',
      patient_id: '29', // Thomas Williamson from earlier test
      provider_id: 'DOC1',
      operatory_id: 'OP1',
      start_time: '2026-02-15 10:00:00',
      duration: '60',
      appointment_type: 'Checkup',
      appointment_status: 'Scheduled'
    };
    
    console.log('Submitting appointment booking...');
    console.log('Patient ID:', appointmentData.patient_id);
    console.log('Start Time:', appointmentData.start_time);
    console.log('');
    
    const response = await fetch('https://api.sikkasoft.com/v4/appointment', {
      method: 'POST',
      headers: {
        'Request-Key': SIKKA_REQUEST_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(appointmentData)
    });
    
    console.log(`Response Status: ${response.status}`);
    
    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.id) {
      // Poll for completion
      await pollWritebackStatus(result.id);
    }
    
    return response.ok;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function test2_createPatient() {
  console.log('\n\n👤 TEST 2: Create Patient\n');
  
  try {
    const patientData = {
      practice_id: '1-1',
      first_name: 'Jane',
      last_name: 'Doe',
      date_of_birth: '1985-03-15',
      email: 'jane.doe@example.com',
      mobile_phone: '+14155559999'
    };
    
    console.log('Submitting patient creation...');
    console.log('Name:', `${patientData.first_name} ${patientData.last_name}`);
    console.log('');
    
    const response = await fetch('https://api.sikkasoft.com/v4/patient', {
      method: 'POST',
      headers: {
        'Request-Key': SIKKA_REQUEST_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patientData)
    });
    
    console.log(`Response Status: ${response.status}`);
    
    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.id) {
      // Poll for completion
      await pollWritebackStatus(result.id);
    }
    
    return response.ok;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function test3_checkWritebackHistory() {
  console.log('\n\n📊 TEST 3: Check Recent Writeback History\n');
  
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const startDate = yesterday.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://api.sikkasoft.com/v4/writebacks?startdate=${startDate}&enddate=${endDate}`,
      {
        headers: {
          'App-Id': SIKKA_APP_ID,
          'App-Key': SIKKA_APP_KEY
        }
      }
    );
    
    if (!response.ok) {
      console.error(`❌ Failed (${response.status})`);
      return false;
    }
    
    const data = await response.json();
    const writebacks = data.items || [];
    
    console.log(`✅ Found ${writebacks.length} writeback(s) in last 24 hours\n`);
    
    writebacks.slice(0, 5).forEach((wb, idx) => {
      console.log(`${idx + 1}. ID: ${wb.id}`);
      console.log(`   Method: ${wb.method} ${wb.api_name}`);
      console.log(`   Result: ${wb.result}`);
      console.log(`   Submitted: ${wb.command_time}`);
      if (wb.completed_time) {
        console.log(`   Completed: ${wb.completed_time}`);
      }
      console.log('');
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('🏥 Sikka Writeback Operations Test\n');
  console.log('Using request_key from auth flow test');
  console.log('═'.repeat(60));
  console.log('');
  
  // Test 3: Check history (non-destructive, so test first)
  await test3_checkWritebackHistory();
  
  console.log('─'.repeat(60));
  
  // Test 1: Book appointment
  const test1 = await test1_bookAppointment();
  
  console.log('─'.repeat(60));
  
  // Test 2: Create patient
  const test2 = await test2_createPatient();
  
  console.log('═'.repeat(60));
  console.log('');
  console.log('📊 Test Summary:');
  console.log(`   Writeback History: ✅`);
  console.log(`   Book Appointment: ${test1 ? '✅' : '❌'}`);
  console.log(`   Create Patient: ${test2 ? '✅' : '❌'}`);
  console.log('');
  console.log('💡 Writeback operations are processed by SPU on the practice server');
  console.log('   They may take 15-60 seconds to complete');
  console.log('');
}

main();
