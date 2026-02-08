import { NextResponse } from 'next/server';
import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/vapi/setup-test-agent
 * 
 * One-time setup: Creates a test assistant in Vapi, purchases a Twilio number,
 * and links them together.
 * 
 * Body (optional):
 * {
 *   areaCode?: string  // Default: '415'
 *   assistantName?: string  // Default: 'Test Support Agent'
 * }
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    const body = await request.json().catch(() => ({}));
    const { areaCode = '415', assistantName = 'Test Support Agent' } = body;

    logger.info('[Setup Test Agent] Starting setup');

    const vapiService = createVapiService();
    const twilioService = createTwilioService();

    if (!vapiService.isEnabled()) {
      return NextResponse.json(
        { success: false, message: 'Vapi not configured. Check VAPI_API_KEY.' },
        { status: 500 }
      );
    }

    if (!twilioService.isEnabled()) {
      return NextResponse.json(
        { success: false, message: 'Twilio not configured. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' },
        { status: 500 }
      );
    }

    // STEP 1: Create Assistant in Vapi
    logger.info('[Setup Test Agent] Creating assistant in Vapi');

    const assistant = await vapiService.createAssistant({
      name: assistantName,
      voice: {
        provider: 'elevenlabs',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - professional voice
      },
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: `You are a helpful customer support agent for a test company.

Be friendly, professional, and helpful. Answer questions clearly and capture customer information when provided.

If the customer mentions their name, email, or phone number, acknowledge it and thank them.

Example conversation:
Customer: "Hi, my name is John Doe"
You: "Thank you, John! How can I help you today?"

Customer: "My email is john@example.com"
You: "Got it, john@example.com. What can I assist you with?"`,
        temperature: 0.7,
        maxTokens: 500,
      },
      firstMessage: 'Thank you for calling! This is a test. How can I help you today?',
      firstMessageMode: 'assistant-speaks-first',
      recordingEnabled: true,
      serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_SERVER_SECRET,
      analysisSchema: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          phoneNumber: { type: 'string' },
          email: { type: 'string' },
          reason: { type: 'string' },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
        },
      },
    });

    if (!assistant) {
      return NextResponse.json(
        { success: false, message: 'Failed to create assistant in Vapi' },
        { status: 500 }
      );
    }

    logger.info({
      assistantId: assistant.id,
      assistantName: assistant.name,
    }, '[Setup Test Agent] Assistant created');

    // STEP 2: Purchase Twilio Phone Number
    logger.info({ areaCode }, '[Setup Test Agent] Searching for phone number');

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
      // Cleanup: Delete the assistant
      await vapiService.deleteAssistant(assistant.id);
      
      return NextResponse.json(
        { success: false, message: `No available phone numbers in area code ${areaCode}. Try a different area code.` },
        { status: 500 }
      );
    }

    logger.info({
      phoneNumber: availableNumbers[0].phoneNumber,
    }, '[Setup Test Agent] Purchasing phone number');

    const purchasedNumber = await twilioService.purchaseNumber({
      phoneNumber: availableNumbers[0].phoneNumber,
      friendlyName: 'Vapi Test Agent',
    });

    if (!purchasedNumber) {
      // Cleanup: Delete the assistant
      await vapiService.deleteAssistant(assistant.id);
      
      return NextResponse.json(
        { success: false, message: 'Failed to purchase phone number' },
        { status: 500 }
      );
    }

    logger.info({
      phoneNumber: purchasedNumber.phoneNumber,
      sid: purchasedNumber.sid,
    }, '[Setup Test Agent] Phone number purchased');

    // STEP 3: Link Phone to Vapi Assistant
    logger.info('[Setup Test Agent] Linking phone to assistant');

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';

    const vapiPhone = await vapiService.importPhoneNumber(
      purchasedNumber.phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      assistant.id,
      false // isSquad = false (it's an assistant)
    );

    if (!vapiPhone) {
      // Cleanup: Delete the assistant and release the number
      await vapiService.deleteAssistant(assistant.id);
      await twilioService.releaseNumber(purchasedNumber.sid);
      
      return NextResponse.json(
        { success: false, message: 'Failed to import phone to Vapi' },
        { status: 500 }
      );
    }

    logger.info({
      vapiPhoneId: vapiPhone.id,
    }, '[Setup Test Agent] Setup complete');

    // Return success with all details
    return NextResponse.json({
      success: true,
      message: 'Test agent setup successfully!',
      assistant: {
        id: assistant.id,
        name: assistant.name,
        vapiUrl: `https://dashboard.vapi.ai/assistant/${assistant.id}`,
      },
      phoneNumber: {
        number: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid,
        vapiPhoneId: vapiPhone.id,
        vapiPhoneUrl: `https://dashboard.vapi.ai/phone-number/${vapiPhone.id}`,
      },
      instructions: {
        call: `Call ${purchasedNumber.phoneNumber} from your phone`,
        testScript: [
          'Say: "Hi, my name is John Doe"',
          'Say: "My email is john@example.com"',
          'Say: "Can you help me with a question?"',
          'AI should respond naturally and acknowledge your info'
        ],
        checkLogs: 'Watch your server terminal for webhook events',
        vapiDashboard: 'Visit https://dashboard.vapi.ai/ to see call history',
      }
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Setup Test Agent] Exception during setup');

    return NextResponse.json(
      { success: false, message: 'Setup failed', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
