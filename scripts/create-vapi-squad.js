#!/usr/bin/env node
/**
 * Create Vapi Squad for Dental Office
 * Step 1: Create assistants separately
 * Step 2: Create squad with assistant references
 */

const VAPI_API_KEY = '75425176-d4b2-4957-9a5d-40b18bcce434';
const env = process.argv[2] || 'local';

const CREDENTIALS = {
  local: '02435653-3d64-4fdf-b66a-95d830e4f026',
  production: '02435653-3d64-4fdf-b66a-95d830e4f026'
};

const CREDENTIAL_ID = CREDENTIALS[env];
const BASE_URL = env === 'production' 
  ? 'https://parlae.ca' 
  : 'https://matterless-eartha-unraffled.ngrok-free.dev';

console.log(`🏥 Creating Dental Office Squad (${env.toUpperCase()})`);
console.log(`📍 Base URL: ${BASE_URL}\n`);

// PMS Tools Configuration
const PMS_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone, or email',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/patients/search`,
      timeoutSeconds: 15,
      credentialId: CREDENTIAL_ID
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment slots',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          appointmentType: { type: 'string', description: 'Type of appointment' }
        },
        required: ['date']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/appointments/availability`,
      timeoutSeconds: 20,
      credentialId: CREDENTIAL_ID
    }
  },
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          appointmentType: { type: 'string' },
          startTime: { type: 'string' },
          duration: { type: 'number' }
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/appointments`,
      timeoutSeconds: 20,
      credentialId: CREDENTIAL_ID
    }
  },
  {
    type: 'function',
    function: {
      name: 'getPatientInfo',
      description: 'Get patient details and balance',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string' }
        },
        required: ['patientId']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/patients`,
      timeoutSeconds: 15,
      credentialId: CREDENTIAL_ID
    }
  },
  {
    type: 'function',
    function: {
      name: 'createPatient',
      description: 'Create new patient record',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' }
        },
        required: ['firstName', 'lastName', 'phone']
      }
    },
    server: {
      url: `${BASE_URL}/api/pms/patients`,
      timeoutSeconds: 20,
      credentialId: CREDENTIAL_ID
    }
  }
];

async function createToolsAndGetIds() {
  console.log('📝 Creating PMS tools...\n');
  
  const toolIds = [];
  
  for (const toolConfig of PMS_TOOLS) {
    try {
      const toolName = toolConfig.function.name;
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
        // Try to find existing
        const listRes = await fetch('https://api.vapi.ai/tool', {
          headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
        });
        if (listRes.ok) {
          const tools = await listRes.json();
          const existing = tools.find(t => t.function?.name === toolName);
          if (existing) {
            console.log(`   ✓ Using existing (${existing.id})`);
            toolIds.push(existing.id);
            continue;
          }
        }
        const error = await response.text();
        console.log(`   ❌ ${response.status}: ${error.substring(0, 100)}`);
        continue;
      }
      
      const tool = await response.json();
      console.log(`   ✅ Created (${tool.id})`);
      toolIds.push(tool.id);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  return toolIds;
}

async function createAssistants(toolIds) {
  console.log(`\n👥 Creating Squad Assistants...\n`);
  
  const assistants = [];
  
  // 1. Riley - Receptionist
  console.log('Creating: Riley - Receptionist...');
  try {
    const rileyConfig = {
      name: 'Riley - Receptionist',
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You are Riley, the friendly dental receptionist.

SKILLS:
- Search for patients
- Check appointment availability
- Book appointments
- Answer questions about services
- Handle billing inquiries

WORKFLOW:
1. Greet warmly
2. Identify patient (use searchPatients)
3. Understand their need
4. For appointments: check availability, book, confirm
5. For emergencies: handoff to Emergency Handler
6. For scheduling issues: can handoff to Scheduler

Be conversational and empathetic!`
          }
        ],
        toolIds: toolIds
      },
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM'
      }
    };
    
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rileyConfig)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed: ${response.status} - ${error}`);
    }
    
    const riley = await response.json();
    console.log(`   ✅ Created (${riley.id})`);
    assistants.push({ name: 'Riley - Receptionist', id: riley.id });
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
  
  // 2. Emergency Handler
  console.log('Creating: Emergency Handler...');
  try {
    const emergencyConfig = {
      name: 'Emergency Handler',
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content: `You are the emergency dental assistant.

PRIORITY: Assess urgency immediately.

