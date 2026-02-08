import { NextResponse } from 'next/server';
import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/agent/setup-squad
 * 
 * Create a multi-assistant Squad for complex workflows like:
 * - Dental clinic: Triage → Emergency/Scheduler
 * - Sales: Qualifier → Demo Scheduler → Account Manager
 * - Support: L1 → L2 → Engineering
 * 
 * Body:
 * {
 *   customerName: string
 *   squadType: 'dental-clinic' | 'sales' | 'support'
 *   phoneNumber?: string (or will purchase new)
 *   areaCode?: string
 *   businessInfo: {
 *     services?: string[]
 *     hours?: string
 *     location?: string
 *   }
 * }
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    const body = await request.json();
    const {
      customerName,
      customerEmail,
      squadType,
      phoneNumber: existingPhoneNumber,
      areaCode,
      twilioSubAccountSid,
      businessInfo,
    } = body;

    logger.info({
      customerName,
      squadType,
    }, '[Squad Setup] Starting squad setup');

    const vapiService = createVapiService();
    const twilioService = createTwilioService();

    if (!vapiService.isEnabled()) {
      return NextResponse.json(
        { success: false, message: 'Vapi integration not configured' },
        { status: 500 }
      );
    }

    // STEP 1: Get or purchase phone number
    let phoneNumber = existingPhoneNumber;
    let purchasedNumber;

    if (!phoneNumber && twilioService.isEnabled()) {
      logger.info({ areaCode }, '[Squad Setup] Purchasing phone number');
      
      const availableNumbers = await twilioService.searchAvailableNumbers(
        'US',
        'Local',
        { areaCode, smsEnabled: true, voiceEnabled: true, limit: 1 }
      );

      if (availableNumbers.length === 0) {
        return NextResponse.json(
          { success: false, message: 'No available phone numbers found' },
          { status: 500 }
        );
      }

      purchasedNumber = await twilioService.purchaseNumber(
        {
          phoneNumber: availableNumbers[0].phoneNumber,
          friendlyName: `${customerName} - Squad`,
        },
        twilioSubAccountSid
      );

      if (!purchasedNumber) {
        return NextResponse.json(
          { success: false, message: 'Failed to purchase phone number' },
          { status: 500 }
        );
      }

      phoneNumber = purchasedNumber.phoneNumber;
    }

    // STEP 2: Create knowledge base if needed
    let knowledgeFileIds: string[] = [];
    
    if (businessInfo) {
      const knowledgeContent = buildKnowledgeBase(businessInfo);
      const fileId = await vapiService.uploadKnowledgeFile({
        name: `${customerName} - Knowledge Base`,
        content: knowledgeContent,
        type: 'text',
      });

      if (fileId) {
        knowledgeFileIds.push(fileId);
      }
    }

    // STEP 3: Create squad based on type
    let squad;

    switch (squadType) {
      case 'dental-clinic':
        squad = await createDentalClinicSquad(
          vapiService,
          customerName,
          knowledgeFileIds,
          businessInfo
        );
        break;

      case 'sales':
        squad = await createSalesSquad(
          vapiService,
          customerName,
          knowledgeFileIds,
          businessInfo
        );
        break;

      case 'support':
        squad = await createSupportSquad(
          vapiService,
          customerName,
          knowledgeFileIds,
          businessInfo
        );
        break;

      default:
        return NextResponse.json(
          { success: false, message: 'Invalid squad type' },
          { status: 400 }
        );
    }

    if (!squad) {
      // Cleanup: Release phone number if purchased
      if (purchasedNumber) {
        await twilioService.releaseNumber(purchasedNumber.sid, twilioSubAccountSid);
      }
      
      return NextResponse.json(
        { success: false, message: 'Failed to create squad' },
        { status: 500 }
      );
    }

    // STEP 4: Link phone number to squad
    if (phoneNumber && twilioService.isEnabled()) {
      const twilioAccountSid = twilioSubAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';

      // Import phone to Vapi (will use the first assistant in the squad)
      const vapiPhoneNumber = await vapiService.importPhoneNumber(
        phoneNumber,
        twilioAccountSid,
        twilioAuthToken
      );

      if (!vapiPhoneNumber) {
        logger.warn('[Squad Setup] Failed to import phone number to Vapi');
      }
    }

    logger.info({
      squadId: squad.id,
      squadName: squad.name,
      phoneNumber,
    }, '[Squad Setup] Squad created successfully');

    return NextResponse.json({
      success: true,
      squad: {
        id: squad.id,
        name: squad.name,
        type: squadType,
        phoneNumber,
        members: squad.members?.length || 0,
      },
      message: 'Squad created successfully',
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Squad Setup] Exception during setup');

    return NextResponse.json(
      { success: false, message: 'Failed to setup squad' },
      { status: 500 }
    );
  }
}

