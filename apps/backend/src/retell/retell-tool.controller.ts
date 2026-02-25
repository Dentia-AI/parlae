import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AgentToolsService } from '../agent-tools/agent-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/structured-logger';

/**
 * Retell Tool Controller
 *
 * Handles custom tool calls from Retell AI agents. Each Retell custom tool
 * is configured with a URL pointing to POST /retell/tools/:toolName.
 *
 * Retell sends:
 *   { call: { call_id, agent_id, metadata, ... }, args: { ...params } }
 *
 * We parse this into the same payload format that AgentToolsService expects,
 * then return plain JSON (Retell reads the response directly).
 */
@Controller('retell')
export class RetellToolController {
  static readonly BACKEND_VERSION = 'v1.0';

  private readonly logger = new StructuredLogger(RetellToolController.name);

  private readonly toolCallCounts = new Map<string, Map<string, number>>();
  private readonly bookingErrorCounts = new Map<string, number>();
  private readonly toolCallHistory = new Map<string, Array<Record<string, unknown>>>();

  private static readonly RATE_LIMIT_PER_TOOL = 5;
  private static readonly BOOKING_FALLBACK_THRESHOLD = 3;
  private static readonly BOOKING_TOOLS = new Set([
    'bookAppointment', 'createPatient', 'checkAvailability', 'rescheduleAppointment',
  ]);

  constructor(
    private readonly agentToolsService: AgentToolsService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.log(
      `[Retell Tool Controller] Backend ${RetellToolController.BACKEND_VERSION} initialized`,
    );
  }

