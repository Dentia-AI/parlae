import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getLogger } from '@kit/shared/logger';
import twilio from 'twilio';

/**
 * Vapi Tool: Transfer to Human
 * 
 * This endpoint is called by Vapi when the AI assistant needs to transfer
 * a call to a human staff member (usually for emergencies)
 */
export async function POST(request: Request) {
  const logger = await getLogger();
  
  try {
    const payload = await request.json();
    
    // Verify webhook signature
    const signature = request.headers.get('x-vapi-signature');
    if (signature !== process.env.VAPI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { call, message } = payload;
    
    logger.info({
      callId: call.id,
      phoneNumberId: call.phoneNumberId
    }, '[Transfer Tool] Transfer to human requested');

    // Get clinic and phone configuration
    const supabase = getSupabaseServerClient();
    
    const { data: phoneRecord, error } = await supabase
      .from('vapi_phone_numbers')
      .select('*, account:accounts(*)')
      .eq('vapi_phone_id', call.phoneNumberId)
      .single();

    if (error || !phoneRecord) {
      logger.error({ error, phoneNumberId: call.phoneNumberId }, 
        '[Transfer Tool] Phone record not found');
      
      return NextResponse.json({
        error: 'Configuration not found',
        message: 'I apologize, but I\'m unable to transfer you right now. Please call our main office line.'
      });
    }

    // Check if transfer is enabled and staff number is configured
    if (!phoneRecord.transfer_enabled || !phoneRecord.staff_forward_number) {
      logger.warn({
        clinicId: phoneRecord.account_id,
        transferEnabled: phoneRecord.transfer_enabled,
        hasStaffNumber: !!phoneRecord.staff_forward_number
      }, '[Transfer Tool] Transfer not available');
      
      return NextResponse.json({
        error: 'Transfer not configured',
        message: 'I apologize, but live assistance is not available right now. I can take a detailed message and have someone call you back within the hour.'
      });
    }

    // Get function call parameters
    const functionCall = message.functionCall;
    const reason = functionCall.parameters.reason || 'emergency';
    const summary = functionCall.parameters.summary || 'Patient requested transfer';
    const patientInfo = functionCall.parameters.patientInfo || {};

    // Log the transfer request
    await supabase
      .from('vapi_call_logs')
      .update({
        transfer_requested: true,
        transfer_reason: reason,
        transfer_summary: summary,
        updated_at: new Date().toISOString()
      })
      .eq('call_id', call.id);

    // Alert staff via SMS (optional but recommended)
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      
      await twilioClient.messages.create({
        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
        to: phoneRecord.staff_forward_number,
        body: `URGENT: Call transfer incoming from ${phoneRecord.account?.name}\nReason: ${reason}\nSummary: ${summary}\nPatient: ${patientInfo.name || 'Unknown'}`
      });
    }

    logger.info({
      clinicId: phoneRecord.account_id,
      transferTo: phoneRecord.staff_forward_number,
      reason
    }, '[Transfer Tool] Initiating transfer');

    // Return transfer instructions to Vapi
    // Vapi will use the 'transferTo' to forward the call
    return NextResponse.json({
      result: {
        success: true,
        action: 'transfer',
        transferTo: phoneRecord.staff_forward_number,
        message: 'Transferring you to our staff now. Please hold.',
        summary: summary,
        patientInfo: patientInfo
      }
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error
    }, '[Transfer Tool] Exception');

    return NextResponse.json({
      error: 'Transfer failed',
      message: 'I apologize, but I\'m having trouble with the transfer. Let me take your information and have someone call you right back.'
    });
  }
}

/**
 * Check availability settings
 */
async function checkAvailabilitySettings(
  accountId: string,
  settings: any,
  supabase: any
) {
  const now = new Date();
  const mode = settings?.mode || 'always';
  
  switch (mode) {
    case 'always':
      return { available: true, reason: 'always-on' };
      
    case 'disabled':
      return { available: false, reason: 'disabled' };
      
    case 'after-hours-only':
      const isAfterHours = !isWithinBusinessHours(now, settings.afterHours);
      return {
        available: isAfterHours,
        reason: isAfterHours ? 'after-hours' : 'business-hours'
      };
      
    case 'overflow-only':
      const activeCallsCount = await getActiveCallsCount(accountId, supabase);
      const threshold = settings.highVolume?.threshold || 5;
      const isOverThreshold = activeCallsCount >= threshold;
      
      return {
        available: isOverThreshold,
        reason: isOverThreshold ? 'overflow' : 'under-capacity'
      };
      
    default:
      return { available: true, reason: 'default' };
  }
}

function isWithinBusinessHours(now: Date, afterHoursSettings: any): boolean {
  if (!afterHoursSettings?.enabled) return true;
  
  const businessHours = afterHoursSettings.businessHours;
  const timezone = businessHours?.timezone || 'America/Toronto';
  
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][localTime.getDay()];
  const currentTime = localTime.toTimeString().slice(0, 5);
  
  const daySchedule = businessHours?.schedule?.[dayOfWeek];
  
  if (!daySchedule) return false;
  
  return currentTime >= daySchedule.open && currentTime < daySchedule.close;
}

async function getActiveCallsCount(accountId: string, supabase: any): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const { count } = await supabase
    .from('vapi_call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'in-progress')
    .gte('created_at', oneHourAgo.toISOString());
  
  return count || 0;
}

function routeToFallback(clinic: any, reason: string) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  const fallback = clinic.account?.ai_availability_settings?.fallback || { type: 'voicemail' };
  
  switch (fallback.type) {
    case 'voicemail':
      const greeting = fallback.voicemailGreeting || 
        `Thank you for calling. Please leave a message after the beep.`;
      
      twiml.say(greeting);
      twiml.record({
        maxLength: 180,
        recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/twilio/voicemail`
      });
      break;
      
    case 'forward':
      if (fallback.forwardNumber) {
        twiml.say('Please hold.');
        twiml.dial(fallback.forwardNumber);
      } else {
        twiml.say('We\'re unable to take your call. Please try again later.');
        twiml.hangup();
      }
      break;
      
    default:
      twiml.say('We\'re unable to take your call. Please try again later.');
      twiml.hangup();
  }
  
  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'application/xml' }
  });
}

function connectToVapi(clinic: any, from: string, callSid: string) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  
  const dial = twiml.dial({ answerOnBridge: true });
  
  dial.sip({
    uri: `sip:${clinic.vapi_phone_id}@sip.vapi.ai`,
    username: clinic.vapi_phone_id,
    password: process.env.VAPI_API_KEY
  });
  
  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'application/xml' }
  });
}
