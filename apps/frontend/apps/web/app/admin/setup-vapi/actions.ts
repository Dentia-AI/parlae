'use server';

import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';

export async function setupTestAgentAction(areaCode: string = '415') {
  const logger = await getLogger();

  try {
    logger.info('[Setup Test Agent] Starting setup');

    const vapiService = createVapiService();
    const twilioService = createTwilioService();

    if (!vapiService.isEnabled()) {
      return {
        success: false,
        message: 'Vapi not configured. Check VAPI_API_KEY in .env.local',
      };
    }

    if (!twilioService.isEnabled()) {
      return {
        success: false,
        message: 'Twilio not configured. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local',
      };
    }

    // STEP 1: Create Assistants in Vapi first (required for squads)
    // Note: Use consistent naming prefix for organization in Vapi dashboard
    logger.info('[Setup Test Agent] Creating assistants in Vapi');

    const organizationPrefix = 'Test: Parlae';

    // Create Receptionist Assistant
    const receptionistAssistant = await vapiService.createAssistant({
      name: `${organizationPrefix} - Receptionist`,
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - professional voice
      },
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: `You are a friendly receptionist for Parlae. Your role is to:
1. Greet the caller warmly
2. Ask how you can help them today
3. If they want to book an appointment, transfer them to the Booking Assistant
4. If they have questions, answer them briefly

Keep responses short and friendly.`,
        temperature: 0.7,
        maxTokens: 300,
      },
      firstMessage: 'Thank you for calling Parlae! How can I help you today?',
      firstMessageMode: 'assistant-speaks-first',
      recordingEnabled: true,
      serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_SERVER_SECRET,
    });

    if (!receptionistAssistant) {
      return {
        success: false,
        message: 'Failed to create receptionist assistant in Vapi',
      };
    }

    logger.info({
      assistantId: receptionistAssistant.id,
      assistantName: receptionistAssistant.name,
    }, '[Setup Test Agent] Receptionist assistant created');

    // Create Booking Assistant
    const bookingAssistant = await vapiService.createAssistant({
      name: `${organizationPrefix} - Booking Agent`,
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - professional voice
      },
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: `You are a booking specialist for Parlae. Your role is to:
1. Confirm the customer's name, phone, and email
2. Ask what type of service they need
3. Offer available appointment times (example: "We have Tuesday at 2pm or Thursday at 10am")
4. Confirm the booking details

Be professional and efficient. Collect: name, phone, email, service type, preferred date/time.`,
        temperature: 0.7,
        maxTokens: 400,
      },
      firstMessage: 'Great! I can help you schedule an appointment. Can I get your name please?',
      firstMessageMode: 'assistant-speaks-first',
      recordingEnabled: true,
      serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_SERVER_SECRET,
    });

    if (!bookingAssistant) {
      // Cleanup: Delete the receptionist assistant
      await vapiService.deleteAssistant(receptionistAssistant.id);
      
      return {
        success: false,
        message: 'Failed to create booking assistant in Vapi',
      };
    }

    logger.info({
      assistantId: bookingAssistant.id,
      assistantName: bookingAssistant.name,
    }, '[Setup Test Agent] Booking assistant created');

    // STEP 2: Create Squad with Assistant IDs
    logger.info('[Setup Test Agent] Creating squad with assistants');

    const squad = await vapiService.createSquad({
      name: `${organizationPrefix} - Squad`,
      members: [
        {
          // Member 1: Receptionist (by ID)
          assistantId: receptionistAssistant.id,  // Use assistantId, not assistant
          assistantDestinations: [
            {
              type: 'assistant',
              assistantName: `${organizationPrefix} - Booking Agent`,
              message: 'Let me transfer you to our booking team.',
              description: 'Transfer to booking when customer wants to schedule an appointment',
            },
          ],
        },
        {
          // Member 2: Booking Assistant (by ID)
          assistantId: bookingAssistant.id,  // Use assistantId, not assistant
        },
      ],
    });

    if (!squad) {
      // Cleanup: Delete both assistants
      await vapiService.deleteAssistant(receptionistAssistant.id);
      await vapiService.deleteAssistant(bookingAssistant.id);
      
      return {
        success: false,
        message: 'Failed to create squad in Vapi',
      };
    }

    logger.info({
      squadId: squad.id,
      squadName: squad.name,
      assistantIds: [receptionistAssistant.id, bookingAssistant.id],
    }, '[Setup Test Agent] Squad created');

    // STEP 2: Get or Purchase Twilio Phone Number
    logger.info('[Setup Test Agent] Checking for existing phone numbers');

    // First, try to use an existing phone number
    const existingNumbers = await twilioService.listNumbers();

    let purchasedNumber;
    let isNewPurchase = false; // Track if we purchased a new number

    if (existingNumbers.length > 0) {
      // Use the first available existing number
      purchasedNumber = existingNumbers[0];
      isNewPurchase = false;
      
      logger.info({
        phoneNumber: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid,
      }, '[Setup Test Agent] Using existing phone number');
    } else {
      // No existing numbers, so purchase a new one
      logger.info({ areaCode }, '[Setup Test Agent] No existing numbers found, searching for new number');

      const availableNumbers = await twilioService.searchAvailableNumbers(
        'US',
        'Local',
        {
          areaCode,
          smsEnabled: true,
          voiceEnabled: true,
          limit: 1,
        }
      );

      if (availableNumbers.length === 0) {
        // Cleanup: Delete the squad and assistants
        await vapiService.deleteSquad(squad.id);
        await vapiService.deleteAssistant(receptionistAssistant.id);
        await vapiService.deleteAssistant(bookingAssistant.id);
        
        return {
          success: false,
          message: `No available phone numbers in area code ${areaCode}. Try a different area code.`,
        };
      }

      logger.info({
        phoneNumber: availableNumbers[0].phoneNumber,
      }, '[Setup Test Agent] Purchasing phone number');

      const newNumber = await twilioService.purchaseNumber({
        phoneNumber: availableNumbers[0].phoneNumber,
        friendlyName: 'Parlae Test Squad',
      });

      if (!newNumber) {
        // Cleanup: Delete the squad and assistants
        await vapiService.deleteSquad(squad.id);
        await vapiService.deleteAssistant(receptionistAssistant.id);
        await vapiService.deleteAssistant(bookingAssistant.id);
        
        return {
          success: false,
          message: 'Failed to purchase phone number',
        };
      }

      purchasedNumber = newNumber;
      isNewPurchase = true;

      logger.info({
        phoneNumber: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid,
      }, '[Setup Test Agent] Phone number purchased');
    }

    // STEP 3: Link Phone to Vapi Squad (or update if exists)
    logger.info('[Setup Test Agent] Linking phone to squad');

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';

    // Check if phone already exists in Vapi
    const vapiPhoneNumbers = await vapiService.listPhoneNumbers();
    const existingVapiPhone = vapiPhoneNumbers.find(
      (p: any) => p.number === purchasedNumber.phoneNumber
    );

    let vapiPhone;

    if (existingVapiPhone) {
      // Phone exists, update it to point to the new squad
      logger.info({
        phoneNumberId: existingVapiPhone.id,
        phoneNumber: existingVapiPhone.number,
      }, '[Setup Test Agent] Phone already exists in Vapi, updating');

      vapiPhone = await vapiService.updatePhoneNumber(
        existingVapiPhone.id,
        squad.id,
        true // isSquad = true
      );
    } else {
      // Phone doesn't exist, import it
      logger.info('[Setup Test Agent] Importing new phone to Vapi');

      vapiPhone = await vapiService.importPhoneNumber(
        purchasedNumber.phoneNumber,
        twilioAccountSid,
        twilioAuthToken,
        squad.id,
        true // isSquad = true (it's a squad, not an assistant)
      );
    }

    if (!vapiPhone) {
      // Cleanup: Delete the squad, assistants, and release the number (only if newly purchased)
      await vapiService.deleteSquad(squad.id);
      await vapiService.deleteAssistant(receptionistAssistant.id);
      await vapiService.deleteAssistant(bookingAssistant.id);
      
      // Only release the phone number if we just purchased it
      // Don't release existing numbers!
      if (isNewPurchase) {
        await twilioService.releaseNumber(purchasedNumber.sid);
      }
      
      return {
        success: false,
        message: 'Failed to link phone to Vapi',
      };
    }

    logger.info({
      vapiPhoneId: vapiPhone.id,
    }, '[Setup Test Agent] Setup complete');

    // Return success with all details
    return {
      success: true,
      message: 'Test squad setup successfully!',
      squad: {
        id: squad.id,
        name: squad.name,
        vapiUrl: `https://dashboard.vapi.ai/squad/${squad.id}`,
      },
      assistants: [
        {
          id: receptionistAssistant.id,
          name: receptionistAssistant.name,
          vapiUrl: `https://dashboard.vapi.ai/assistant/${receptionistAssistant.id}`,
        },
        {
          id: bookingAssistant.id,
          name: bookingAssistant.name,
          vapiUrl: `https://dashboard.vapi.ai/assistant/${bookingAssistant.id}`,
        },
      ],
      phoneNumber: {
        number: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid,
        vapiPhoneId: vapiPhone.id,
        vapiPhoneUrl: `https://dashboard.vapi.ai/phone-number/${vapiPhone.id}`,
      },
      instructions: {
        call: `Call ${purchasedNumber.phoneNumber} from your phone`,
        testScript: [
          'Say: "Hi, I\'d like to book an appointment"',
          'Receptionist will transfer you to Booking Assistant',
          'Say: "My name is John Doe"',
          'Say: "My email is john@example.com"',
          'Say: "I need a consultation on Tuesday"',
          'AI should guide you through booking process'
        ],
        checkLogs: 'Watch your server terminal for webhook events and assistant transfers',
        vapiDashboard: 'Visit https://dashboard.vapi.ai/ to see call history and squad flow',
        organization: `All resources are named with prefix "${organizationPrefix}" for easy identification in Vapi dashboard`,
      }
    };

  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Setup Test Agent] Exception during setup');

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Setup failed',
    };
  }
}
