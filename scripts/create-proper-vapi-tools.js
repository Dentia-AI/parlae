#!/usr/bin/env node
/**
 * Create Proper Vapi Tools with Authentication
 * Uses apiRequest, transferCall, and endCall tool types
 */

const VAPI_API_KEY = '75425176-d4b2-4957-9a5d-40b18bcce434';
const VAPI_SECRET = 'parlae-vapi-webhook-secret-change-in-production';
const ASSISTANT_ID = '644878a7-429b-4ed1-b850-6a9aefb8176d';

const env = process.argv[2] || 'local';
const BASE_URL = env === 'production' 
  ? 'https://parlae.ca' 
  : 'https://matterless-eartha-unraffled.ngrok-free.dev';

console.log(`🔧 Creating Proper Vapi Tools with Authentication (${env.toUpperCase()})`);
console.log(`📍 Base URL: ${BASE_URL}\n`);

// PROPER TOOLS using apiRequest type with authentication
const TOOLS_CONFIG = [
  // 1. Search Patients - API Request Tool
  {
    type: 'apiRequest',
    apiRequest: {
      url: `${BASE_URL}/api/pms/patients/search`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Secret': VAPI_SECRET
      },
      body: {
        query: '{{query}}'
      }
    },
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone, or email. Use this to find a patient ID before booking appointments.',
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
    }
  },
  
  // 2. Check Availability - API Request Tool  
  {
    type: 'apiRequest',
    apiRequest: {
      url: `${BASE_URL}/api/pms/appointments/availability`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Secret': VAPI_SECRET
      },
      queryParams: [
        { key: 'date', value: '{{date}}' },
        { key: 'appointmentType', value: '{{appointmentType}}' }
      ]
    },
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
            description: 'Type of appointment: cleaning, exam, filling, etc.'
          }
        },
        required: ['date']
      }
    }
  },
  
  // 3. Book Appointment - API Request Tool
  {
    type: 'apiRequest',
    apiRequest: {
      url: `${BASE_URL}/api/pms/appointments`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Secret': VAPI_SECRET
      },
      body: {
        patientId: '{{patientId}}',
        appointmentType: '{{appointmentType}}',
        startTime: '{{startTime}}',
        duration: '{{duration}}'
      }
    },
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment. Always check availability first and get patient ID from searchPatients.',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID from searchPatients result' },
          appointmentType: { type: 'string', description: 'Type of appointment' },
          startTime: { type: 'string', description: 'ISO 8601 datetime, e.g. 2026-02-15T10:00:00Z' },
          duration: { type: 'number', description: 'Duration in minutes, default 30' }
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration']
      }
    }
  },
  
  // 4. Get Patient Info - API Request Tool
  {
    type: 'apiRequest',
    apiRequest: {
      url: `${BASE_URL}/api/pms/patients/{{patientId}}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Secret': VAPI_SECRET
      }
    },
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
    }
  },
  
  // 5. Create Patient - API Request Tool
  {
    type: 'apiRequest',
    apiRequest: {
      url: `${BASE_URL}/api/pms/patients`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Secret': VAPI_SECRET
      },
      body: {
        firstName: '{{firstName}}',
        lastName: '{{lastName}}',
        phone: '{{phone}}',
        email: '{{email}}'
      }
    },
    function: {
      name: 'createPatient',
      description: 'Create a new patient record for first-time callers.',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email address (optional)' }
        },
        required: ['firstName', 'lastName', 'phone']
      }
    }
  },
  
  // 6. Transfer Call Tool - For escalating to human
  {
    type: 'transferCall',
    transferCall: {
      destinations: [
        {
          type: 'number',
          number: '+14156635316',  // Replace with office number
          message: 'Let me transfer you to our office. Please hold.',
          description: 'Main office line'
        }
      ]
    },
    function: {
      name: 'transferToHuman',
      description: 'Transfer the call to a human receptionist. Use this when you cannot help the patient or they request to speak with a person.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief reason for the transfer'
          }
        }
      }
    }
  },
  
  // 7. End Call Tool
  {
    type: 'endCall',
    function: {
      name: 'endCall',
      description: 'End the call when the conversation is complete and the patient says goodbye.',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    messages: [
      {
        type: 'request-complete',
        content: 'Thank you for calling! Have a great day!'
      }
    ]
  }
];

async function createTools() {
  const createdToolIds = [];
  
  console.log('📝 Creating tools with proper authentication...\n');
  
  for (const toolConfig of TOOLS_CONFIG) {
    try {
      const toolName = toolConfig.function?.name || toolConfig.type;
      console.log(`Creating: ${toolName} (${toolConfig.type})...`);
      
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
        console.log(`   ❌ ${response.status}: ${error.substring(0, 150)}`);
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
  console.log(`\n🔗 Attaching ${toolIds.length} tools to assistant...\n`);
  
  try {
    // Get current config
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });
    
    const current = await getResponse.json();
    
    // Update with tools
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
              content: `You are Riley, a friendly and professional dental receptionist.

You help patients with:
- Booking, rescheduling, and canceling appointments
- Answering questions about their account
- Transferring to a human when needed

AVAILABLE TOOLS:
- searchPatients: Find patients by name/phone/email
- checkAvailability: See available appointment slots
- bookAppointment: Book appointments
- getPatientInfo: Get patient details and balance
- createPatient: Create new patient records
- transferToHuman: Transfer to office staff when needed
- endCall: End the call when complete

BOOKING WORKFLOW:
1. Greet warmly and ask how you can help
2. If booking: Ask for their name
3. Use searchPatients to find them
4. If not found: use createPatient
5. Ask what type of appointment
6. Ask for preferred date
7. Use checkAvailability to show available times
8. Once they choose, use bookAppointment
9. Confirm with details

IMPORTANT:
- Always be warm and professional
- If you can't help or patient requests, use transferToHuman
- When conversation is done, use endCall

Be natural and helpful!`
            }
          ],
          toolIds: toolIds
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed: ${response.status} - ${error}`);
    }
    
    const updated = await response.json();
    console.log('✅ Tools attached successfully!\n');
    
    console.log('📋 Final Configuration:');
    console.log(`   Assistant: ${updated.name}`);
    console.log(`   Tools: ${toolIds.length} attached`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log('');
    
    console.log('🔧 Tool Types:');
    console.log(`   ✓ API Request Tools: 5 (with authentication)`);
    console.log(`   ✓ Transfer Call Tool: 1`);
    console.log(`   ✓ End Call Tool: 1`);
    console.log('');
    
    console.log('🔐 Authentication:');
    console.log(`   Header: X-Vapi-Secret`);
    console.log(`   Value: ${VAPI_SECRET.substring(0, 20)}...`);
    console.log('');
    
    console.log('🎯 Next Steps:');
    console.log('   1. Check: https://dashboard.vapi.ai/tools');
    console.log('   2. Call: +1 (415) 663-5316');
    console.log('   3. Monitor: ./scripts/check-pms-activity.sh');
    
    if (env === 'local') {
      console.log('');
      console.log('⚠️  LOCAL MODE - Webhooks via ngrok');
    }
    
  } catch (error) {
    console.error('\n❌ Error attaching tools:', error.message);
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
