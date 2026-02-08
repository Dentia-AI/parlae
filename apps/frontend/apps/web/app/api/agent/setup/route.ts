import { NextResponse } from 'next/server';
import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/agent/setup
 * 
 * Complete automated AI agent setup:
 * 1. Purchase Twilio phone number
 * 2. Create Vapi AI assistant
 * 3. Link phone number to assistant
 * 4. Sync contact to GHL CRM
 * 
 * Body:
 * {
 *   customerName: string
 *   customerEmail: string
 *   agentName: string
 *   agentType: string
 *   voiceId: string
 *   systemPrompt: string
 *   knowledgeBase?: string
 *   areaCode?: string
 *   twilioSubAccountSid?: string
 *   ghlSubAccountId: string
 * }
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    const body = await request.json();
    const {
      customerName,
      customerEmail,
      agentName,
      agentType,
      voiceId,
      systemPrompt,
      knowledgeBase,
      areaCode,
      twilioSubAccountSid,
      ghlSubAccountId,
    } = body;

    // Validate required fields
    if (!customerName || !customerEmail || !agentName || !voiceId || !systemPrompt) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    logger.info({
      customerName,
      agentName,
      agentType,
    }, '[Agent Setup] Starting automated setup');

    const twilioService = createTwilioService();
    const vapiService = createVapiService();
    const ghlService = createGoHighLevelService();

    // Check services are enabled
    if (!twilioService.isEnabled()) {
      return NextResponse.json(
        {
          success: false,
          message: 'Twilio integration not configured',
        },
        { status: 500 }
      );
    }

    if (!vapiService.isEnabled()) {
      return NextResponse.json(
        {
          success: false,
          message: 'Vapi integration not configured',
        },
        { status: 500 }
      );
    }

    // STEP 1: Search for available phone number
    logger.info({ areaCode }, '[Agent Setup] Step 1: Searching for phone number');
    
    const availableNumbers = await twilioService.searchAvailableNumbers(
      'US',
      'Local',
      {
        areaCode,
        smsEnabled: true,
        voiceEnabled: true,
        limit: 1,
        excludeAllAddressRequired: true,
      }
    );

    if (availableNumbers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'No available phone numbers found',
        },
        { status: 500 }
      );
    }

    const selectedNumber = availableNumbers[0];
    logger.info({ phoneNumber: selectedNumber.phoneNumber }, '[Agent Setup] Found available number');

    // STEP 2: Purchase phone number
    logger.info({ phoneNumber: selectedNumber.phoneNumber }, '[Agent Setup] Step 2: Purchasing phone number');
    
    const purchasedNumber = await twilioService.purchaseNumber(
      {
        phoneNumber: selectedNumber.phoneNumber,
        friendlyName: `${agentName} - ${customerName}`,
      },
      twilioSubAccountSid
    );

    if (!purchasedNumber) {
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to purchase phone number',
        },
        { status: 500 }
      );
    }

    logger.info({
      phoneNumber: purchasedNumber.phoneNumber,
      sid: purchasedNumber.sid,
    }, '[Agent Setup] Phone number purchased');

    // STEP 3: Create Vapi AI assistant
    logger.info({ agentName }, '[Agent Setup] Step 3: Creating Vapi assistant');
    
    const assistant = await vapiService.createAssistant({
      name: agentName,
      voice: {
        provider: 'elevenlabs',
        voiceId: voiceId,
      },
      model: {
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: systemPrompt + (knowledgeBase ? `\n\nKnowledge Base:\n${knowledgeBase}` : ''),
        temperature: 0.7,
        maxTokens: 500,
      },
      firstMessage: `Thank you for calling ${customerName}! How can I help you today?`,
      analysisSchema: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          phoneNumber: { type: 'string' },
          email: { type: 'string' },
          appointmentRequested: { type: 'boolean' },
          reasonForCall: { type: 'string' },
          sentiment: {
            type: 'string',
            enum: ['positive', 'neutral', 'negative'],
          },
          needsFollowup: { type: 'boolean' },
        },
      },
      endCallFunctionEnabled: true,
      recordingEnabled: true,
      serverUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_SERVER_SECRET,
    });

    if (!assistant) {
      // Cleanup: Release the phone number
      await twilioService.releaseNumber(purchasedNumber.sid, twilioSubAccountSid);
      
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to create Vapi assistant',
        },
        { status: 500 }
      );
    }

    logger.info({
      assistantId: assistant.id,
      assistantName: assistant.name,
    }, '[Agent Setup] Vapi assistant created');

    // STEP 4: Link phone number to Vapi assistant
    logger.info(
      { phoneNumber: purchasedNumber.phoneNumber, assistantId: assistant.id },
      '[Agent Setup] Step 4: Linking phone to assistant'
    );

    const twilioAccountSid = twilioSubAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';

    const vapiPhoneNumber = await vapiService.importPhoneNumber(
      purchasedNumber.phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      assistant.id
    );

    if (!vapiPhoneNumber) {
      // Cleanup: Delete assistant and release number
      await vapiService.deleteAssistant(assistant.id);
      await twilioService.releaseNumber(purchasedNumber.sid, twilioSubAccountSid);
      
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to link phone number to assistant',
        },
        { status: 500 }
      );
    }

    logger.info({
      vapiPhoneNumberId: vapiPhoneNumber.id,
    }, '[Agent Setup] Phone number linked to assistant');

    // STEP 5: Sync contact to GHL CRM (optional, if GHL is enabled)
    if (ghlService.isEnabled()) {
      logger.info({ customerEmail }, '[Agent Setup] Step 5: Syncing to GHL CRM');
      
      await ghlService.upsertContact({
        email: customerEmail,
        name: customerName,
        tags: ['ai-agent-customer', agentType],
        customFields: {
          'ai_agent_phone': purchasedNumber.phoneNumber,
          'ai_agent_id': assistant.id,
          'agent_type': agentType,
        },
        source: 'AI Agent Setup',
      });

      logger.info('[Agent Setup] Contact synced to GHL');
    }

    logger.info({
      assistantId: assistant.id,
      phoneNumber: purchasedNumber.phoneNumber,
    }, '[Agent Setup] Setup completed successfully');

    return NextResponse.json({
      success: true,
      agent: {
        id: assistant.id,
        name: agentName,
        phoneNumber: purchasedNumber.phoneNumber,
        vapiAssistantId: assistant.id,
        vapiPhoneNumberId: vapiPhoneNumber.id,
        twilioPhoneSid: purchasedNumber.sid,
      },
      message: 'AI agent setup completed successfully',
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Agent Setup] Exception during setup');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to setup agent',
      },
      { status: 500 }
    );
  }
}