  @Post('tools/:toolName')
  async handleToolCall(
    @Param('toolName') toolName: string,
    @Body() body: any,
    @Headers('x-retell-secret') retellSecret: string,
    @Headers('x-account-id') headerAccountId: string,
  ) {
    const expectedSecret =
      process.env.RETELL_WEBHOOK_SECRET ||
      process.env.VAPI_WEBHOOK_SECRET ||
      process.env.VAPI_SERVER_SECRET;

    if (expectedSecret && retellSecret !== expectedSecret) {
      this.logger.error('[Retell Tool] Invalid secret');
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const call = body?.call || {};
    const args = body?.args || {};
    const callId = call?.call_id;

    this.logger.log(
      `[Retell Tool] ${toolName} | callId=${callId} | args=${JSON.stringify(args).slice(0, 300)}`,
    );

    // Resolve account ID from: header > call metadata > RetellPhoneNumber lookup
    const accountId = await this.resolveAccountId(headerAccountId, call);

    // Rate limiting
    const rateLimitError = this.checkToolRateLimit(callId, toolName);
    if (rateLimitError) {
      this.logger.warn(`[Retell Rate Limit] ${toolName} blocked for call ${callId}`);
      return { error: rateLimitError };
    }

    // Validation
    const validationError = this.validateToolParams(toolName, args);
    if (validationError) {
      this.logger.warn(`[Retell Tool Validation] ${toolName}: ${validationError}`);
      return { error: validationError };
    }

    // Build the payload in the same format AgentToolsService expects
    const toolPayload = {
      call: {
        id: callId,
        customer: { number: call?.from_number || call?.metadata?.customerPhone },
        phoneNumber: { number: call?.to_number },
        ...call,
      },
      message: {
        call,
        assistant: { metadata: { accountId } },
      },
      functionCall: { name: toolName, parameters: args },
      accountId,
    };

    const toolMap: Record<string, (p: any) => Promise<any>> = {
      lookupPatient: (p) => this.agentToolsService.lookupPatient(p),
      searchPatients: (p) => this.agentToolsService.lookupPatient(p),
      createPatient: (p) => this.agentToolsService.createPatient(p),
      updatePatient: (p) => this.agentToolsService.updatePatient(p),
      checkAvailability: (p) => this.agentToolsService.checkAvailability(p),
      bookAppointment: (p) => this.agentToolsService.bookAppointment(p),
      rescheduleAppointment: (p) => this.agentToolsService.rescheduleAppointment(p),
      cancelAppointment: (p) => this.agentToolsService.cancelAppointment(p),
      getAppointments: (p) => this.agentToolsService.getAppointments(p),
      addNote: (p) => this.agentToolsService.addPatientNote(p),
      addPatientNote: (p) => this.agentToolsService.addPatientNote(p),
      getInsurance: (p) => this.agentToolsService.getPatientInsurance(p),
      getPatientInsurance: (p) => this.agentToolsService.getPatientInsurance(p),
      getBalance: (p) => this.agentToolsService.getPatientBalance(p),
      getPatientBalance: (p) => this.agentToolsService.getPatientBalance(p),
      saveInsurance: (p) => this.agentToolsService.saveInsurance(p),
      verifyInsuranceCoverage: (p) => this.agentToolsService.verifyInsuranceCoverage(p),
      getPaymentHistory: (p) => this.agentToolsService.getPaymentHistory(p),
      processPayment: (p) => this.agentToolsService.processPayment(p),
      createPaymentPlan: (p) => this.agentToolsService.createPaymentPlan(p),
      getProviders: (p) => this.agentToolsService.getProviders(p),
      transferToHuman: (p) => this.agentToolsService.transferToHuman(p),
    };

    const handler = toolMap[toolName];
    if (!handler) {
      this.logger.warn(`[Retell] Unknown tool: ${toolName}`);
      return { error: `Unknown tool: ${toolName}` };
    }

    const toolStartMs = Date.now();
    try {
      const result = await handler(toolPayload);
      const durationMs = Date.now() - toolStartMs;

      const hasError = result && typeof result === 'object' && 'error' in result;

      this.recordToolCall(callId, {
        toolName,
        parameters: args,
        result,
        success: !hasError,
        timestamp: new Date().toISOString(),
        durationMs,
      });

      if (hasError) {
        this.logger.warn(
          `[Retell Tool Error] ${toolName} | ${JSON.stringify(result).slice(0, 500)}`,
        );
        this.trackBookingError(callId, toolName);
        return result;
      }

      this.logger.log(
        `[Retell Tool Response] ${toolName} (${durationMs}ms) | ${JSON.stringify(result).slice(0, 500)}`,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - toolStartMs;
      const errMsg = error instanceof Error ? error.message : 'Tool execution failed';

      this.logger.error(`[Retell Tool Error] ${toolName} THROWN | ${errMsg}`);
      this.recordToolCall(callId, {
        toolName,
        parameters: args,
        result: { error: errMsg },
        success: false,
        timestamp: new Date().toISOString(),
        durationMs,
      });
      this.trackBookingError(callId, toolName);

      return { error: errMsg };
    }
  }

  // ── Test Introspection (gated by ENABLE_TEST_ENDPOINTS) ─────────────────

  @Get('test/call/:callId/tools')
  getToolCallHistory(@Param('callId') callId: string) {
    if (!process.env.ENABLE_TEST_ENDPOINTS) {
      throw new HttpException('Test endpoints disabled', HttpStatus.NOT_FOUND);
    }

    const history = this.toolCallHistory.get(callId);
    if (!history) {
      return { callId, tools: [], message: 'No tool calls recorded for this call ID' };
    }

    return {
      callId,
      tools: history,
      count: history.length,
    };
  }

  @Get('test/calls/recent')
  getRecentCallIds() {
    if (!process.env.ENABLE_TEST_ENDPOINTS) {
      throw new HttpException('Test endpoints disabled', HttpStatus.NOT_FOUND);
    }

    const callIds = [...this.toolCallHistory.keys()].slice(-50).reverse();
    return {
      callIds,
      count: callIds.length,
    };
  }

  // ── Account Resolution ──────────────────────────────────────────────────

  private async resolveAccountId(
    headerAccountId: string | undefined,
    call: any,
  ): Promise<string | null> {
    // 1. Explicit header (set by Retell tool config)
    if (headerAccountId) return headerAccountId;

    // 2. Call metadata
    const metadataAccountId = call?.metadata?.accountId;
    if (metadataAccountId) return metadataAccountId;

    // 3. RetellPhoneNumber lookup by agent ID
    const agentId = call?.agent_id;
    if (agentId) {
      try {
        const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
          where: { retellAgentId: agentId },
          select: { accountId: true },
        });
        if (retellPhone) {
          this.logger.log(`[resolveAccount] via RetellPhoneNumber (agentId=${agentId})`);
          return retellPhone.accountId;
        }
      } catch (err) {
        this.logger.error(`[resolveAccount] DB error: ${err instanceof Error ? err.message : err}`);
      }
    }

    // 4. RetellPhoneNumber lookup by phone number
    const phoneNumber = call?.to_number;
    if (phoneNumber) {
      try {
        const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
          where: { phoneNumber },
          select: { accountId: true },
        });
        if (retellPhone) {
          this.logger.log(`[resolveAccount] via RetellPhoneNumber phone (number=${phoneNumber})`);
          return retellPhone.accountId;
        }
      } catch (err) {
        this.logger.error(`[resolveAccount] DB error: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.warn(
      `[resolveAccount] Could not resolve account for Retell call: agentId=${agentId}, phone=${call?.to_number}`,
    );
    return null;
  }

  // ── Rate Limiting ───────────────────────────────────────────────────────

  private checkToolRateLimit(callId: string | undefined, toolName: string): string | null {
    if (!callId) return null;

    let callMap = this.toolCallCounts.get(callId);
    if (!callMap) {
      callMap = new Map<string, number>();
      this.toolCallCounts.set(callId, callMap);
      if (this.toolCallCounts.size > 500) {
        const keys = [...this.toolCallCounts.keys()];
        for (const k of keys.slice(0, keys.length - 200)) this.toolCallCounts.delete(k);
      }
    }

    const count = (callMap.get(toolName) || 0) + 1;
    callMap.set(toolName, count);

    if (count > RetellToolController.RATE_LIMIT_PER_TOOL) {
      return `Tool ${toolName} called ${count} times this call. If not getting expected results, offer to connect with clinic staff.`;
    }
    return null;
  }

  // ── Validation ──────────────────────────────────────────────────────────

  private validateToolParams(toolName: string, params: any): string | null {
    const errors: string[] = [];

    switch (toolName) {
      case 'createPatient':
        if (!params.firstName) errors.push('firstName is required.');
        if (!params.lastName) errors.push('lastName is required.');
        if (!params.phone) errors.push('phone is required.');
        break;
      case 'bookAppointment':
        if (!params.patientId) errors.push('patientId is required. Look up or create the patient first.');
        if (!params.date) errors.push('date is required (YYYY-MM-DD).');
        if (!params.startTime) errors.push('startTime is required (HH:MM).');
        if (!params.appointmentType) errors.push('appointmentType is required.');
        break;
      case 'checkAvailability':
        if (!params.date) errors.push('date is required (YYYY-MM-DD).');
        break;
      case 'rescheduleAppointment':
        if (!params.appointmentId) errors.push('appointmentId is required.');
        if (!params.newDate) errors.push('newDate is required.');
        if (!params.newStartTime) errors.push('newStartTime is required.');
        break;
      case 'cancelAppointment':
        if (!params.appointmentId) errors.push('appointmentId is required.');
        break;
      case 'processPayment':
        if (!params.patientId) errors.push('patientId is required.');
        if (!params.amount) errors.push('amount is required.');
        break;
    }

    return errors.length > 0 ? `VALIDATION ERROR: ${errors.join(' ')}` : null;
  }

  // ── Tracking ────────────────────────────────────────────────────────────

  private trackBookingError(callId: string | undefined, toolName: string): void {
    if (!callId || !RetellToolController.BOOKING_TOOLS.has(toolName)) return;
    const count = (this.bookingErrorCounts.get(callId) || 0) + 1;
    this.bookingErrorCounts.set(callId, count);
    if (this.bookingErrorCounts.size > 500) {
      const keys = [...this.bookingErrorCounts.keys()];
      for (const k of keys.slice(0, keys.length - 200)) this.bookingErrorCounts.delete(k);
    }
  }

  private recordToolCall(callId: string | undefined, record: Record<string, unknown>): void {
    if (!callId || !process.env.ENABLE_TEST_ENDPOINTS) return;
    if (!this.toolCallHistory.has(callId)) {
      this.toolCallHistory.set(callId, []);
    }
    this.toolCallHistory.get(callId)!.push(record);
    if (this.toolCallHistory.size > 200) {
      const keys = [...this.toolCallHistory.keys()];
      for (const k of keys.slice(0, keys.length - 100)) this.toolCallHistory.delete(k);
    }
  }
}
