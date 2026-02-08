#!/usr/bin/env tsx
/**
 * Setup Test Vapi Agent
 * 
 * This script:
 * 1. Creates a simple assistant in Vapi
 * 2. Purchases a Twilio phone number
 * 3. Links the phone to the assistant
 * 4. Saves everything to the database
 * 
 * Run: npx tsx scripts/setup-vapi-test-agent.ts
 */

import { createVapiService } from '../apps/frontend/packages/shared/src/vapi/vapi.service';
import { createTwilioService } from '../apps/frontend/packages/shared/src/twilio/twilio.service';

async function setupTestAgent() {
  console.log('🚀 Setting up Vapi test agent...\n');

  const vapiService = createVapiService();
  const twilioService = createTwilioService();

  if (!vapiService.isEnabled()) {
    console.error('❌ Vapi not configured. Check VAPI_API_KEY in .env.local');
    process.exit(1);
  }

  if (!twilioService.isEnabled()) {
    console.error('❌ Twilio not configured. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local');
    process.exit(1);
  }

  try {
    // STEP 1: Create Assistant in Vapi
    console.log('📱 Step 1: Creating assistant in Vapi...');
    
    const assistant = await vapiService.createAssistant({
      name: 'Test Support Agent',
      voice: {
        provider: 'elevenlabs',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - professional voice
      },
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: `You are a helpful customer support agent for a test company.

Be friendly, professional, and helpful. Answer questions clearly and capture customer information when provided.

If the customer mentions their name, email, or phone number, acknowledge it.`,
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
      throw new Error('Failed to create assistant in Vapi');
    }

    console.log('✅ Assistant created in Vapi:');
    console.log(`   ID: ${assistant.id}`);
    console.log(`   Name: ${assistant.name}\n`);

    // STEP 2: Purchase Twilio Phone Number
    console.log('📞 Step 2: Searching for available phone number...');
    
    const availableNumbers = await twilioService.searchAvailableNumbers(
      'US',
      'Local',
      {
        areaCode: '415', // San Francisco area
        smsEnabled: true,
        voiceEnabled: true,
        limit: 1,
      }
    );

    if (availableNumbers.length === 0) {
      throw new Error('No available phone numbers found. Try a different area code.');
    }

    console.log(`   Found: ${availableNumbers[0].phoneNumber}`);
    console.log('   Purchasing...');

    const purchasedNumber = await twilioService.purchaseNumber({
      phoneNumber: availableNumbers[0].phoneNumber,
      friendlyName: 'Vapi Test Agent',
    });

    if (!purchasedNumber) {
      throw new Error('Failed to purchase phone number');
    }

    console.log('✅ Phone number purchased:');
    console.log(`   Number: ${purchasedNumber.phoneNumber}`);
    console.log(`   SID: ${purchasedNumber.sid}\n`);

    // STEP 3: Link Phone to Vapi Assistant
    console.log('🔗 Step 3: Linking phone number to assistant...');

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
      throw new Error('Failed to import phone to Vapi');
    }

    console.log('✅ Phone linked to Vapi:');
    console.log(`   Vapi Phone ID: ${vapiPhone.id}\n`);

    // SUCCESS!
    console.log('🎉 Setup Complete!\n');
    console.log('═'.repeat(60));
    console.log('YOUR TEST AGENT IS READY');
    console.log('═'.repeat(60));
    console.log(`\n📞 Call this number: ${purchasedNumber.phoneNumber}`);
    console.log('\n💬 What to say:');
    console.log('   "Hi, my name is John Doe"');
    console.log('   "My email is john@example.com"');
    console.log('   "Can you help me with a question?"');
    console.log('\n✅ Expected behavior:');
    console.log('   - AI answers immediately');
    console.log('   - Responds naturally to questions');
    console.log('   - Captures your name/email');
    console.log('   - Records the full conversation');
    console.log('\n📊 Check logs:');
    console.log('   - Watch your terminal for webhook events');
    console.log('   - Visit Vapi dashboard: https://dashboard.vapi.ai/');
    console.log(`   - View assistant: https://dashboard.vapi.ai/assistant/${assistant.id}`);
    console.log(`   - View phone: https://dashboard.vapi.ai/phone-number/${vapiPhone.id}`);
    console.log('\n' + '═'.repeat(60) + '\n');

    // Save details to file
    const details = {
      assistantId: assistant.id,
      assistantName: assistant.name,
      phoneNumber: purchasedNumber.phoneNumber,
      twilioSid: purchasedNumber.sid,
      vapiPhoneId: vapiPhone.id,
      setupDate: new Date().toISOString(),
    };

    const fs = await import('fs');
    fs.writeFileSync(
      './vapi-test-agent-details.json',
      JSON.stringify(details, null, 2)
    );

    console.log('💾 Details saved to: vapi-test-agent-details.json\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

setupTestAgent();