/**
 * Create a dental clinic triage and booking squad
 * Based on: https://docs.vapi.ai/squads/examples/clinic-triage-scheduling
 */
async function createDentalClinicSquad(
  vapiService: any,
  customerName: string,
  knowledgeFileIds: string[],
  businessInfo: any
) {
  const logger = await getLogger();

  logger.info('[Squad Setup] Creating dental clinic squad');

  // Define tools for booking appointments
  const bookingTool = {
    type: 'function' as const,
    function: {
      name: 'bookAppointment',
      description: 'Books a dental appointment for the patient',
      parameters: {
        type: 'object' as const,
        properties: {
          patientName: { type: 'string', description: 'Patient full name' },
          phoneNumber: { type: 'string', description: 'Contact phone number' },
          email: { type: 'string', description: 'Contact email' },
          serviceType: { 
            type: 'string',
            enum: ['cleaning', 'filling', 'exam', 'emergency', 'cosmetic'],
            description: 'Type of dental service needed'
          },
          preferredDate: { type: 'string', description: 'Preferred appointment date (YYYY-MM-DD)' },
          preferredTime: { type: 'string', description: 'Preferred time (HH:MM)' },
        },
        required: ['patientName', 'phoneNumber', 'serviceType'],
      },
    },
    async: false,
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
      secret: process.env.VAPI_SERVER_SECRET,
      timeoutSeconds: 20,
    },
    messages: [
      {
        type: 'request-start' as const,
        content: 'Let me check our availability...',
      },
      {
        type: 'request-complete' as const,
        content: 'Great! I\'ve booked your appointment.',
      },
    ],
  };

  const checkAvailabilityTool = {
    type: 'function' as const,
    function: {
      name: 'checkAvailability',
      description: 'Checks available appointment slots',
      parameters: {
        type: 'object' as const,
        properties: {
          date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' },
          serviceType: { type: 'string', description: 'Type of service' },
        },
        required: ['date'],
      },
    },
    async: false,
    server: {
      url: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
      secret: process.env.VAPI_SERVER_SECRET,
    },
  };

  const squad = await vapiService.createSquad({
    name: `${customerName} - Dental Clinic`,
    members: [
      {
        assistant: {
          name: 'Triage Assistant',
          voice: {
            provider: 'elevenlabs',
            voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - calm, professional
          },
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            systemPrompt: `You are the triage assistant for ${customerName}.

Your role is to:
1. Greet the caller warmly
2. Ask about their dental concern
3. Identify if it's an emergency (severe pain, bleeding, trauma, swelling, infection)
4. For emergencies: transfer to Emergency Assistant
5. For routine care: transfer to Scheduler Assistant

Red flags (transfer to emergency):
- Severe/unbearable pain
- Uncontrolled bleeding
- Facial swelling
- Knocked-out tooth
- Signs of infection (fever, pus)
- Broken jaw or facial trauma

Be empathetic, professional, and efficient. Get the key information quickly.`,
            temperature: 0.7,
            maxTokens: 300,
            ...(knowledgeFileIds.length > 0 && {
              knowledgeBase: {
                provider: 'canonical',
                topK: 3,
                fileIds: knowledgeFileIds,
              },
            }),
          },
          firstMessage: `Thank you for calling ${customerName}! How can I help you today?`,
          firstMessageMode: 'assistant-speaks-first',
          recordingEnabled: true,
          serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
          serverUrlSecret: process.env.VAPI_SERVER_SECRET,
        },
        assistantDestinations: [
          {
            type: 'assistant',
            assistantName: 'Emergency Assistant',
            message: 'Transferring you to our emergency line immediately.',
            description: 'Transfer to emergency for urgent dental issues requiring immediate attention',
          },
          {
            type: 'assistant',
            assistantName: 'Scheduler Assistant',
            message: 'Let me connect you with our scheduler to find the best appointment time.',
            description: 'Transfer to scheduler for routine appointments',
          },
        ],
      },
      {
        assistant: {
          name: 'Emergency Assistant',
          voice: {
            provider: 'elevenlabs',
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - calm, authoritative
          },
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            systemPrompt: `You are the emergency dental assistant for ${customerName}.

Your role is to:
1. Stay calm and reassuring
2. Gather critical information quickly:
   - Name and contact info
   - Exact nature of emergency
   - When it started
   - Current location
3. Provide immediate first aid advice if appropriate
4. Tell them we'll see them immediately or direct to ER if needed
5. Get them scheduled for an emergency appointment TODAY

Keep interactions brief and focused. This is urgent.`,
            temperature: 0.6,
            maxTokens: 200,
          },
          firstMessage: 'I understand this is urgent. Let me help you right away.',
          tools: [bookingTool],
          recordingEnabled: true,
          serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
          serverUrlSecret: process.env.VAPI_SERVER_SECRET,
        },
      },
      {
        assistant: {
          name: 'Scheduler Assistant',
          voice: {
            provider: 'elevenlabs',
            voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - warm, friendly
          },
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            systemPrompt: `You are the scheduling assistant for ${customerName}.

Your role is to:
1. Gather patient information (name, phone, email)
2. Understand what service they need
3. Check availability using the checkAvailability tool
4. Offer 2-3 time slots
5. Book the appointment using the bookAppointment tool
6. Confirm all details clearly

${businessInfo?.hours ? `Our hours: ${businessInfo.hours}` : 'Check our hours before offering times.'}
${businessInfo?.location ? `Our location: ${businessInfo.location}` : ''}

Be friendly, efficient, and make sure they have all the information they need.`,
            temperature: 0.7,
            maxTokens: 400,
          },
          firstMessage: 'I\'d be happy to help you schedule an appointment!',
          tools: [checkAvailabilityTool, bookingTool],
          recordingEnabled: true,
          serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
          serverUrlSecret: process.env.VAPI_SERVER_SECRET,
          analysisSchema: {
            type: 'object',
            properties: {
              patientName: { type: 'string' },
              phoneNumber: { type: 'string' },
              email: { type: 'string' },
              serviceType: { type: 'string' },
              appointmentBooked: { type: 'boolean' },
              appointmentDate: { type: 'string' },
              appointmentTime: { type: 'string' },
            },
          },
        },
      },
    ],
  });

  return squad;
}

