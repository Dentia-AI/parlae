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
   * - end-of-call-report: Full transcript, recording, structured data
   */
  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-vapi-signature') signature: string,
  ) {
    const messageType = payload?.message?.type;
    const callId = payload?.message?.call?.id;

    this.logger.log(
      `[Vapi Webhook] Type: ${messageType}, Call ID: ${callId}`,
    );

    // Verify webhook signature
    const secret =
      process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;
    if (secret && signature && signature !== secret) {
      this.logger.error('Invalid webhook signature');
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
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
   * Vapi sends: { message: { type: "function-call", functionCall: { name, parameters }, call } }
   * Expected response: { results: [{ toolCallId, result: "..." }] }
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

    // Build a payload that matches what the tools service expects
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
   * Process end-of-call-report: persist call log with transcript,
   * summary, structured data, and recording URL.
   */
  private async handleEndOfCall(payload: any) {
    const message = payload?.message || {};
    const call = message.call || {};
    const analysis = message.analysis || {};
    const artifact = message.artifact || {};

    const callId = call.id;
    const transcript = artifact.transcript || message.transcript || '';
    const summary =
      analysis.summary ||
      artifact.summary ||
      message.summary ||
      '';
    const recordingUrl =
      artifact.recordingUrl || message.recordingUrl || null;
    const structuredData =
      analysis.structuredData || artifact.structuredData || {};
    const costCents = message.cost ? Math.round(message.cost * 100) : null;

    this.logger.log(
      `End-of-call for ${callId}: summary=${summary?.slice(0, 80)}..., hasStructuredData=${Object.keys(structuredData).length > 0}`,
    );

    // Resolve account from call metadata
    const { accountId, voiceAgentId } =
      await this.resolveAccountFromCall(call);

    // Calculate duration
    let durationSeconds: number | null = null;
    if (call.startedAt && call.endedAt) {
      durationSeconds = Math.round(
        (new Date(call.endedAt).getTime() -
          new Date(call.startedAt).getTime()) /
          1000,
      );
    }

    // Map outcome from structured data
    const outcome = this.mapCallOutcome(structuredData);

    try {
      const callLog = await this.prisma.callLog.create({
        data: {
          accountId,
          voiceAgentId,
          vapiCallId: callId || null,
          phoneNumber:
            call.customer?.number ||
            call.phoneNumber?.number ||
            'unknown',
          callType: 'INBOUND',
          direction: 'inbound',
          duration: durationSeconds,
          status: 'COMPLETED',
          outcome: outcome as any,
          transcript,
          summary,
          recordingUrl,
          structuredData:
            Object.keys(structuredData).length > 0
              ? structuredData
              : undefined,
          callReason: structuredData.callReason || null,
          urgencyLevel: structuredData.urgencyLevel || null,
          contactName: structuredData.patientName || null,
          contactEmail: structuredData.patientEmail || null,
          followUpRequired: structuredData.followUpRequired || false,
          customerSentiment: structuredData.customerSentiment || null,
          metadata: {
            vapiCallId: callId,
            callDurationMs: call.duration,
            endedReason: call.endedReason,
            costCents,
          },
          accessLog: {
            entries: [
              {
                action: 'created',
                source: 'vapi-end-of-call',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        },
      });

      this.logger.log(
        `Call log created: ${callLog.id} for call ${callId}`,
      );
      return { received: true, callLogId: callLog.id };
    } catch (dbError) {
      this.logger.error(
        `Failed to save call log for ${callId}: ${dbError instanceof Error ? dbError.message : dbError}`,
      );
      return { received: true };
    }
  }

  /**
   * Resolve accountId and voiceAgentId from the Vapi call payload.
   * Uses the phone number to look up the VapiPhoneNumber → Account mapping.
   */
  private async resolveAccountFromCall(
    call: any,
  ): Promise<{ accountId: string | null; voiceAgentId: string | null }> {
    try {
      const phoneNumberId = call.phoneNumberId;
      const phoneNumber = call.phoneNumber?.number;

      if (phoneNumberId) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneNumberId: phoneNumberId },
          select: { accountId: true, voiceAgentId: true },
        });
        if (vapiPhone) {
          return {
            accountId: vapiPhone.accountId,
            voiceAgentId: vapiPhone.voiceAgentId,
          };
        }
      }

      if (phoneNumber) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { phoneNumber },
          select: { accountId: true, voiceAgentId: true },
        });
        if (vapiPhone) {
          return {
            accountId: vapiPhone.accountId,
            voiceAgentId: vapiPhone.voiceAgentId,
          };
        }
      }

      this.logger.warn(
        `Could not resolve account for call: phoneNumberId=${phoneNumberId}, phoneNumber=${phoneNumber}`,
      );
      return { accountId: null, voiceAgentId: null };
    } catch (err) {
      this.logger.error(
        `Error resolving account: ${err instanceof Error ? err.message : err}`,
      );
      return { accountId: null, voiceAgentId: null };
    }
  }

  private mapCallOutcome(
    structuredData: Record<string, any>,
  ): string {
    const outcome = structuredData?.callOutcome;
    const outcomeMap: Record<string, string> = {
      appointment_booked: 'APPOINTMENT_BOOKED',
      appointment_cancelled: 'APPOINTMENT_CANCELLED',
      appointment_rescheduled: 'APPOINTMENT_RESCHEDULED',
      information_provided: 'INFORMATION_PROVIDED',
      transferred_to_staff: 'TRANSFERRED',
      emergency_handled: 'TRANSFERRED',
      insurance_verified: 'INFORMATION_PROVIDED',
      payment_plan_discussed: 'INFORMATION_PROVIDED',
      voicemail: 'VOICEMAIL',
      unresolved: 'NO_ANSWER',
    };
    return outcomeMap[outcome] || 'COMPLETED';
  }
}
