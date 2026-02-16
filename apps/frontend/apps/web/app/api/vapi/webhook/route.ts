import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/vapi/webhook
 *
 * Receives webhooks from Vapi for call events:
 * - assistant-request: When a call starts
 * - status-update: Call status changes
 * - end-of-call-report: Creates a CallReference linking the Vapi call to our account
 * - function-call: When AI wants to execute a function
 *
 * All call data (transcripts, recordings, analytics) lives in Vapi.
 * We only store a thin CallReference (vapiCallId -> accountId) for scoping.
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    // Verify Vapi webhook secret.
    // Vapi sends the serverUrlSecret in the X-Vapi-Secret header.
    const vapiSecret = request.headers.get('x-vapi-secret');
    const expectedSecret = process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;

    if (expectedSecret) {
      if (!vapiSecret || vapiSecret !== expectedSecret) {
        logger.error('[Vapi Webhook] Invalid or missing x-vapi-secret header');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await request.json();
    const { message } = payload;

    logger.info({
      messageType: message?.type,
      callId: message?.call?.id,
    }, '[Vapi Webhook] Received webhook');

    switch (message?.type) {
      case 'assistant-request':
        return handleAssistantRequest(payload);

      case 'status-update':
        return handleStatusUpdate(payload);

      case 'end-of-call-report':
        return handleEndOfCall(payload);

      case 'function-call':
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

  return NextResponse.json({ received: true });
}

/**
 * Resolve the account ID from a Vapi phone number ID or phone number.
 * Looks up VapiPhoneNumber table to find the associated account.
 */
async function resolveAccountFromCall(call: any, logger: any): Promise<string | null> {
  try {
    if (call?.phoneNumberId) {
      const vapiPhone = await prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        select: { accountId: true },
      });
      if (vapiPhone) {
        return vapiPhone.accountId;
      }
    }

    if (call?.phoneNumber?.number) {
      const vapiPhone = await prisma.vapiPhoneNumber.findFirst({
        where: { phoneNumber: call.phoneNumber.number },
        select: { accountId: true },
      });
      if (vapiPhone) {
        return vapiPhone.accountId;
      }
    }

    logger.warn({ callId: call?.id }, '[Vapi Webhook] Could not resolve account from call');
    return null;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, '[Vapi Webhook] Error resolving account');
    return null;
  }
}

/**
 * Handle end of call — create a thin CallReference linking the Vapi call to our account.
 * All call data (transcript, summary, recording, cost, analytics) stays in Vapi.
 */
async function handleEndOfCall(payload: any) {
  const logger = await getLogger();

  const { call } = payload.message;
  const vapiCallId = call?.id;

  logger.info({
    callId: vapiCallId,
    duration: call?.duration,
  }, '[Vapi Webhook] Call ended — creating call reference');

  if (!vapiCallId) {
    logger.warn('[Vapi Webhook] No call ID in end-of-call report');
    return NextResponse.json({ received: true });
  }

  try {
    const accountId = await resolveAccountFromCall(call, logger);

    if (!accountId) {
      logger.warn({ callId: vapiCallId }, '[Vapi Webhook] Skipping call reference — no account found');
      return NextResponse.json({ received: true });
    }

    const callRef = await prisma.callReference.create({
      data: {
        vapiCallId,
        accountId,
      },
    });

    logger.info({
      callId: vapiCallId,
      callRefId: callRef.id,
      accountId,
    }, '[Vapi Webhook] Call reference created');

    return NextResponse.json({ received: true, callRefId: callRef.id });
  } catch (error) {
    // If duplicate vapiCallId, that's fine — reference already exists
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      logger.info({ callId: vapiCallId }, '[Vapi Webhook] Call reference already exists');
      return NextResponse.json({ received: true });
    }

    logger.error({
      error: error instanceof Error ? error.message : error,
      callId: vapiCallId,
    }, '[Vapi Webhook] Failed to create call reference');

    return NextResponse.json({ received: true, error: 'Failed to create call reference' });
  }
}

/**
 * Handle function call - AI wants to execute an action
 *
 * Dispatches to the backend PMS service for Sikka operations.
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

  const callerPhone = call?.customer?.number;
  if (callerPhone) {
    logger.info({ callerPhone }, '[Vapi Webhook] Caller phone from metadata');
  }

  try {
    switch (name) {
      case 'searchPatients':
      case 'getPatientInfo':
      case 'createPatient':
      case 'updatePatient':
      case 'checkAvailability':
      case 'bookAppointment':
      case 'rescheduleAppointment':
      case 'cancelAppointment':
      case 'getAppointments':
      case 'addPatientNote':
      case 'getPatientInsurance':
      case 'getPatientBalance':
      case 'getProviders': {
        const result = await forwardToBackend(BACKEND_URL, name, payload, logger);
        return NextResponse.json(result);
      }

      case 'transferToHuman':
      case 'transferCall': {
        const result = await forwardToBackend(BACKEND_URL, 'transferToHuman', payload, logger);
        return NextResponse.json(result);
      }

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
      signal: AbortSignal.timeout(25000),
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