/**
 * Create a sales qualification and demo squad
 */
async function createSalesSquad(
  vapiService: any,
  customerName: string,
  knowledgeFileIds: string[],
  businessInfo: any
) {
  // TODO: Implement sales squad (Qualifier → Demo Scheduler → Account Manager)
  return null;
}

/**
 * Create a support triage squad
 */
async function createSupportSquad(
  vapiService: any,
  customerName: string,
  knowledgeFileIds: string[],
  businessInfo: any
) {
  // TODO: Implement support squad (L1 → L2 → Engineering)
  return null;
}

/**
 * Build knowledge base content from business info
 */
function buildKnowledgeBase(businessInfo: any): string {
  let kb = '';

  if (businessInfo.services && Array.isArray(businessInfo.services)) {
    kb += `Services We Offer:\n`;
    businessInfo.services.forEach((service: string) => {
      kb += `- ${service}\n`;
    });
    kb += '\n';
  }

  if (businessInfo.hours) {
    kb += `Business Hours: ${businessInfo.hours}\n\n`;
  }

  if (businessInfo.location) {
    kb += `Location: ${businessInfo.location}\n\n`;
  }

  if (businessInfo.insurance) {
    kb += `Insurance: ${businessInfo.insurance}\n\n`;
  }

  if (businessInfo.pricing) {
    kb += `Pricing Information:\n${businessInfo.pricing}\n\n`;
  }

  if (businessInfo.policies) {
    kb += `Policies:\n${businessInfo.policies}\n\n`;
  }

  return kb;
}
