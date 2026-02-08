import { NextResponse } from 'next/server';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/vapi/webhook
 * 
 * Receives webhooks from Vapi for call events:
 * - assistant-request: When a call starts
 * - status-update: Call status changes
 * - end-of-call-report: Full transcript, recording, extracted data
 * - function-call: When AI wants to execute a function
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    // Verify Vapi webhook signature
    const signature = request.headers.get('x-vapi-signature');
    const secret = process.env.VAPI_SERVER_SECRET;

    if (secret && signature) {
      // TODO: Implement signature verification
      // const body = await request.text();
      // const isValid = verifyVapiSignature(body, signature, secret);
      // if (!isValid) {
      //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      // }
    }

    const payload = await request.json();
    const { message } = payload;

    logger.info({
      messageType: message?.type,
      callId: message?.call?.id,
    }, '[Vapi Webhook] Received webhook');

    switch (message?.type) {
      case 'assistant-request':
        // Call is starting - return assistant config if needed
        return handleAssistantRequest(payload);

      case 'status-update':
        // Call status changed (e.g., answered, in-progress, ended)
        return handleStatusUpdate(payload);

      case 'end-of-call-report':
        // Call ended - receive transcript, recording, extracted data
        return handleEndOfCall(payload);

      case 'function-call':
        // AI wants to execute a function (e.g., book appointment)
        return handleFunctionCall(payload);

      default:
        logger.warn({
          messageType: message?.type,
        }, '[Vapi Webhook] Unknown message type');
        
        return NextResponse.json({ received: true });
    }
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Vapi Webhook] Exception handling webhook');

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle assistant request (call starting)
 */
async function handleAssistantRequest(payload: any) {
  const logger = await getLogger();
  
  const { call, phoneNumber } = payload.message;

  logger.info({
    callId: call?.id,
    from: call?.customer?.number,
    to: phoneNumber?.number,
  }, '[Vapi Webhook] Call starting');

  // You can dynamically configure the assistant here if needed
  // For now, just acknowledge
  return NextResponse.json({ received: true });
}

/**
 * Handle status update
 */
async function handleStatusUpdate(payload: any) {
  const logger = await getLogger();
  
  const { call, status } = payload.message;

  logger.info({
    callId: call?.id,
    status: status,
    from: call?.customer?.number,
  }, '[Vapi Webhook] Call status update');

  // TODO: Update call status in your database
  // await updateCallStatus(call.id, status);

  return NextResponse.json({ received: true });
}

/**
 * Handle end of call - receive transcript, recording, and extracted data
 */
async function handleEndOfCall(payload: any) {
  const logger = await getLogger();
  
  const { call, transcript, recordingUrl, analysis, summary } = payload.message;

  logger.info({
    callId: call?.id,
    duration: call?.duration,
    hasTranscript: !!transcript,
    hasRecording: !!recordingUrl,
    hasAnalysis: !!analysis,
  }, '[Vapi Webhook] Call ended');

  try {
    // Extract structured data from the call
    const extractedData = analysis || {};
    const customerName = extractedData.customerName;
    const customerEmail = extractedData.email;
    const customerPhone = call?.customer?.number;

    logger.info({
      callId: call?.id,
      extractedData,
      summary,
    }, '[Vapi Webhook] Call data extracted');

    // Sync to GHL CRM if we have contact info
    const ghlService = createGoHighLevelService();
    
    if (ghlService.isEnabled() && (customerEmail || customerPhone)) {
      logger.info({
        email: customerEmail,
        phone: customerPhone,
      }, '[Vapi Webhook] Syncing call data to GHL');

      await ghlService.upsertContact({
        email: customerEmail || `${customerPhone}@temp.local`,
        name: customerName,
        phone: customerPhone,
        tags: ['ai-agent-call', extractedData.sentiment || 'unknown'],
        customFields: {
          'last_call_date': new Date().toISOString(),
          'last_call_reason': extractedData.reasonForCall,
          'last_call_sentiment': extractedData.sentiment,
          'needs_followup': extractedData.needsFollowup ? 'yes' : 'no',
        },
        source: 'AI Agent Call',
      });

      logger.info('[Vapi Webhook] Contact synced to GHL');
    }

    // TODO: Save call data to your database
    // await saveCallData({
    //   callId: call.id,
    //   assistantId: call.assistantId,
    //   phoneNumber: call.phoneNumberId,
    //   customerPhone: customerPhone,
    //   customerName,
    //   customerEmail,
    //   duration: call.duration,
    //   transcript,
    //   recordingUrl,
    //   analysis: extractedData,
    //   summary,
    //   startedAt: call.startedAt,
    //   endedAt: call.endedAt,
    // });

    logger.info({
      callId: call?.id,
    }, '[Vapi Webhook] Call data processed successfully');

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      callId: call?.id,
    }, '[Vapi Webhook] Failed to process end-of-call data');

    return NextResponse.json({ error: 'Failed to process call data' }, { status: 500 });
  }
}

/**
 * Handle function call - AI wants to execute an action
 */
async function handleFunctionCall(payload: any) {
  const logger = await getLogger();
  
  const { call, functionCall } = payload.message;
  const { name, parameters } = functionCall || {};

  logger.info({
    callId: call?.id,
    functionName: name,
    parameters,
  }, '[Vapi Webhook] Function call requested');

  try {
    // Handle different function calls
    switch (name) {
      case 'bookAppointment':
        // TODO: Implement appointment booking
        const { date, time, service } = parameters;
        logger.info({
          date,
          time,
          service,
        }, '[Vapi Webhook] Booking appointment');
        
        // Return success response to Vapi
        return NextResponse.json({
          result: {
            success: true,
            message: `Appointment booked for ${date} at ${time}`,
            confirmationNumber: 'APT-' + Date.now(),
          },
        });

      case 'transferCall':
        // TODO: Implement call transfer
        const { phoneNumber } = parameters;
        logger.info({
          phoneNumber,
        }, '[Vapi Webhook] Transferring call');
        
        return NextResponse.json({
          result: {
            success: true,
            message: 'Transferring call...',
          },
        });

      default:
        logger.warn({
          functionName: name,
        }, '[Vapi Webhook] Unknown function call');
        
        return NextResponse.json({
          result: {
            success: false,
            message: 'Function not implemented',
          },
        });
    }
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      functionName: name,
    }, '[Vapi Webhook] Failed to execute function');

    return NextResponse.json({
      result: {
        success: false,
        message: 'Failed to execute function',
      },
    });
  }
}
