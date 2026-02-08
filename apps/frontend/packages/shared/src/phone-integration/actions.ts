'use server';

import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getLogger } from '@kit/shared/logger';

/**
 * Setup call forwarding integration
 * Purchases a Twilio number for the clinic to forward calls to
 */
export async function setupForwardingIntegration(data: {
  accountId: string;
  originalPhoneNumber: string;
  areaCode: string;
  staffForwardNumber?: string;
}) {
  const logger = await getLogger();
  const supabase = getSupabaseServerClient();

  try {
    logger.info({
      accountId: data.accountId,
      method: 'forwarding'
    }, '[Phone Integration] Starting forwarding setup');

    const twilioService = createTwilioService();

    if (!twilioService.isEnabled()) {
      return {
        success: false,
        error: 'Twilio not configured'
      };
    }

    // 1. Purchase Twilio number in requested area code
    const availableNumbers = await twilioService.searchAvailableNumbers(
      'CA', // Canada
      'Local',
      {
        areaCode: data.areaCode,
        smsEnabled: true,
        voiceEnabled: true,
        limit: 5
      }
    );

    if (availableNumbers.length === 0) {
      return {
        success: false,
        error: `No available numbers in area code ${data.areaCode}`
      };
    }

    const purchasedNumber = await twilioService.purchaseNumber({
      phoneNumber: availableNumbers[0].phoneNumber,
      friendlyName: `AI Forwarding - Account ${data.accountId}`
    });

    if (!purchasedNumber) {
      return {
        success: false,
        error: 'Failed to purchase phone number'
      };
    }

    // 2. Configure Twilio webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/twilio/voice`;
    
    await twilioService.updateNumberWebhook(
      purchasedNumber.sid,
      webhookUrl,
      'POST'
    );

    // 3. Update account integration method
    await supabase
      .from('accounts')
      .update({
        phone_integration_method: 'pending', // Will be 'forwarded' once verified
        phone_integration_settings: {
          twilioNumberSid: purchasedNumber.sid,
          setupDate: new Date().toISOString()
        }
      })
      .eq('id', data.accountId);

    // 4. Create phone number record
    await supabase
      .from('vapi_phone_numbers')
      .insert({
        account_id: data.accountId,
        integration_method: 'forwarded',
        original_phone_number: data.originalPhoneNumber,
        twilio_number: purchasedNumber.phoneNumber,
        staff_forward_number: data.staffForwardNumber,
        transfer_enabled: !!data.staffForwardNumber,
        integration_status: 'pending',
        friendly_name: `${data.accountId} - Forwarding Number`
      });

    logger.info({
      accountId: data.accountId,
      twilioNumber: purchasedNumber.phoneNumber
    }, '[Phone Integration] Forwarding setup complete');

    return {
      success: true,
      twilioNumber: purchasedNumber.phoneNumber,
      instructions: {
        step1: `Call your phone provider (current carrier of ${data.originalPhoneNumber})`,
        step2: `Set up call forwarding to: ${purchasedNumber.phoneNumber}`,
        step3: 'Choose "Always Forward" or "Forward When Busy"',
        step4: `Test by calling ${data.originalPhoneNumber}`
      }
    };

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      accountId: data.accountId
    }, '[Phone Integration] Forwarding setup failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Setup failed'
    };
  }
}

/**
 * Setup SIP trunk integration
 * Generates SIP URI for clinic's PBX
 */
