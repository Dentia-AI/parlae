#!/usr/bin/env node
/**
 * Configure Vapi Assistant with PMS Tools (Server-Side)
 * Uses the correct "tools" format, not deprecated "functions"
 */

const VAPI_API_KEY = '75425176-d4b2-4957-9a5d-40b18bcce434';
const VAPI_SECRET = 'parlae-vapi-webhook-secret-change-in-production';
const ASSISTANT_ID = '644878a7-429b-4ed1-b850-6a9aefb8176d';

const env = process.argv[2] || 'local';
const BASE_URL = env === 'production' 
  ? 'https://parlae.ca' 
  : 'https://matterless-eartha-unraffled.ngrok-free.dev';

console.log(`🔧 Configuring Vapi Assistant with TOOLS (server-side)`);
console.log(`📍 Environment: ${env.toUpperCase()}`);
console.log(`📍 Base URL: ${BASE_URL}\n`);

// Proper tools format with server-side configuration
const PMS_TOOLS = [
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
      description: 'Check available appointment time slots for a specific date. Always use this before booking to show patients what times are available.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date to check in YYYY-MM-DD format, for example: 2026-02-15'
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, etc.'
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
      description: 'Book a new appointment for a patient. You must check availability first and get patient ID from searchPatients.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from the PMS system (get from searchPatients result)'
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, etc.'
          },
          startTime: {
            type: 'string',
            description: 'Start time in ISO 8601 format, for example: 2026-02-15T10:00:00Z'
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes. Default is 30 minutes for most appointments.'
          },
          notes: {
            type: 'string',
            description: 'Any special notes or instructions for the appointment (optional)'
          }
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
      description: 'Get detailed information about a patient including their balance, last visit, and contact information.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from the PMS system'
          }
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
      description: 'Create a new patient record in the system. Use this when someone calls for the first time.',
      parameters: {
        type: 'object',
        properties: {
          firstName: {
            type: 'string',
            description: 'Patient first name'
          },
          lastName: {
            type: 'string',
            description: 'Patient last name'
          },
          phone: {
            type: 'string',
            description: 'Patient phone number'
          },
          email: {
            type: 'string',
            description: 'Patient email address (optional but recommended)'
          },
          dateOfBirth: {
            type: 'string',
            description: 'Date of birth in YYYY-MM-DD format (optional)'
          }
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

const SYSTEM_PROMPT = `You are Riley, a friendly and professional dental receptionist for the practice.

You help patients with booking appointments and answering questions about their account.

IMPORTANT TOOLS YOU HAVE:
- searchPatients: Find patients by name, phone, or email
- checkAvailability: See available appointment time slots
- bookAppointment: Book appointments
- getPatientInfo: Get patient details and balance
- createPatient: Create new patient records

BOOKING WORKFLOW:
1. Greet warmly and ask how you can help
2. If booking: Ask for their name
3. Use searchPatients to find them
4. If not found: Collect info and use createPatient
5. Ask what type of appointment they need
6. Ask for their preferred date
7. Use checkAvailability to show available times
8. Once they choose a time, use bookAppointment
9. Confirm with appointment details and confirmation number

GUIDELINES:
- Always be warm, friendly, and professional
- Always verify patient identity before discussing their account
- Use the tools to get real-time information
- If you can't help, offer to take a message
- For emergencies, prioritize and escalate appropriately

Be natural and conversational!`;

async function updateAssistant() {
  try {
    console.log('📡 Fetching current assistant...');
    
    const getResponse = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });
    
    if (!getResponse.ok) {
      throw new Error(`Failed to fetch: ${getResponse.status}`);
    }
    
    const current = await getResponse.json();
    console.log(`✅ Current: ${current.name}`);
    console.log(`   Current tools: ${current.tools?.length || 0}\n`);
    
    console.log('🔄 Updating with server-side tools...');
    
    const updateData = {
      name: current.name,
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          }
        ]
      },
      voice: current.voice,
      tools: PMS_TOOLS,
      firstMessage: "Hi! I'm Riley, your virtual dental receptionist. How can I help you today?",
      endCallMessage: "Thank you for calling! Have a great day!",
      endCallPhrases: ["goodbye", "bye", "that's all", "thank you bye"]
    };
    
    console.log('📤 Sending update...');
    console.log(`   Tools to configure: ${PMS_TOOLS.length}`);
    
    const updateResponse = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      console.error('❌ Update failed:', updateResponse.status);
      console.error(error);
      throw new Error(`Update failed: ${updateResponse.status}`);
    }
    
    const updated = await updateResponse.json();
    
    console.log('\n✅ Assistant updated successfully!\n');
    console.log('📋 Configuration:');
    console.log(`   Name: ${updated.name}`);
    console.log(`   Model: ${updated.model?.model}`);
    console.log(`   Tools: ${updated.tools?.length || 0}`);
    console.log('');
    
    console.log('🔧 Configured Tools:');
    updated.tools?.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.function?.name}`);
      console.log(`      → ${tool.server?.url}`);
    });
    console.log('');
    
    console.log('🎯 Next Steps:');
    console.log(`   1. Check Vapi UI: https://dashboard.vapi.ai/assistants`);
    console.log(`   2. Verify tools appear in the Tools tab`);
    console.log(`   3. Call: +1 (415) 663-5316`);
    console.log(`   4. Say: "I need to book an appointment"`);
    console.log('');
    
    if (env === 'local') {
      console.log('⚠️  LOCAL MODE - Webhooks via ngrok:');
      console.log(`   ${BASE_URL}`);
      console.log('   Make sure ./dev.sh is running!');
      console.log('');
      console.log('💡 To switch to production:');
      console.log('   node scripts/configure-vapi-pms-tools.js production');
    } else {
      console.log('✅ PRODUCTION MODE');
      console.log(`   Webhooks: ${BASE_URL}`);
    }
    
    console.log('');
    console.log('📊 Monitor activity:');
    console.log('   ./scripts/check-pms-activity.sh');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

updateAssistant();
