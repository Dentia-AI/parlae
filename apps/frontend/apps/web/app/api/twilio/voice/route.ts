import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getLogger } from '@kit/shared/logger';
import twilio from 'twilio';

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Twilio Voice Webhook
 * Handles ALL inbound calls (ported, forwarded, and SIP)
 */
export async function POST(request: Request) {
  const logger = await getLogger();
  
  try {
    const formData = await request.formData();
    
    const from = formData.get('From') as string; // Caller number
    const to = formData.get('To') as string; // Number called
    const callSid = formData.get('CallSid') as string;
    
    logger.info({
      from,
      to,
      callSid
    }, '[Twilio Voice] Inbound call received');

    const supabase = getSupabaseServerClient();

    // Identify clinic based on 'To' number
    const clinic = await identifyClinic(to, supabase);
    
    if (!clinic) {
      logger.error({ to, callSid }, '[Twilio Voice] Clinic not found');
      return createErrorResponse('Number not configured');
    }

    logger.info({
      clinicId: clinic.account_id,
      clinicName: clinic.account?.name,
      integrationMethod: clinic.integration_method
    }, '[Twilio Voice] Clinic identified');

    // Check if AI should answer based on availability settings
    const availability = await checkAvailabilitySettings(
      clinic.account_id,
      clinic.account?.ai_availability_settings,
      supabase
    );

    if (!availability.available) {
      logger.info({
        clinicId: clinic.account_id,
        reason: availability.reason,
        callSid
      }, '[Twilio Voice] AI not available - routing to fallback');
      
      return routeToFallback(clinic, availability.reason);
    }

    // AI is available - connect to Vapi
    logger.info({
      clinicId: clinic.account_id,
      vapiSquadId: clinic.vapi_squad_id,
      callSid
    }, '[Twilio Voice] Connecting to Vapi');

    return connectToVapi(clinic, from, callSid);

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error
    }, '[Twilio Voice] Exception in webhook');

    return createErrorResponse('Internal error');
  }
}

/**
 * Identify clinic from 'To' number
 * Handles all three integration methods
 */
async function identifyClinic(to: string, supabase: any) {
  // Try SIP URI format first (e.g., "clinic-slug@parlae.sip.twilio.com")
  if (to.includes('@')) {
    const slug = to.split('@')[0];
    
    const { data } = await supabase
      .from('vapi_phone_numbers')
      .select('*, account:accounts(*)')
      .eq('sip_uri', to)
      .single();
    
    if (data) return data;
    
    // Also try by account slug
    const { data: bySlug } = await supabase
      .from('vapi_phone_numbers')
      .select('*, account:accounts(*)')
      .eq('account.slug', slug)
      .single();
    
    if (bySlug) return bySlug;
  }
  
  // Try ported or forwarding number
  const { data } = await supabase
    .from('vapi_phone_numbers')
    .select('*, account:accounts(*)')
    .or(`twilio_number.eq.${to},original_phone_number.eq.${to}`)
    .single();
  
  return data;
}

/**
 * Check if AI should answer based on availability settings
 */
async function checkAvailabilitySettings(
  accountId: string,
  settings: any,
  supabase: any
) {
  const now = new Date();
  
  // Parse settings
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
        reason: isOverThreshold ? 'overflow' : 'under-capacity',
        activeCallsCount,
        threshold
      };
      
    case 'scheduled':
      const isScheduled = checkCustomSchedule(now, settings.customSchedule?.rules || []);
      return {
        available: isScheduled,
        reason: isScheduled ? 'scheduled-on' : 'scheduled-off'
      };
      
    default:
      return { available: true, reason: 'default' };
  }
}

/**
 * Check if current time is within business hours
 */
function isWithinBusinessHours(now: Date, afterHoursSettings: any): boolean {
  if (!afterHoursSettings?.enabled) return true;
  
  const businessHours = afterHoursSettings.businessHours;
  const timezone = businessHours?.timezone || 'America/Toronto';
  
  // Convert to clinic timezone
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][localTime.getDay()];
  const currentTime = localTime.toTimeString().slice(0, 5); // "HH:MM"
  
  const daySchedule = businessHours?.schedule?.[dayOfWeek];
  
  if (!daySchedule) return false; // Closed this day
  
  return currentTime >= daySchedule.open && currentTime < daySchedule.close;
}

/**
 * Get active calls count for overflow detection
 */
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

/**
 * Check custom schedule rules
 */
function checkCustomSchedule(now: Date, rules: any[]): boolean {
  if (!rules || rules.length === 0) return true;
  
  const dayOfWeek = now.getDay();
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
  
  // Find applicable rule for current day
  const applicableRule = rules.find(rule => rule.dayOfWeek === dayOfWeek);
  
  if (!applicableRule) return false;
  
  const isInRange = currentTime >= applicableRule.startTime && 
                    currentTime < applicableRule.endTime;
  
  return applicableRule.action === 'enable' ? isInRange : !isInRange;
}

/**
 * Route to fallback when AI is not available
 */
function routeToFallback(clinic: any, reason: string) {
  const twiml = new VoiceResponse();
  const fallback = clinic.account?.ai_availability_settings?.fallback || { type: 'voicemail' };
  
  switch (fallback.type) {
    case 'voicemail':
      const greeting = fallback.voicemailGreeting || 
        `Thank you for calling ${clinic.account?.name}. We're unable to take your call right now. Please leave a message after the beep.`;
      
      twiml.say(greeting);
      twiml.record({
        maxLength: 180,
        recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/twilio/voicemail`,
        recordingStatusCallbackEvent: ['completed'],
        transcribe: true,
        transcribeCallback: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/twilio/voicemail-transcription`
      });
      break;
      
    case 'forward':
      if (fallback.forwardNumber) {
        twiml.say('Please hold while I connect you.');
        twiml.dial(fallback.forwardNumber);
      } else {
        twiml.say('We apologize, but we\'re unable to take your call right now. Please try again later.');
        twiml.hangup();
      }
      break;
      
    case 'busy-signal':
      twiml.say('We\'re unable to take your call right now. Please try again later.');
      twiml.hangup();
      break;
  }
  
  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'application/xml' }
  });
}

/**
 * Connect call to Vapi
 */
function connectToVapi(clinic: any, from: string, callSid: string) {
  const twiml = new VoiceResponse();
  
  // Use Vapi's Twilio integration
  // Connect via SIP to Vapi
  const dial = twiml.dial({
    answerOnBridge: true,
    action: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/twilio/call-complete`,
    method: 'POST'
  });
  
  // Connect to Vapi's SIP endpoint
  dial.sip({
    username: clinic.vapi_phone_id,
    password: process.env.VAPI_API_KEY,
    uri: `sip:${clinic.vapi_phone_id}@sip.vapi.ai`
  });
  
  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'application/xml' }
  });
}

/**
 * Error response helper
 */
function createErrorResponse(message: string) {
  const twiml = new VoiceResponse();
  twiml.say('We apologize, but we encountered an error. Please try calling again.');
  twiml.hangup();
  
  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'application/xml' }
  });
}
