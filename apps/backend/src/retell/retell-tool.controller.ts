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
    const args = this.resolveTemplateVars(body?.args || {}, call);
    const callId = call?.call_id;

    this.logger.log({ toolName, callId, args: JSON.stringify(args).slice(0, 300), msg: '[Retell Tool] Invoked' });

    this.logger.verbose({
      callId,
      toolName,
      args,
      callMetadata: { agent_id: call?.agent_id, from_number: call?.from_number, to_number: call?.to_number },
      msg: '[Retell → Backend] Full inbound tool call',
    });

    // Resolve account ID from: header > call metadata > RetellPhoneNumber lookup
    const accountId = await this.resolveAccountId(headerAccountId, call);

    // Rate limiting
    const rateLimitError = this.checkToolRateLimit(callId, toolName);
    if (rateLimitError) {
      this.logger.warn({ toolName, callId, msg: '[Retell Rate Limit] Blocked' });
      return { error: rateLimitError };
    }

    // Validation
    const validationError = this.validateToolParams(toolName, args);
    if (validationError) {
      this.logger.warn({ toolName, error: validationError, msg: '[Retell Tool Validation] Failed' });
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
      takeMessage: (p) => this.agentToolsService.takeMessage(p),
      getCallerContext: (p) => this.agentToolsService.handleGetCallerContext(p),
    };

    const handler = toolMap[toolName];
    if (!handler) {
      this.logger.warn({ toolName, msg: '[Retell] Unknown tool' });
      return { error: `Unknown tool: ${toolName}` };
    }

    const toolStartMs = Date.now();
    try {
      const rawResult = await handler(toolPayload);
      const durationMs = Date.now() - toolStartMs;

      const result = rawResult ?? {
        error: 'Tool returned empty result',
        message: "I'm having trouble with that right now. Let me help you another way.",
      };

      // Ensure speak_during_execution messages have time to play before the
      // tool result is returned (Retell stops speaking as soon as it receives
      // the response). getCallerContext is excluded because it runs pre-greeting.
      if (toolName !== 'getCallerContext') {
        const MIN_SPEAK_DELAY_MS = 1500;
        const remaining = MIN_SPEAK_DELAY_MS - durationMs;
        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining));
        }
      }

      const actualDurationMs = Date.now() - toolStartMs;
      const hasError = result && typeof result === 'object' && 'error' in result;

      this.recordToolCall(callId, {
        toolName,
        parameters: args,
        result,
        success: !hasError,
        timestamp: new Date().toISOString(),
        durationMs: actualDurationMs,
      });

      const resultStr = JSON.stringify(result) ?? '{}';

      if (hasError) {
        this.logger.warn({ toolName, callId, result: resultStr.slice(0, 500), msg: '[Retell Tool Error]' });
        this.logger.verbose({
          callId,
          toolName,
          accountId,
          errorPayload: resultStr.slice(0, 2000),
          msg: '[Retell → Agent] Error response',
        });
        this.trackBookingError(callId, toolName);
        return result;
      }

      this.logger.log({ toolName, callId, durationMs: actualDurationMs, execMs: durationMs, result: resultStr.slice(0, 500), msg: '[Retell Tool Response]' });

      this.logger.verbose({
        callId,
        toolName,
        accountId,
        durationMs: actualDurationMs,
        agentPayload: resultStr.slice(0, 2000),
        msg: '[Retell → Agent] Full response',
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - toolStartMs;
      const errMsg = error instanceof Error ? error.message : 'Tool execution failed';

      this.logger.error({ toolName, callId, error: errMsg, msg: '[Retell Tool Error] THROWN' });
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
          this.logger.log({ agentId, msg: '[resolveAccount] Resolved via RetellPhoneNumber agentId' });
          return retellPhone.accountId;
        }
      } catch (err) {
        this.logger.error({ error: err instanceof Error ? err.message : err, msg: '[resolveAccount] DB error' });
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
          this.logger.log({ phoneNumber, msg: '[resolveAccount] Resolved via RetellPhoneNumber phone' });
          return retellPhone.accountId;
        }
      } catch (err) {
        this.logger.error({ error: err instanceof Error ? err.message : err, msg: '[resolveAccount] DB error' });
      }
    }

    this.logger.warn({ agentId, phone: call?.to_number, msg: '[resolveAccount] Could not resolve account for Retell call' });
    return null;
  }

  // ── Template Variable Resolution ────────────────────────────────────────
  // Retell conversation flow agents may pass {{call.from_number}} etc. as
  // literal strings in tool args instead of resolving them. We substitute
  // them with real values from the call object before processing.

  private resolveTemplateVars(args: Record<string, any>, call: any): Record<string, any> {
    const varMap: Record<string, string | undefined> = {
      'call.from_number': call?.from_number,
      'call.to_number': call?.to_number,
      'call.call_id': call?.call_id,
      'call.agent_id': call?.agent_id,
    };

    const resolve = (value: any): any => {
      if (typeof value === 'string') {
        const templateMatch = value.match(/^\{\{(.+?)\}\}$/);
        if (templateMatch) {
          const key = templateMatch[1].trim();
          const resolved = varMap[key];
          if (resolved !== undefined) {
            this.logger.log({ template: key, resolved, msg: '[Retell Template] Resolved variable' });
            return resolved;
          }
          this.logger.warn({ template: key, msg: '[Retell Template] Unresolved variable — returning empty string' });
          return '';
        }
        return value.replace(/\{\{(.+?)\}\}/g, (_match, key: string) => {
          const resolved = varMap[key.trim()];
          if (resolved !== undefined) return resolved;
          this.logger.warn({ template: key.trim(), msg: '[Retell Template] Unresolved inline variable — removed' });
          return '';
        });
      }
      if (Array.isArray(value)) return value.map(resolve);
      if (value && typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) out[k] = resolve(v);
        return out;
      }
      return value;
    };

    return resolve(args);
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
