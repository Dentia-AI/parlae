#!/usr/bin/env node
/**
 * Create PMS Tools in Vapi and Attach to Assistant
 * Uses Vapi's Tools API properly
 */

const VAPI_API_KEY = '75425176-d4b2-4957-9a5d-40b18bcce434';
const VAPI_SECRET = 'parlae-vapi-webhook-secret-change-in-production';
const ASSISTANT_ID = '644878a7-429b-4ed1-b850-6a9aefb8176d';

const env = process.argv[2] || 'local';
const BASE_URL = env === 'production' 
  ? 'https://parlae.ca' 
  : 'https://matterless-eartha-unraffled.ngrok-free.dev';

console.log(`🔧 Creating PMS Tools in Vapi (${env.toUpperCase()})`);
console.log(`📍 Base URL: ${BASE_URL}\n`);

const TOOLS_CONFIG = [
  {
    type: 'function',
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone number, or email. Use this to find a patient before booking appointments.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patient name, phone number, or email to search for'
          }
        },
        required: ['query']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/patients/search`,
      timeoutSeconds: 15,
      secret: VAPI_SECRET
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment time slots for a specific date. Always use this before booking.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format, e.g. 2026-02-15'
          },
          appointmentType: {
            type: 'string',
            description: 'Type: cleaning, exam, filling, etc.'
          }
        },
        required: ['date']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/appointments/availability`,
      timeoutSeconds: 20,
      secret: VAPI_SECRET
    }
  },
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment. Always check availability first and get patient ID from searchPatients.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID from searchPatients result' },
          appointmentType: { type: 'string', description: 'Type of appointment' },
          startTime: { type: 'string', description: 'ISO 8601 datetime' },
          duration: { type: 'number', description: 'Duration in minutes' }
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/appointments`,
      timeoutSeconds: 20,
      secret: VAPI_SECRET
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
          patientId: { type: 'string', description: 'Patient ID' }
        },
        required: ['patientId']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/patients`,
      timeoutSeconds: 15,
      secret: VAPI_SECRET
    }
  },
  {
    type: 'function',
    function: {
      name: 'createPatient',
      description: 'Create a new patient record for first-time callers.',
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
    server: {
      url: `${BASE_URL}/api/pms/patients`,
      timeoutSeconds: 20,
      secret: VAPI_SECRET
    }
  }
];

async function createOrUpdateTools() {
  const createdToolIds = [];
  
  console.log('📝 Creating tools in Vapi...\n');
  
  for (const toolConfig of TOOLS_CONFIG) {
    try {
      console.log(`Creating: ${toolConfig.function.name}...`);
      
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
        console.log(`   ⚠️  ${response.status}: ${error.substring(0, 100)}`);
        // Try to find existing tool
        const listResponse = await fetch('https://api.vapi.ai/tool', {
          headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
        });
        if (listResponse.ok) {
          const tools = await listResponse.json();
          const existing = tools.find(t => 
            t.function?.name === toolConfig.function.name
          );
          if (existing) {
            console.log(`   ✓ Using existing tool (${existing.id})`);
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

async function attachToolsToAssistant(toolIds) {
  console.log(`\n🔗 Attaching ${toolIds.length} tools to assistant...\n`);
  
  try {
    const response = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        toolIds: toolIds
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to attach tools: ${response.status} - ${error}`);
    }
    
    const updated = await response.json();
    console.log('✅ Tools attached successfully!\n');
    
    return updated;
    
  } catch (error) {
    console.error('❌ Error attaching tools:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const toolIds = await createOrUpdateTools();
    
    if (toolIds.length === 0) {
      console.log('\n❌ No tools created. Check errors above.');
      process.exit(1);
    }
    
    const updated = await attachToolsToAssistant(toolIds);
    
    console.log('📋 Final Configuration:');
    console.log(`   Assistant: ${updated.name}`);
    console.log(`   Tools: ${toolIds.length} attached`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log('');
    
    console.log('🎯 Next Steps:');
    console.log('   1. Open: https://dashboard.vapi.ai/assistants');
    console.log(`   2. Find: ${updated.name}`);
    console.log('   3. Click "Tools" tab to verify');
    console.log('   4. Call: +1 (415) 663-5316');
    console.log('');
    
    if (env === 'local') {
      console.log('⚠️  LOCAL MODE:');
      console.log('   Webhooks → ngrok → localhost:3000');
      console.log('   Monitor: ./scripts/check-pms-activity.sh');
    }
    
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
}

main();
