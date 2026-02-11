#!/usr/bin/env node
/**
 * Fetch Current State from Sikka API v4
 * Shows appointments and patients before test call
 */

const SIKKA_REQUEST_KEY = '70a2c702705ad41c395f8bd639fa7f85';
const BASE_URL = 'https://api.sikkasoft.com/v4';

async function fetchAppointments() {
  console.log('📅 Fetching recent appointments...\n');
  
  try {
    const response = await fetch(
      `${BASE_URL}/appointments?limit=10`,
      {
        headers: { 'Request-Key': SIKKA_REQUEST_KEY }
      }
    );
    
    if (!response.ok) {
      console.log(`⚠️  ${response.status}: Failed to fetch`);
      return [];
    }
    
    const data = await response.json();
    const appointments = data.items || [];
    
    console.log(`📊 Total Appointments: ${data.total_count || 0}`);
    console.log(`   Showing: ${appointments.length}\n`);
    
    if (appointments.length > 0) {
      appointments.slice(0, 5).forEach((apt, i) => {
        console.log(`${i + 1}. ${apt.appointment_date || 'No date'}`);
        console.log(`   Patient: ${apt.patient_name || apt.patient_id || 'N/A'}`);
        console.log(`   Provider: ${apt.provider_name || apt.provider_id || 'N/A'}`);
        console.log(`   Status: ${apt.status || 'N/A'}`);
        console.log('');
      });
      
      if (appointments.length > 5) {
        console.log(`   ... and ${appointments.length - 5} more`);
      }
    }
    
    return appointments;
    
  } catch (error) {
    console.error('❌ Error fetching appointments:', error.message);
    return [];
  }
}

async function fetchPatients() {
  console.log('👥 Fetching recent patients...\n');
  
  try {
    const response = await fetch(
      `${BASE_URL}/patients?limit=10`,
      {
        headers: { 'Request-Key': SIKKA_REQUEST_KEY }
      }
    );
    
    if (!response.ok) {
      console.log(`⚠️  ${response.status}: Failed to fetch`);
      return [];
    }
    
    const data = await response.json();
    const patients = data.items || [];
    
    console.log(`📊 Total Patients: ${data.total_count || 0}`);
    console.log(`   Showing: ${patients.length}\n`);
    
    if (patients.length > 0) {
      patients.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. ${p.first_name} ${p.last_name}`);
        console.log(`   ID: ${p.patient_id || p.id}`);
        console.log(`   Phone: ${p.mobile_phone || p.phone || 'N/A'}`);
        console.log(`   Email: ${p.email || 'N/A'}`);
        console.log('');
      });
      
      if (patients.length > 5) {
        console.log(`   ... and ${patients.length - 5} more`);
      }
    }
    
    return patients;
    
  } catch (error) {
    console.error('❌ Error fetching patients:', error.message);
    return [];
  }
}

async function main() {
  console.log('🏥 Sikka API v4 - Current State Check\n');
  console.log('Request-Key:', SIKKA_REQUEST_KEY.substring(0, 20) + '...');
  console.log('═'.repeat(60));
  console.log('');
  
  try {
    // Fetch appointments
    const appointments = await fetchAppointments();
    console.log('─'.repeat(60));
    console.log('');
    
    // Fetch patients
    const patients = await fetchPatients();
    console.log('─'.repeat(60));
    console.log('');
    
    // Summary
    console.log('✅ Current state captured!\n');
    console.log(`📊 Summary:`);
    console.log(`   Appointments: ${appointments.length}`);
    console.log(`   Patients: ${patients.length}\n`);
    
    console.log('🎯 Next: Make a test call to +1 (415) 663-5316');
    console.log('   Try: "Hi, I\'m John Smith, I want to book an appointment"\n');
    
    console.log('🔄 Re-run this script after the call to see changes');
    
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
}

main();