QUESTIONS TO ASK:
- What is the emergency?
- Are you in severe pain?
- Is there bleeding or swelling?
- When did this start?

ACTIONS:
- Severe emergency: Transfer to dentist immediately
- Moderate: Book urgent same-day appointment
- Minor: Book regular appointment

Be calm, reassuring, and quick.`
          }
        ],
        toolIds: toolIds,
        tools: [
          {
            type: 'transferCall',
            destinations: [
              {
                type: 'number',
                number: '+14156635316',
                message: 'Transferring you to the dentist now...'
              }
            ]
          }
        ]
      },
      voice: {
        provider: '11labs',
        voiceId: 'EXAVITQu4vr4xnSDxMaL'
      }
    };
    
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emergencyConfig)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed: ${response.status} - ${error}`);
    }
    
    const emergency = await response.json();
    console.log(`   ✅ Created (${emergency.id})`);
    assistants.push({ name: 'Emergency Handler', id: emergency.id });
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
  
  // 3. Scheduler
  console.log('Creating: Scheduler...');
  try {
    const schedulerConfig = {
      name: 'Scheduler',
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: `You are the appointment scheduling specialist.

FOCUS: Efficient appointment booking.

WORKFLOW:
1. Confirm patient identity (searchPatients)
2. Ask: What type of appointment? (cleaning, exam, filling, etc.)
3. Ask: Preferred date/time?
4. Use checkAvailability
5. Offer 2-3 time slots
6. Use bookAppointment
7. Confirm details clearly

Be efficient and detail-oriented!`
          }
        ],
        toolIds: toolIds
      },
      voice: {
        provider: '11labs',
        voiceId: 'pNInz6obpgDQGcFmaJgB'
      }
    };
    
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(schedulerConfig)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed: ${response.status} - ${error}`);
    }
    
    const scheduler = await response.json();
    console.log(`   ✅ Created (${scheduler.id})`);
    assistants.push({ name: 'Scheduler', id: scheduler.id });
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
  
  return assistants;
}

async function createSquad(assistants) {
  console.log(`\n🏥 Creating Squad...\n`);
  
  const squadConfig = {
    name: 'Dental Office Team',
    members: assistants.map((asst, index) => {
      const member = {
        assistantId: asst.id
      };
      
      // Only Riley (first assistant) can handoff to others
      if (index === 0) {
        member.assistantDestinations = [
          {
            type: 'assistant',
            assistantId: assistants[1].id  // Emergency Handler
          },
          {
            type: 'assistant',
            assistantId: assistants[2].id  // Scheduler
          }
        ];
      }
      
      return member;
    })
  };
  
  try {
    const response = await fetch('https://api.vapi.ai/squad', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(squadConfig)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create squad: ${response.status} - ${error}`);
    }
    
    const squad = await response.json();
    console.log('✅ Squad created!\n');
    
    console.log('📋 Summary:');
    console.log(`   Squad ID: ${squad.id}`);
    console.log(`   Squad Name: ${squad.name}`);
    console.log(`   Members: ${squad.members.length}`);
    console.log('');
    
    console.log('👥 Assistants:');
    assistants.forEach((asst, i) => {
      console.log(`   ${i + 1}. ${asst.name} (${asst.id})`);
    });
    console.log('');
    
    console.log('🎯 Next Steps:');
    console.log('   1. Update database with squad ID:');
    console.log(`      UPDATE vapi_phone_numbers SET vapi_squad_id = '${squad.id}' WHERE phone_number = '+14156635316';`);
    console.log('   2. Attach to phone number:');
    console.log(`      curl -X PATCH "https://api.vapi.ai/phone-number/2ae93ae3-d93e-435c-9332-78a086e29647" \\`);
    console.log(`        -H "Authorization: Bearer ${VAPI_API_KEY}" \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"squadId": "${squad.id}"}'`);
    console.log('   3. Test call: +1 (415) 663-5316');
    
    return squad;
    
  } catch (error) {
    console.error('\n❌ Error creating squad:', error.message);
    throw error;
  }
}

async function main() {
  try {
    const toolIds = await createToolsAndGetIds();
    
    if (toolIds.length === 0) {
      console.log('\n❌ No tools created');
      process.exit(1);
    }
    
    const assistants = await createAssistants(toolIds);
    
    if (assistants.length < 3) {
      console.log('\n❌ Not all assistants created');
      process.exit(1);
    }
    
    await createSquad(assistants);
    
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
}

main();
