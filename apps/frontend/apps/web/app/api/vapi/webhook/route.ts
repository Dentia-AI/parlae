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
 * 
 * Dispatches to the backend PMS service for Sikka operations.
 * Tool names and parameters match Sikka API exactly.
 * See: vapi-pms-tools.config.ts for tool definitions
 * See: apps/backend/src/vapi/vapi-tools.service.ts for implementations
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

  const BACKEND_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '';

  // Extract caller's phone number from Vapi call metadata
  // Available as call.customer.number in every Vapi webhook payload
  const callerPhone = call?.customer?.number;
  if (callerPhone) {
    logger.info({ callerPhone }, '[Vapi Webhook] Caller phone from metadata');
  }

  try {
    // ================================================================
    // PMS Tool Calls - Forward to backend VapiToolsService
    // Parameters match Sikka API (see sikka.service.ts)
    // The caller's phone is injected into the payload for auto-lookup
    // ================================================================
    switch (name) {

      // --------------------------------------------------------
      // Patient Management
      // --------------------------------------------------------

      case 'searchPatients': {
        // Sikka: GET /patients/search
        // Params: { query: string, limit?: number }
        // Phone-first: the AI should pass phone number as query (most reliable)
        const result = await forwardToBackend(BACKEND_URL, 'searchPatients', payload, logger);
        return NextResponse.json(result);
      }

      case 'getPatientInfo': {
        // Sikka: GET /patients/{patientId} or search by phone/name
        // Params: { patientId: string } or { phone, name, firstName, lastName }
        const result = await forwardToBackend(BACKEND_URL, 'getPatientInfo', payload, logger);
        return NextResponse.json(result);
      }

      case 'createPatient': {
        // Sikka: POST /patient (singular)
        // Params: { firstName, lastName, phone, email?, dateOfBirth?, notes? }
        const result = await forwardToBackend(BACKEND_URL, 'createPatient', payload, logger);
        return NextResponse.json(result);
      }

      case 'updatePatient': {
        // Sikka: PATCH /patient/{patientId}
        // Params: { patientId, phone?, email?, address?, notes? }
        const result = await forwardToBackend(BACKEND_URL, 'updatePatient', payload, logger);
        return NextResponse.json(result);
      }

      // --------------------------------------------------------
      // Appointment Management
      // --------------------------------------------------------

      case 'checkAvailability': {
        // Sikka: GET /appointments_available_slots
        // Params: { date: YYYY-MM-DD, duration?: number, providerId?, appointmentType? }
        const result = await forwardToBackend(BACKEND_URL, 'checkAvailability', payload, logger);
        return NextResponse.json(result);
      }

      case 'bookAppointment': {
        // Sikka: POST /appointment (singular)
        // Params: { patientId, appointmentType, startTime (ISO 8601), duration (minutes), providerId?, notes? }
        const result = await forwardToBackend(BACKEND_URL, 'bookAppointment', payload, logger);
        return NextResponse.json(result);
      }

      case 'rescheduleAppointment': {
        // Sikka: PATCH /appointments/{appointmentId}
        // Params: { appointmentId, startTime (ISO 8601), duration?, providerId?, notes? }
        const result = await forwardToBackend(BACKEND_URL, 'rescheduleAppointment', payload, logger);
        return NextResponse.json(result);
      }

      case 'cancelAppointment': {
        // Sikka: DELETE /appointments/{appointmentId}
        // Params: { appointmentId, reason? }
        const result = await forwardToBackend(BACKEND_URL, 'cancelAppointment', payload, logger);
        return NextResponse.json(result);
      }

      case 'getAppointments': {
        // Sikka: GET /appointments?patientId=xxx
        // Params: { patientId, startDate?, endDate? }
        const result = await forwardToBackend(BACKEND_URL, 'getAppointments', payload, logger);
        return NextResponse.json(result);
      }

      // --------------------------------------------------------
      // Patient Notes
      // --------------------------------------------------------

      case 'addPatientNote': {
        // Sikka: POST /medical_notes
        // Params: { patientId, content, category? }
        const result = await forwardToBackend(BACKEND_URL, 'addPatientNote', payload, logger);
        return NextResponse.json(result);
      }

      // --------------------------------------------------------
      // Insurance & Billing
      // --------------------------------------------------------

      case 'getPatientInsurance': {
        // Sikka: GET /patients/{patientId}/insurance
        // Params: { patientId }
        const result = await forwardToBackend(BACKEND_URL, 'getPatientInsurance', payload, logger);
        return NextResponse.json(result);
      }

      case 'getPatientBalance': {
        // Sikka: GET /patient_balance?patient_id={patientId}
        // Params: { patientId }
        const result = await forwardToBackend(BACKEND_URL, 'getPatientBalance', payload, logger);
        return NextResponse.json(result);
      }

      // --------------------------------------------------------
      // Provider Management
      // --------------------------------------------------------

      case 'getProviders': {
        // Sikka: GET /providers
        // Params: none
        const result = await forwardToBackend(BACKEND_URL, 'getProviders', payload, logger);
        return NextResponse.json(result);
      }

      // --------------------------------------------------------
      // Call Transfer
      // --------------------------------------------------------

      case 'transferToHuman':
      case 'transferCall': {
        const result = await forwardToBackend(BACKEND_URL, 'transferToHuman', payload, logger);
        return NextResponse.json(result);
      }

      // --------------------------------------------------------
      // Unknown
      // --------------------------------------------------------

      default:
        logger.warn({
          functionName: name,
        }, '[Vapi Webhook] Unknown function call');
        
        return NextResponse.json({
          result: {
            success: false,
            message: `Function "${name}" is not implemented. Please try a different approach.`,
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
        message: "I'm having trouble with that right now. Let me try a different approach.",
      },
    });
  }
}

/**
 * Forward a tool call to the backend VapiToolsService.
 * 
 * The backend handles:
 * - PMS service resolution (Sikka credentials, token management)
 * - HIPAA audit logging
 * - Error handling with user-friendly messages
 * 
 * Falls back to a stub response if backend is not reachable.
 */
async function forwardToBackend(
  backendUrl: string,
  toolName: string,
  payload: any,
  logger: any
): Promise<any> {
  if (!backendUrl) {
    logger.warn({
      toolName,
    }, '[Vapi Webhook] No BACKEND_API_URL configured - using stub response');
    
    return {
      result: {
        success: false,
        message: 'Backend service is not configured. Please contact support.',
      },
    };
  }

  try {
    const response = await fetch(`${backendUrl}/vapi/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY || ''}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000), // 25s timeout
    });

    if (!response.ok) {
      logger.error({
        toolName,
        status: response.status,
        statusText: response.statusText,
      }, '[Vapi Webhook] Backend returned error');

      return {
        result: {
          success: false,
          message: "I'm having a technical issue. Let me try another way to help you.",
        },
      };
    }

    const result = await response.json();
    
    logger.info({
      toolName,
      success: result?.result?.success,
    }, '[Vapi Webhook] Backend response received');

    return result;
  } catch (error) {
    logger.error({
      toolName,
      error: error instanceof Error ? error.message : error,
    }, '[Vapi Webhook] Failed to reach backend');

    return {
      result: {
        success: false,
        message: "I'm having trouble connecting to our system. Let me take your information and someone will follow up.",
      },
    };
  }
}
