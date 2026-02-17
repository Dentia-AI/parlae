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
   * - status-update: Creates a thin CallReference when call goes in-progress
   * - end-of-call-report: Lightweight ack (CallReference already created above)
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
    // Vapi may authenticate in two ways:
    //   1. X-Vapi-Secret header (from tool server.secret)
    //   2. Authorization: Bearer <token> (from credentialId)
    // Accept if EITHER matches the expected secret, because tools
    // may have both credentialId and a legacy server.secret set.
    const expectedSecret =
      process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;

    if (expectedSecret) {
      const bearerToken = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;

      const secretMatches = vapiSecret === expectedSecret;
      const bearerMatches = bearerToken === expectedSecret;

      if (!secretMatches && !bearerMatches) {
        if (!vapiSecret && !bearerToken) {
          this.logger.error('[Vapi Webhook] Missing authentication header (x-vapi-secret or Authorization)');
        } else {
          this.logger.error('[Vapi Webhook] Invalid secret — neither X-Vapi-Secret nor Bearer token matches');
        }
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    switch (messageType) {
      case 'function-call':
      case 'tool-calls':
        return this.handleFunctionCall(payload);

      case 'assistant-request':
        return this.handleAssistantRequest(payload);

      case 'status-update':
        return this.handleStatusUpdate(payload);

      case 'end-of-call-report':
        return this.handleEndOfCall(payload);

      // Known Vapi event types we acknowledge but don't act on
      case 'speech-update':
      case 'conversation-update':
      case 'hang':
      case 'transfer-destination-request':
      case 'voice-input':
        return { received: true };

      default:
        this.logger.warn(`Unhandled webhook type: ${messageType}`);
        return { received: true };
    }
  }

  /**
   * Dispatch function-call / tool-calls to the appropriate service method.
   * Supports both legacy 'function-call' and newer 'tool-calls' payload formats.
   */
  private async handleFunctionCall(payload: any) {
    const messageType = payload?.message?.type;

    // Handle 'tool-calls' format (array of tool calls)
    if (messageType === 'tool-calls') {
      const toolCallList = payload?.message?.toolCallList || [];
      if (toolCallList.length === 0) {
        this.logger.warn('tool-calls event with empty toolCallList');
        return { results: [] };
      }
      const results: Array<{ toolCallId: string; result: string }> = [];
      for (const tc of toolCallList) {
        // tc has { id, type, function: { name, arguments } }
        // Merge tc.id into the functionCall so dispatchToolCall can read toolCallId
        const funcObj = tc.function || tc;
        const singlePayload = {
          ...payload,
          message: {
            ...payload.message,
            type: 'function-call',
            functionCall: { ...funcObj, id: tc.id || funcObj.id },
          },
        };
        const singleResult = await this.dispatchToolCall(singlePayload);
        results.push(...(singleResult.results || []));
      }
      return { results };
    }

    // Legacy 'function-call' format
    return this.dispatchToolCall(payload);
  }

  private async dispatchToolCall(payload: any) {
    const functionCall = payload?.message?.functionCall;
    const toolCallId = functionCall?.id;
    const toolName = functionCall?.name;

    // Vapi sends tool arguments as a JSON string in 'arguments',
    // but our tool handlers expect a parsed 'parameters' object.
    let parameters = functionCall?.parameters;
    if (!parameters || (typeof parameters === 'object' && Object.keys(parameters).length === 0)) {
      const args = functionCall?.arguments;
      if (args) {
        try {
          parameters = typeof args === 'string' ? JSON.parse(args) : args;
        } catch {
          parameters = {};
        }
      } else {
        parameters = {};
      }
    }

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

    // Resolve unresolved Vapi template variables in tool arguments.
    // The AI model sometimes copies literal template syntax like
    // {{call.customer.number}} into tool arguments instead of using
    // the resolved value. Replace with the actual call metadata.
    parameters = this.resolveTemplateVars(parameters, payload.message?.call);

    this.logger.log(
      `[Vapi Tool] ${toolName} | ${JSON.stringify(parameters).slice(0, 300)}`,
    );

    const toolPayload = {
      call: payload.message?.call,
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
      rescheduleAppointment: (p) => this.vapiToolsService.rescheduleAppointment(p),
      cancelAppointment: (p) => this.vapiToolsService.cancelAppointment(p),
      getAppointments: (p) => this.vapiToolsService.getAppointments(p),
      addPatientNote: (p) => this.vapiToolsService.addPatientNote(p),
      getPatientInsurance: (p) => this.vapiToolsService.getPatientInsurance(p),
      addPatientInsurance: (p) => this.vapiToolsService.addPatientInsurance(p),
      updatePatientInsurance: (p) => this.vapiToolsService.updatePatientInsurance(p),
      verifyInsuranceCoverage: (p) => this.vapiToolsService.verifyInsuranceCoverage(p),
      getPatientBalance: (p) => this.vapiToolsService.getPatientBalance(p),
      getPaymentHistory: (p) => this.vapiToolsService.getPaymentHistory(p),
      processPayment: (p) => this.vapiToolsService.processPayment(p),
      createPaymentPlan: (p) => this.vapiToolsService.createPaymentPlan(p),
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

  /**
   * Handle status-update: create a CallReference when the call starts (in-progress).
   * This avoids waiting for the heavy end-of-call-report payload which includes
   * the full transcript, recording, and analytics data we don't store.
   */
  private async handleStatusUpdate(payload: any) {
    const status = payload?.message?.status;
    const call = payload?.message?.call || {};
    const vapiCallId = call.id;

    this.logger.log(`Status update: ${status} for call ${vapiCallId}`);

    if (status === 'in-progress' && vapiCallId) {
      await this.ensureCallReference(call);
    }

    return { received: true };
  }

  /**
   * Handle end-of-call-report: lightweight acknowledgment only.
   * The CallReference was already created during status-update (in-progress).
   * We intentionally skip processing the large payload (transcript, recording, etc.)
   * since all call data stays in Vapi as the source of truth.
   */
  private async handleEndOfCall(payload: any) {
    const vapiCallId = payload?.message?.call?.id;
    this.logger.log(`End-of-call for ${vapiCallId}`);

    // Safety net: create CallReference if status-update didn't fire
    if (vapiCallId) {
      await this.ensureCallReference(payload?.message?.call || {});
    }

    return { received: true };
  }

  /**
   * Resolve unresolved Vapi template variables in tool parameters.
   * The AI model sometimes copies literal {{call.customer.number}} into
   * tool arguments. This replaces them with actual values from the call.
   */
  private resolveTemplateVars(params: any, call: any): any {
    if (!params || !call) return params;

    const customerNumber =
      call.customer?.number || call.phoneNumber?.number || '';

    const resolve = (value: any): any => {
      if (typeof value === 'string') {
        return value.replace(
          /\{\{call\.customer\.number\}\}/g,
          customerNumber,
        );
      }
      if (Array.isArray(value)) return value.map(resolve);
      if (value && typeof value === 'object') {
        const resolved: any = {};
        for (const [k, v] of Object.entries(value)) {
          resolved[k] = resolve(v);
        }
        return resolved;
      }
      return value;
    };

    return resolve(params);
  }

  /**
   * Create a thin CallReference linking the Vapi call to our account.
   * Uses upsert for idempotency — no duplicate-key errors.
   */
  private async ensureCallReference(call: any): Promise<void> {
    const vapiCallId = call.id;
    if (!vapiCallId) return;

    const accountId = await this.resolveAccountFromCall(call);
    if (!accountId) {
      this.logger.warn(
        `Skipping call reference for ${vapiCallId} — no account found`,
      );
      return;
    }

    try {
      await this.prisma.callReference.upsert({
        where: { vapiCallId },
        create: { vapiCallId, accountId },
        update: {},
      });

      this.logger.log(
        `Call reference ensured for call ${vapiCallId}`,
      );
    } catch (dbError: any) {
      this.logger.error(
        `Failed to save call reference for ${vapiCallId}: ${dbError instanceof Error ? dbError.message : dbError}`,
      );
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

      // Primary lookup: VapiPhoneNumber record by Vapi phone ID
      if (phoneNumberId) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneId: phoneNumberId },
          select: { accountId: true },
        });
        if (vapiPhone) {
          return vapiPhone.accountId;
        }
      }

      // Secondary lookup: VapiPhoneNumber record by phone number string
      if (phoneNumber) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { phoneNumber },
          select: { accountId: true },
        });
        if (vapiPhone) {
          return vapiPhone.accountId;
        }
      }

      // Fallback: search Account.phoneIntegrationSettings JSON for matching vapiPhoneId.
      // This handles cases where the VapiPhoneNumber table is out of sync
      // (e.g. squad was recreated with a new phone import).
      if (phoneNumberId) {
        const accounts = await this.prisma.account.findMany({
          where: {
            phoneIntegrationSettings: { not: null as any },
          },
          select: { id: true, phoneIntegrationSettings: true },
        });

        for (const acct of accounts) {
          const settings = acct.phoneIntegrationSettings as any;
          if (settings?.vapiPhoneId === phoneNumberId) {
            this.logger.log(
              `Resolved account ${acct.id} via phoneIntegrationSettings fallback (vapiPhoneId=${phoneNumberId})`,
            );
            return acct.id;
          }
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
