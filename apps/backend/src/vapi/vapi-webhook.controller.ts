import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { VapiToolsService } from './vapi-tools.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('vapi')
export class VapiWebhookController {
  private readonly logger = new Logger(VapiWebhookController.name);

  constructor(
    private readonly vapiToolsService: VapiToolsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /vapi/webhook
   *
   * Single entry-point for ALL Vapi events:
   * - function-call: Tool invocations (searchPatients, bookAppointment, etc.)
   * - assistant-request: When a call starts
   * - status-update: Call status changes
   * - end-of-call-report: Creates a thin CallReference linking Vapi call to our account
   *
   * All call data (transcripts, recordings, analytics) stays in Vapi as the source of truth.
   */
  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-vapi-secret') vapiSecret: string,
    @Headers('authorization') authorization: string,
  ) {
    const messageType = payload?.message?.type;
    const callId = payload?.message?.call?.id;

    this.logger.log(
      `[Vapi Webhook] Type: ${messageType}, Call ID: ${callId}`,
    );

    // Verify webhook authentication.
    // Vapi sends the server.secret (or serverUrlSecret) in the X-Vapi-Secret header.
    // For credential-based auth, it may come in the Authorization header.
    const expectedSecret =
      process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;

    if (expectedSecret) {
      const receivedSecret =
        vapiSecret ||
        (authorization?.startsWith('Bearer ')
          ? authorization.slice(7)
          : undefined);

      if (!receivedSecret) {
        this.logger.error('[Vapi Webhook] Missing authentication header (x-vapi-secret or Authorization)');
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      if (receivedSecret !== expectedSecret) {
        this.logger.error('[Vapi Webhook] Invalid secret — does not match VAPI_WEBHOOK_SECRET');
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    switch (messageType) {
      case 'function-call':
        return this.handleFunctionCall(payload);

      case 'assistant-request':
        return this.handleAssistantRequest(payload);

      case 'status-update':
        return this.handleStatusUpdate(payload);

      case 'end-of-call-report':
        return this.handleEndOfCall(payload);

      default:
        this.logger.warn(`Unknown webhook type: ${messageType}`);
        return { received: true };
    }
  }

  /**
   * Dispatch function-call (tool call) to the appropriate service method.
   */
  private async handleFunctionCall(payload: any) {
    const functionCall = payload?.message?.functionCall;
    const toolCallId = functionCall?.id;
    const toolName = functionCall?.name;
    const parameters = functionCall?.parameters || {};

    if (!toolName) {
      this.logger.error('function-call missing functionCall.name');
      return {
        results: [
          {
            toolCallId,
            result: JSON.stringify({ error: 'Missing tool name' }),
          },
        ],
      };
    }

    this.logger.log(
      `[Vapi Tool] ${toolName} with params: ${JSON.stringify(parameters).slice(0, 200)}`,
    );

    const toolPayload = {
      message: payload.message,
      functionCall: { name: toolName, parameters },
    };

    const toolMap: Record<string, (p: any) => Promise<any>> = {
      searchPatients: (p) => this.vapiToolsService.searchPatients(p),
      getPatientInfo: (p) => this.vapiToolsService.getPatientInfo(p),
      createPatient: (p) => this.vapiToolsService.createPatient(p),
      updatePatient: (p) => this.vapiToolsService.updatePatient(p),
      checkAvailability: (p) => this.vapiToolsService.checkAvailability(p),
      bookAppointment: (p) => this.vapiToolsService.bookAppointment(p),
      rescheduleAppointment: (p) =>
        this.vapiToolsService.rescheduleAppointment(p),
      cancelAppointment: (p) => this.vapiToolsService.cancelAppointment(p),
      getAppointments: (p) => this.vapiToolsService.getAppointments(p),
      addPatientNote: (p) => this.vapiToolsService.addPatientNote(p),
      getPatientInsurance: (p) =>
        this.vapiToolsService.getPatientInsurance(p),
      getPatientBalance: (p) => this.vapiToolsService.getPatientBalance(p),
      getProviders: (p) => this.vapiToolsService.getProviders(p),
      transferToHuman: (p) => this.vapiToolsService.transferToHuman(p),
    };

    const handler = toolMap[toolName];
    if (!handler) {
      this.logger.warn(`Unknown tool: ${toolName}`);
      return {
        results: [
          {
            toolCallId,
            result: JSON.stringify({
              error: `Unknown tool: ${toolName}`,
              message: 'This function is not available.',
            }),
          },
        ],
      };
    }

    try {
      const result = await handler(toolPayload);
      return {
        results: [
          {
            toolCallId,
            result:
              typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Tool execution failed';
      this.logger.error(`Tool ${toolName} failed: ${errMsg}`);
      return {
        results: [
          {
            toolCallId,
            result: JSON.stringify({
              error: errMsg,
              message:
                "I'm having trouble with that right now. Let me take your information and someone will follow up.",
            }),
          },
        ],
      };
    }
  }

  private async handleAssistantRequest(payload: any) {
    this.logger.log('Handling assistant-request');
    return { received: true };
  }

  private async handleStatusUpdate(payload: any) {
    const status = payload?.message?.status;
    const callId = payload?.message?.call?.id;
    this.logger.log(`Status update: ${status} for call ${callId}`);
    return { received: true };
  }

  /**
   * Process end-of-call-report: create a thin CallReference linking the Vapi call to our account.
   * All call data (transcript, summary, recording, cost, analytics) stays in Vapi.
   */
  private async handleEndOfCall(payload: any) {
    const call = payload?.message?.call || {};
    const vapiCallId = call.id;

    this.logger.log(
      `End-of-call for ${vapiCallId}`,
    );

    if (!vapiCallId) {
      this.logger.warn('No call ID in end-of-call report');
      return { received: true };
    }

    const accountId = await this.resolveAccountFromCall(call);

    if (!accountId) {
      this.logger.warn(
        `Skipping call reference for ${vapiCallId} — no account found`,
      );
      return { received: true };
    }

    try {
      const callRef = await this.prisma.callReference.create({
        data: {
          vapiCallId,
          accountId,
        },
      });

      this.logger.log(
        `Call reference created: ${callRef.id} for call ${vapiCallId}`,
      );
      return { received: true, callRefId: callRef.id };
    } catch (dbError) {
      // If duplicate vapiCallId, that's fine
      if (dbError instanceof Error && dbError.message.includes('Unique constraint')) {
        this.logger.log(`Call reference already exists for ${vapiCallId}`);
        return { received: true };
      }

      this.logger.error(
        `Failed to save call reference for ${vapiCallId}: ${dbError instanceof Error ? dbError.message : dbError}`,
      );
      return { received: true };
    }
  }

  /**
   * Resolve accountId from the Vapi call payload.
   * Uses the phone number to look up the VapiPhoneNumber → Account mapping.
   */
  private async resolveAccountFromCall(call: any): Promise<string | null> {
    try {
      const phoneNumberId = call.phoneNumberId;
      const phoneNumber = call.phoneNumber?.number;

      if (phoneNumberId) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneId: phoneNumberId },
          select: { accountId: true },
        });
        if (vapiPhone) {
          return vapiPhone.accountId;
        }
      }

      if (phoneNumber) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { phoneNumber },
          select: { accountId: true },
        });
        if (vapiPhone) {
          return vapiPhone.accountId;
        }
      }

      this.logger.warn(
        `Could not resolve account for call: phoneNumberId=${phoneNumberId}, phoneNumber=${phoneNumber}`,
      );
      return null;
    } catch (err) {
      this.logger.error(
        `Error resolving account: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}
