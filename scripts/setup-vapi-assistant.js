/**
 * Vapi Assistant Creator with PMS Tools
 * 
 * This script creates or updates a Vapi assistant with PMS integration tools.
 * It uses the Vapi API to configure the assistant programmatically.
 */

const VAPI_API_KEY = process.env.VAPI_API_KEY || '75425176-d4b2-4957-9a5d-40b18bcce434';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://parlae.ca';
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || 'parlae-vapi-webhook-secret-change-in-production';

// PMS Tools Configuration
const PMS_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment time slots for booking. Use this before booking to show patients what times are available.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            format: 'date',
            description: 'Date to check availability (YYYY-MM-DD format). Example: 2026-02-15',
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, etc.',
          },
          providerId: {
            type: 'string',
            description: 'Specific provider/dentist ID if patient has a preference (optional)',
          },
        },
        required: ['date'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments/availability`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment for a patient. Always check availability first before booking.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from the PMS system. Use searchPatients first if you don\'t have this.',
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, etc.',
          },
          startTime: {
            type: 'string',
            format: 'date-time',
            description: 'Start time in ISO 8601 format. Example: 2026-02-15T10:00:00Z',
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes. Default is 30 minutes.',
          },
          notes: {
            type: 'string',
            description: 'Any special notes or instructions for the appointment (optional)',
          },
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rescheduleAppointment',
      description: 'Reschedule an existing appointment to a new date/time. Check availability before rescheduling.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: {
            type: 'string',
            description: 'ID of the appointment to reschedule',
          },
          startTime: {
            type: 'string',
            format: 'date-time',
            description: 'New start time in ISO 8601 format. Example: 2026-02-20T14:00:00Z',
          },
          sendNotification: {
            type: 'boolean',
            description: 'Whether to send notification to patient about the change. Default: true',
          },
        },
        required: ['appointmentId', 'startTime'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments`,
        method: 'PATCH',
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelAppointment',
      description: 'Cancel an existing appointment. Always confirm with the patient before canceling.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: {
            type: 'string',
            description: 'ID of the appointment to cancel',
          },
          reason: {
            type: 'string',
            description: 'Reason for cancellation (optional)',
          },
          sendNotification: {
            type: 'boolean',
            description: 'Whether to send cancellation notification to patient. Default: true',
          },
        },
        required: ['appointmentId'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments`,
        method: 'DELETE',
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone number, or email. Use this to find a patient\'s ID before booking appointments.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term: patient name, phone number, or email',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return. Default: 10',
          },
        },
        required: ['query'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients/search`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPatientInfo',
      description: 'Get detailed information about a patient including contact info, balance, and last visit.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from the PMS system',
          },
        },
        required: ['patientId'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createPatient',
      description: 'Create a new patient record in the PMS. Use this for first-time patients.',
      parameters: {
        type: 'object',
        properties: {
          firstName: {
            type: 'string',
            description: 'Patient\'s first name',
          },
          lastName: {
            type: 'string',
            description: 'Patient\'s last name',
          },
          phone: {
            type: 'string',
            description: 'Patient\'s phone number',
          },
          email: {
            type: 'string',
            description: 'Patient\'s email address (optional)',
          },
          dateOfBirth: {
            type: 'string',
            format: 'date',
            description: 'Date of birth in YYYY-MM-DD format (optional)',
          },
        },
        required: ['firstName', 'lastName', 'phone'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addPatientNote',
      description: 'Add a note to a patient\'s record. Use this to document important information from calls.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
          },
          content: {
            type: 'string',
            description: 'Note content - what the patient said or any important information',
          },
          category: {
            type: 'string',
            description: 'Note category: preference, allergy, medical-history, general (optional)',
          },
        },
        required: ['patientId', 'content'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients/notes`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPatientBalance',
      description: 'Check a patient\'s account balance and payment history.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
          },
        },
        required: ['patientId'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients/balance`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPatientInsurance',
      description: 'Get patient\'s insurance information.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
          },
        },
        required: ['patientId'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients/insurance`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'processPayment',
      description: 'Process a payment for a patient. Use with caution and always confirm amount with patient.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
          },
          amount: {
            type: 'number',
            description: 'Payment amount in dollars',
          },
          method: {
            type: 'string',
            enum: ['cash', 'check', 'credit_card', 'debit_card', 'ach'],
            description: 'Payment method',
          },
          notes: {
            type: 'string',
            description: 'Payment notes (optional)',
          },
        },
        required: ['patientId', 'amount', 'method'],
      },
      server: {
        url: `${BASE_URL}/api/pms/payments`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
];

const PMS_SYSTEM_PROMPT = `
You have access to the practice management system and can:
1. Check appointment availability
2. Book, reschedule, and cancel appointments
3. Search for and manage patient records
4. Add notes to patient files
5. Check insurance and billing information
6. Process payments

IMPORTANT GUIDELINES:
- Always search for a patient first before booking appointments
- Always check availability before booking or rescheduling
- Always confirm details with the patient before making changes
- Be careful with PHI (Protected Health Information) - never share sensitive data inappropriately
- If you need to transfer to a human, explain why and what you've done so far
- For emergencies, prioritize urgent care and escalate appropriately

APPOINTMENT BOOKING FLOW:
1. Greet the patient and ask what they need
2. If booking: Ask for their name and phone to search for their record
3. If new patient: Collect basic info (first name, last name, phone, email)
4. Ask for preferred appointment type (cleaning, exam, etc.)
5. Check availability and offer time slots
6. Confirm the appointment details
7. Book the appointment
8. Provide confirmation number and details

Be warm, professional, and helpful. You're the friendly voice of the practice!
`;

async function createPmsAssistant() {
  console.log('🤖 Creating Vapi Assistant with PMS Tools...\n');
  console.log('Base URL:', BASE_URL);
  console.log('API Key:', VAPI_API_KEY.substring(0, 20) + '...');
  console.log('=' .repeat(60));
  
  try {
    const assistantConfig = {
      name: 'Parlae Dental Receptionist (PMS Enabled)',
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You are Riley, a friendly and professional dental receptionist for Parlae AI.

You help patients with:
- Booking, rescheduling, and canceling appointments
- Answering questions about their account
- Taking messages for the dentist
- Providing general information about the practice

${PMS_SYSTEM_PROMPT}`,
          },
        ],
      },
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM',  // Rachel from ElevenLabs
      },
      serverUrl: `${BASE_URL}/api/vapi/webhook`,
      serverUrlSecret: WEBHOOK_SECRET,
      firstMessage: "Hi! I'm Riley, your virtual dental receptionist. How can I help you today?",
      endCallMessage: "Thank you for calling! Have a great day!",
      endCallPhrases: ["goodbye", "bye", "that's all", "thank you bye"],
    };
    
    console.log('\n📝 Assistant Configuration:');
    console.log('   Name:', assistantConfig.name);
    console.log('   Model:', assistantConfig.model.model);
    console.log('   Voice:', assistantConfig.voice.voiceId);
    console.log('   Tools:', PMS_TOOLS.length, 'PMS tools configured');
    console.log('\n🔗 Webhook URLs:');
    PMS_TOOLS.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.function.name}: ${tool.function.server.url}`);
    });
    
    console.log('\n🚀 Creating assistant via Vapi API...');
    
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assistantConfig),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to create assistant:');
      console.error('   Status:', response.status, response.statusText);
      console.error('   Error:', error);
      return;
    }
    
    const assistant = await response.json();
    
    console.log('\n✅ Assistant created successfully!');
    console.log('\n📋 Assistant Details:');
    console.log('   ID:', assistant.id);
    console.log('   Name:', assistant.name);
    console.log('   Created:', new Date(assistant.createdAt).toLocaleString());
    
    console.log('\n🔧 Next Steps:');
    console.log('   1. Save this assistant ID:', assistant.id);
    console.log('   2. Test by creating a call with this assistant');
    console.log('   3. IMPORTANT: Include accountId in call metadata!');
    console.log('\n   Example call creation:');
    console.log(`   
   const call = await vapiClient.calls.create({
     assistantId: '${assistant.id}',
     metadata: {
       accountId: '<clinic-account-id>',  // ⚠️ REQUIRED!
     },
   });
   `);
    
    console.log('\n' + '='.repeat(60));
    
    return assistant;
    
  } catch (error) {
    console.error('\n❌ Error creating assistant:', error);
  }
}

// List existing assistants
async function listAssistants() {
  console.log('\n📋 Listing existing assistants...\n');
  
  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      console.error('❌ Failed to list assistants:', response.statusText);
      return;
    }
    
    const assistants = await response.json();
    
    console.log(`Found ${assistants.length} assistant(s):\n`);
    assistants.forEach((assistant, i) => {
      console.log(`${i + 1}. ${assistant.name}`);
      console.log(`   ID: ${assistant.id}`);
      console.log(`   Model: ${assistant.model?.model || 'N/A'}`);
      console.log(`   Tools: ${assistant.tools?.length || 0}`);
      console.log('');
    });
    
    return assistants;
    
  } catch (error) {
    console.error('❌ Error listing assistants:', error);
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'create';
  
  if (command === 'list') {
    await listAssistants();
  } else if (command === 'create') {
    await createPmsAssistant();
  } else {
    console.log('Usage: node setup-vapi-assistant.js [create|list]');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createPmsAssistant, listAssistants, PMS_TOOLS };