export async function setupSIPIntegration(data: {
  accountId: string;
  accountSlug: string;
  originalPhoneNumber: string;
  staffForwardNumber?: string;
  pbxType?: string; // 'ringcentral' | '3cx' | 'mitel' | 'other'
}) {
  const logger = await getLogger();
  const supabase = getSupabaseServerClient();

  try {
    logger.info({
      accountId: data.accountId,
      method: 'sip'
    }, '[Phone Integration] Starting SIP setup');

    // Generate SIP URI (no API call needed!)
    const sipUri = `${data.accountSlug}@parlae.sip.twilio.com`;

    // Optional: Generate SIP credentials for authentication
    const sipCredentials = {
      username: data.accountSlug,
      password: generateSecurePassword(32)
    };

    // Update account
    await supabase
      .from('accounts')
      .update({
        phone_integration_method: 'pending',
        phone_integration_settings: {
          sipUri,
          sipUsername: sipCredentials.username,
          sipPassword: sipCredentials.password, // Should be encrypted
          pbxType: data.pbxType,
          setupDate: new Date().toISOString()
        }
      })
      .eq('id', data.accountId);

    // Create phone number record
    await supabase
      .from('vapi_phone_numbers')
      .insert({
        account_id: data.accountId,
        integration_method: 'sip',
        original_phone_number: data.originalPhoneNumber,
        sip_uri: sipUri,
        staff_forward_number: data.staffForwardNumber,
        transfer_enabled: !!data.staffForwardNumber,
        integration_status: 'pending',
        friendly_name: `${data.accountId} - SIP Integration`
      });

    logger.info({
      accountId: data.accountId,
      sipUri
    }, '[Phone Integration] SIP setup complete');

    // Return PBX-specific instructions
    const instructions = getPBXInstructions(data.pbxType || 'other', sipUri, sipCredentials);

    return {
      success: true,
      sipUri,
      credentials: sipCredentials,
      instructions
    };

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      accountId: data.accountId
    }, '[Phone Integration] SIP setup failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Setup failed'
    };
  }
}

/**
 * Get PBX-specific setup instructions
 */
function getPBXInstructions(pbxType: string, sipUri: string, credentials: any) {
  const baseInstructions = {
    sipUri,
    host: 'parlae.sip.twilio.com',
    username: credentials.username,
    password: credentials.password
  };

  const instructions: Record<string, any> = {
    ringcentral: {
      ...baseInstructions,
      steps: [
        'Go to RingCentral Admin Portal',
        'Navigate to: Phone System → Auto-Receptionist',
        'Click "Add External Number"',
        `Enter: ${sipUri}`,
        'Set routing: After Hours → AI Receptionist',
        'Save and test'
      ],
      videoUrl: '/guides/ringcentral-setup.mp4'
    },
    '3cx': {
      ...baseInstructions,
      steps: [
        'Open 3CX Management Console',
        'Go to: Trunks → Add SIP Trunk',
        `Host: parlae.sip.twilio.com`,
        `Username: ${credentials.username}`,
        `Password: ${credentials.password}`,
        'Create inbound rule for AI routing',
        'Test connection'
      ],
      videoUrl: '/guides/3cx-setup.mp4'
    },
    other: {
      ...baseInstructions,
      steps: [
        'Log into your phone system admin panel',
        'Add a new SIP trunk or external destination',
        `SIP URI: ${sipUri}`,
        `Host: parlae.sip.twilio.com`,
        `Username: ${credentials.username}`,
        `Password: ${credentials.password}`,
        'Configure routing rules (after-hours, overflow, etc.)',
        'Test by making a call'
      ]
    }
  };

  return instructions[pbxType] || instructions.other;
}

/**
 * Update availability settings
 */
export async function updateAvailabilitySettings(
  accountId: string,
  settings: {
    mode: string;
    afterHours?: any;
    highVolume?: any;
    customSchedule?: any;
    fallback?: any;
  }
) {
  const logger = await getLogger();
  const supabase = getSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from('accounts')
      .update({
        ai_availability_settings: settings
      })
      .eq('id', accountId)
      .select()
      .single();

    if (error) throw error;

    logger.info({
      accountId,
      mode: settings.mode
    }, '[Phone Integration] Availability settings updated');

    return { success: true, settings: data.ai_availability_settings };

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      accountId
    }, '[Phone Integration] Failed to update availability settings');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Update failed'
    };
  }
}

/**
 * Test phone integration
 */
export async function testPhoneIntegration(accountId: string) {
  const logger = await getLogger();
  const supabase = getSupabaseServerClient();

  try {
    // Get phone integration details
    const { data: phoneRecord } = await supabase
      .from('vapi_phone_numbers')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (!phoneRecord) {
      return {
        success: false,
        error: 'Phone number not configured'
      };
    }

    // Make a test call via Vapi
    const vapiService = createVapiService();
    
    const testCall = await vapiService.createCall({
      phoneNumberId: phoneRecord.vapi_phone_id,
      customer: {
        number: process.env.TEST_PHONE_NUMBER || '+16475550000'
      }
    });

    return {
      success: true,
      callId: testCall?.id,
      message: 'Test call initiated. Check your phone!'
    };

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      accountId
    }, '[Phone Integration] Test failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Test failed'
    };
  }
}

/**
 * Helper: Generate secure password
 */
function generateSecurePassword(length: number = 32): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  return password;
}
