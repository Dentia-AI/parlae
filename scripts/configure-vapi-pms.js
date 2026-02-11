#!/usr/bin/env node
/**
 * Configure Vapi Assistant with PMS Tools
 * Creates/updates assistant with proper webhook configurations
 */

const VAPI_API_KEY = '75425176-d4b2-4957-9a5d-40b18bcce434';
const VAPI_SECRET = 'parlae-vapi-webhook-secret-change-in-production';
const ASSISTANT_ID = '644878a7-429b-4ed1-b850-6a9aefb8176d';

// Get environment from command line
const env = process.argv[2] || 'local';
const BASE_URL = env === 'production' 
  ? 'https://parlae.ca' 
  : 'https://matterless-eartha-unraffled.ngrok-free.dev';

console.log(`🔧 Configuring Vapi Assistant for ${env.toUpperCase()}`);
console.log(`📍 Base URL: ${BASE_URL}\n`);

// PMS Function Tools
const PMS_FUNCTIONS = [
  {
    type: 'function',
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone, or email. Use this to find a patient before booking appointments.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patient name, phone number, or email to search for'
          }
        },
        required: ['query']
      },
      async: false
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment time slots. Always use this before booking to show patients what times are available.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date to check in YYYY-MM-DD format, e.g. 2026-02-15'
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, etc.'
          }
        },
        required: ['date']
      },
      async: false
    }
  },
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment for a patient. Must check availability first.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from searchPatients result'
          },
          appointmentType: {
            type: 'string',
            description: 'Type: cleaning, exam, filling, root-canal, etc.'
          },
          startTime: {
            type: 'string',
            description: 'ISO 8601 datetime, e.g. 2026-02-15T10:00:00Z'
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes, default 30'
          }
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration']
      },
      async: false
    }
  },
  {
    type: 'function',
    function: {
      name: 'getPatientInfo',
      description: 'Get detailed patient information including balance and last visit.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID'
          }
        },
        required: ['patientId']
      },
      async: false
    }
  },
  {
    type: 'function',
    function: {
      name: 'createPatient',
      description: 'Create a new patient record for first-time patients.',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email (optional)' }
        },
        required: ['firstName', 'lastName', 'phone']
      },
      async: false
    }
  }
];

const SYSTEM_PROMPT = `You are Riley, a friendly and professional dental receptionist.

You help patients with:
- Booking, rescheduling, and canceling appointments
- Answering questions about their account
- Taking messages for the dentist

IMPORTANT: You have access to the practice management system through these functions:
- searchPatients: Find patient by name/phone/email
- checkAvailability: See available appointment slots
- bookAppointment: Book appointments
- getPatientInfo: Get patient details
- createPatient: Create new patient records

WORKFLOW FOR BOOKING:
1. Greet warmly
2. Ask patient's name
3. Use searchPatients to find them
4. If new patient, use createPatient
5. Ask what type of appointment
6. Ask preferred date
7. Use checkAvailability to show slots
8. Use bookAppointment to book
9. Confirm with appointment details

Be warm, professional, and helpful!`;

async function updateAssistant() {
  try {
    console.log('📡 Fetching current assistant...');
    
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });
    
    if (!getResponse.ok) {
      throw new Error(`Failed to fetch assistant: ${getResponse.status}`);
    }
    
    const current = await getResponse.json();
    console.log(`✅ Current: ${current.name}`);
    console.log(`   Model: ${current.model?.model}`);
    console.log(`   Functions: ${current.model?.functions?.length || 0}\n`);
    
    console.log('🔄 Updating assistant with PMS tools...');
    
    const updateResponse = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: {
          ...current.model,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            }
          ],
          functions: PMS_FUNCTIONS.map(t => t.function)
        },
        serverUrl: `${BASE_URL}/api/vapi/webhook`,
        serverUrlSecret: VAPI_SECRET
      })
    });
    
    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      throw new Error(`Update failed: ${updateResponse.status} - ${error}`);
    }
    
    const updated = await updateResponse.json();
    
    console.log('✅ Assistant updated successfully!\n');
    console.log('📋 Configuration:');
    console.log(`   Functions: ${updated.model?.functions?.length || 0}`);
    console.log(`   Server URL: ${updated.serverUrl}`);
    console.log(`   Secret: ${updated.serverUrlSecret ? '✓ Set' : '✗ Not set'}`);
    console.log('');
    
    console.log('🔧 Configured Functions:');
    PMS_FUNCTIONS.forEach(f => {
      console.log(`   ✓ ${f.function.name}`);
    });
    console.log('');
    
    console.log('🎯 Next Steps:');
    console.log(`   1. Call: +1 (415) 663-5316`);
    console.log(`   2. Say: "I need to book an appointment"`);
    console.log(`   3. Monitor: ./scripts/check-pms-activity.sh`);
    console.log('');
    
    if (env === 'local') {
      console.log('⚠️  LOCAL MODE - Webhooks go to ngrok:');
      console.log(`   ${BASE_URL}`);
      console.log('   Make sure ./dev.sh is running!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateAssistant();
