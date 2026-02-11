#!/usr/bin/env node
/**
 * Create Vapi Tools - Correct Schema
 * Proper tool types with authentication
 */

const VAPI_API_KEY = '75425176-d4b2-4957-9a5d-40b18bcce434';
const ASSISTANT_ID = '644878a7-429b-4ed1-b850-6a9aefb8176d';

const env = process.argv[2] || 'local';

// Credential IDs for Bearer Token authentication
const CREDENTIALS = {
  local: '02435653-3d64-4fdf-b66a-95d830e4f026',     // Dev/Testing
  production: '02435653-3d64-4fdf-b66a-95d830e4f026' // Production (update if different)
};

const CREDENTIAL_ID = CREDENTIALS[env];
const BASE_URL = env === 'production' 
  ? 'https://parlae.ca' 
  : 'https://matterless-eartha-unraffled.ngrok-free.dev';

console.log(`🔧 Creating Vapi Tools (${env.toUpperCase()})`);
console.log(`📍 Base URL: ${BASE_URL}`);
console.log(`🔐 Credential ID: ${CREDENTIAL_ID}\n`);

// PMS FUNCTION TOOLS (custom tools we need to create)
const TOOLS_CONFIG = [
  // 1. Search Patients
  {
    type: 'function',
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone number, or email. Use this to find a patient ID before booking appointments.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patient name, phone number, or email'
          }
        },
        required: ['query']
      }
    },
    async: false,
    server: {
      url: `${BASE_URL}/api/pms/patients/search`,
      timeoutSeconds: 15,
      credentialId: CREDENTIAL_ID
    },
    messages: [
      {
        type: 'request-start',
        content: 'Let me search for your record...'
      },
      {
        type: 'request-complete',
        content: 'Found your information!'
      }
    ]
  },
  
  // 2. Check Availability
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment slots for a specific date. Always use this before booking.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format'
          },
          appointmentType: {
            type: 'string',
            description: 'Type: cleaning, exam, filling'
          }
        },
        required: ['date']
      }
    },
    async: false,
    server: {
      url: `${BASE_URL}/api/pms/appointments/availability`,
      timeoutSeconds: 20,
      credentialId: CREDENTIAL_ID
    },
    messages: [
      {
        type: 'request-start',
        content: 'Checking our schedule...'
      }
    ]
  },
  
  // 3. Book Appointment
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment. Must have patient ID and check availability first.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID' },
          appointmentType: { type: 'string', description: 'Appointment type' },
          startTime: { type: 'string', description: 'ISO 8601 datetime' },
          duration: { type: 'number', description: 'Duration in minutes' }
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration']
      }
    },
    async: false,
    server: {
      url: `${BASE_URL}/api/pms/appointments`,
      timeoutSeconds: 20,
      credentialId: CREDENTIAL_ID
    },
    messages: [
      {
        type: 'request-start',
        content: 'Booking your appointment...'
      },
      {
        type: 'request-complete',
        content: 'Your appointment is booked!'
      }
    ]
  },
  
  // 4. Get Patient Info
  {
    type: 'function',
    function: {
      name: 'getPatientInfo',
      description: 'Get patient details and balance.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID' }
        },
        required: ['patientId']
      }
    },
    async: false,
    server: {
      url: `${BASE_URL}/api/pms/patients`,
      timeoutSeconds: 15,
      credentialId: CREDENTIAL_ID
    }
  },
  
  // 5. Create Patient
  {
    type: 'function',
    function: {
      name: 'createPatient',
      description: 'Create new patient record for first-time callers.',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email (optional)' }
        },
        required: ['firstName', 'lastName', 'phone']
      }
    },
    async: false,
    server: {
      url: `${BASE_URL}/api/pms/patients`,
      timeoutSeconds: 20,
      credentialId: CREDENTIAL_ID
    },
    messages: [
      {
        type: 'request-start',
        content: 'Creating your patient record...'
      }
    ]
  }
];

// BUILT-IN TOOLS (configured in assistant's model.tools, not created separately)
const BUILTIN_TOOLS = {
  transferCall: {
    type: 'transferCall',
    destinations: [
      {
        type: 'number',
        number: '+14156635316',
        message: 'Let me transfer you to our office. One moment please.',
        description: 'Main office line'
      }
    ]
  },
  endCall: {
    type: 'endCall',
    messages: [
      {
        type: 'request-complete',
        content: 'Thank you for calling! Have a great day!'
      }
    ]
  }
};

async function createTools() {
  const createdToolIds = [];
  
  console.log('📝 Creating tools...\n');
  
  for (const toolConfig of TOOLS_CONFIG) {
    try {
      const toolName = toolConfig.function?.name || toolConfig.type;
      console.log(`Creating: ${toolName}...`);
      
      const response = await fetch('https://api.vapi.ai/tool', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toolConfig)
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.log(`   ❌ ${response.status}: ${error.substring(0, 200)}`);
        
        // Try to find existing
        const listRes = await fetch('https://api.vapi.ai/tool', {
          headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
        });
        if (listRes.ok) {
          const tools = await listRes.json();
          const existing = tools.find(t => t.function?.name === toolName || t.type === toolName);
          if (existing) {
            console.log(`   ✓ Using existing (${existing.id})`);
            createdToolIds.push(existing.id);
          }
        }
        continue;
      }
      
      const tool = await response.json();
      console.log(`   ✅ Created (${tool.id})`);
      createdToolIds.push(tool.id);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  return createdToolIds;
}

async function attachToAssistant(toolIds) {
  console.log(`\n🔗 Configuring assistant with tools...\n`);
  
  try {
    const response = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `You are Riley, a friendly dental receptionist.

AVAILABLE TOOLS:
- searchPatients: Find patients by name/phone/email
- checkAvailability: Check appointment slots
- bookAppointment: Book appointments
- getPatientInfo: Get patient details
- createPatient: Create new patients
- transferCall: Transfer to office staff
- endCall: End the call

WORKFLOW:
1. Greet warmly
2. Ask patient name
3. Use searchPatients
4. If not found, use createPatient
5. Ask appointment type
6. Ask preferred date
7. Use checkAvailability
8. Use bookAppointment
9. Confirm details

Be natural and helpful!`
            }
          ],
          toolIds: toolIds,
          tools: [
            BUILTIN_TOOLS.transferCall,
            BUILTIN_TOOLS.endCall
          ]
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${response.status}: ${error}`);
    }
    
    const updated = await response.json();
    console.log('✅ Assistant configured!\n');
    
    console.log('📋 Summary:');
    console.log(`   Custom Tools (toolIds): ${toolIds.length}`);
    console.log(`   Built-in Tools: 2 (transferCall, endCall)`);
    console.log(`   Total Tools: ${toolIds.length + 2}`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Auth: Bearer Token via credentialId`);
    console.log('');
    
    console.log('🎯 Test:');
    console.log('   Call: +1 (415) 663-5316');
    console.log('   Monitor: ./scripts/check-pms-activity.sh');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    const toolIds = await createTools();
    if (toolIds.length === 0) {
      console.log('\n❌ No tools created');
      process.exit(1);
    }
    await attachToAssistant(toolIds);
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
}

main();
