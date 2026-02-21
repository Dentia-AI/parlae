import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { VapiToolsService } from './vapi-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/structured-logger';

@Controller('vapi')
export class VapiWebhookController {
  static readonly BACKEND_VERSION = 'v4.2';

  private readonly logger = new StructuredLogger(VapiWebhookController.name);

  private static readonly RATE_LIMIT_PER_TOOL = 5;
  private static readonly RATE_LIMIT_TTL_MS = 30 * 60 * 1000;

  /**
   * Per-call rate-limit tracker: { callId -> { toolName -> count } }.
   * Prevents the AI from retrying the same tool in a loop.
   */
  private readonly toolCallCounts = new Map<string, Map<string, number>>();

  constructor(
    private readonly vapiToolsService: VapiToolsService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.log(`[Vapi Webhook] Backend ${VapiWebhookController.BACKEND_VERSION} initialized`);
  }

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

    const silentTypes = new Set([
      'speech-update',
      'conversation-update',
      'voice-input',
      'user-interrupted',
    ]);

    if (!silentTypes.has(messageType)) {
      this.logger.log(
        `[Vapi Webhook ${VapiWebhookController.BACKEND_VERSION}] Type: ${messageType}, Call ID: ${callId}`,
      );
    }

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
      case 'user-interrupted':
      case 'assistant.started':
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
            result: this.formatToolError('unknown', 'Missing tool name'),
          },
        ],
      };
    }

    // Resolve unresolved Vapi template variables in tool arguments.
    // The AI model sometimes copies literal template syntax like
    // {{call.customer.number}} into tool arguments instead of using
    // the resolved value. Replace with the actual call metadata.
    parameters = this.resolveTemplateVars(parameters, payload.message?.call);

    // CRITICAL: Write parsed parameters back to message.functionCall so
    // tool handlers can access them via message.functionCall.parameters.
    // Without this, handlers reading from message.functionCall.parameters
    // get undefined (Vapi sends 'arguments' as a JSON string, not 'parameters').
    if (functionCall) {
      functionCall.parameters = parameters;
    }

    this.logger.log(
      `[Vapi Tool] ${toolName} | ${JSON.stringify(parameters).slice(0, 300)}`,
    );

    // ── Per-call rate limiting ──
    const callId = payload?.message?.call?.id;
    const rateLimitError = this.checkToolRateLimit(callId, toolName);
    if (rateLimitError) {
      this.logger.warn(`[Vapi Rate Limit] ${toolName} blocked for call ${callId}`);
      return {
        results: [
          {
            toolCallId,
            result: this.formatToolError(toolName, rateLimitError),
          },
        ],
      };
    }

    // Resolve the account ID once so tool handlers don't have to do their own lookups.
    // Checks assistant.metadata.accountId first, then falls back to phone lookups.
    const resolvedAccountId = await this.resolveAccountFromCall(
      payload.message?.call,
      payload.message,
    );

    const toolPayload = {
      call: payload.message?.call,
      message: payload.message,
      functionCall: { name: toolName, parameters },
      accountId: resolvedAccountId,
    };

    // Validate tool parameters before dispatching.
    // Returns instructive error messages so the LLM can self-correct.
    const validationError = this.validateToolParams(toolName, parameters);
    if (validationError) {
      this.logger.warn(
        `[Vapi Tool Validation] ${toolName} rejected: ${validationError}`,
      );
      return {
        results: [
          {
            toolCallId,
            result: this.formatToolError(toolName, validationError),
          },
        ],
      };
    }

    const lookupPatientHandler = (p: any) => this.vapiToolsService.lookupPatient(p);
    const saveInsuranceHandler = (p: any) => this.vapiToolsService.saveInsurance(p);

    const toolMap: Record<string, (p: any) => Promise<any>> = {
      // v4.0 canonical names
      lookupPatient: lookupPatientHandler,
      addNote: (p) => this.vapiToolsService.addPatientNote(p),
      getInsurance: (p) => this.vapiToolsService.getPatientInsurance(p),
      getBalance: (p) => this.vapiToolsService.getPatientBalance(p),
      saveInsurance: saveInsuranceHandler,

      // v3.x backward-compat aliases → same handlers
      searchPatients: lookupPatientHandler,
      getPatientInfo: lookupPatientHandler,
      addPatientNote: (p) => this.vapiToolsService.addPatientNote(p),
      getPatientInsurance: (p) => this.vapiToolsService.getPatientInsurance(p),
      getPatientBalance: (p) => this.vapiToolsService.getPatientBalance(p),
      addPatientInsurance: saveInsuranceHandler,
      updatePatientInsurance: saveInsuranceHandler,

      // Unchanged tools
      createPatient: (p) => this.vapiToolsService.createPatient(p),
      updatePatient: (p) => this.vapiToolsService.updatePatient(p),
      checkAvailability: (p) => this.vapiToolsService.checkAvailability(p),
      bookAppointment: (p) => this.vapiToolsService.bookAppointment(p),
      rescheduleAppointment: (p) => this.vapiToolsService.rescheduleAppointment(p),
      cancelAppointment: (p) => this.vapiToolsService.cancelAppointment(p),
      getAppointments: (p) => this.vapiToolsService.getAppointments(p),
      verifyInsuranceCoverage: (p) => this.vapiToolsService.verifyInsuranceCoverage(p),
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
            result: this.formatToolError(toolName, `Unknown tool: ${toolName}. This function is not available.`),
          },
        ],
      };
    }

    try {
      const result = await handler(toolPayload);
      const resultStr =
        typeof result === 'string'
          ? result
          : JSON.stringify(result) ?? JSON.stringify({ error: 'No response from tool' });

      // Detect error payloads returned as normal results (not thrown).
      // Many tool methods catch errors internally and return { error: '...' }
      // instead of throwing, so they bypass the catch block below.
      const hasError =
        result && typeof result === 'object' && 'error' in result;

      const logSnippet = (resultStr || '').slice(0, 500);

      if (hasError) {
        this.logger.warn(`[Vapi Tool Error] ${toolName} | ${logSnippet}`);
        return {
          results: [
            {
              toolCallId,
              result: this.formatToolError(toolName, typeof result.error === 'string' ? result.error : resultStr),
            },
          ],
        };
      }

      this.logger.log(`[Vapi Tool Response] ${toolName} | ${logSnippet}`);
      return {
        results: [
          {
            toolCallId,
            result: this.formatToolSuccess(toolName, resultStr),
          },
        ],
      };
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Tool execution failed';

      this.logger.error(
        `[Vapi Tool Error] ${toolName} THROWN | ${errMsg}`,
      );

      return {
        results: [
          {
            toolCallId,
            result: this.formatToolError(toolName, errMsg),
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
      await this.ensureCallReference(call, payload?.message);
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
      await this.ensureCallReference(payload?.message?.call || {}, payload?.message);
    }

    return { received: true };
  }

  /**
   * Validate tool parameters before dispatching to the service layer.
   * Returns a human-readable error string for the LLM to self-correct,
   * or null if validation passes.
   *
   * This is the primary enforcement mechanism for business rules that
   * the LLM might skip (e.g. collecting email before booking).
   * New rules should be added HERE, not in system prompts.
   */
  private validateToolParams(
    toolName: string,
    params: Record<string, unknown>,
  ): string | null {
    const errors: string[] = [];

    switch (toolName) {
      case 'bookAppointment': {
        if (!params.patientId) {
          errors.push(
            'Patient ID is required. Look up the patient first using lookupPatient, or create a new patient with createPatient.',
          );
        }
        if (!params.startTime) {
          errors.push(
            'Start time is required. Check availability first using checkAvailability, then use the selected time slot.',
          );
        }
        if (!params.email && !params.patientEmail) {
          errors.push(
            'Email address is required to book an appointment. Ask the caller for their email address and have them spell it out before booking.',
          );
        }
        if (!params.firstName && !params.lastName) {
          errors.push(
            'Patient name is required. Ask for the caller\'s first and last name, and ask them to spell it.',
          );
        }
        break;
      }

      case 'createPatient': {
        if (!params.firstName || !params.lastName) {
          errors.push(
            'First name and last name are both required. Ask the caller for their full name and have them spell it.',
          );
        }
        if (!params.phone && !params.phoneNumber) {
          errors.push(
            'Phone number is required. If the caller\'s phone number is available in the call metadata, use it. Otherwise, ask the caller for their phone number.',
          );
        }
        if (!params.email) {
          errors.push(
            'Email address is required to create a patient record. Ask the caller for their email and have them spell it out.',
          );
        }
        break;
      }

      case 'checkAvailability': {
        const dateStr = params.date as string;
        if (!dateStr) {
          errors.push(
            'Date is required. Ask the caller what date they prefer, then use YYYY-MM-DD format.',
          );
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          errors.push(
            `Date must be in YYYY-MM-DD format. You provided "${dateStr}".`,
          );
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const requested = new Date(dateStr + 'T00:00:00');
          if (requested < today) {
            const todayStr = today.toISOString().slice(0, 10);
            errors.push(
              `The date ${dateStr} is in the past. Today is ${todayStr}. Use today's date or a future date.`,
            );
          }
        }
        break;
      }

      case 'lookupPatient':
      case 'searchPatients':
      case 'getPatientInfo': {
        if (!params.query && !params.phone && !params.name && !params.email && !params.firstName && !params.patientId) {
          errors.push(
            "A search query is required. You must provide at least one of: phone number, patient name, or email. If the caller's phone number is unknown, ask the caller for their name (have them spell it) and search by name instead. Do NOT call this tool again with an empty query.",
          );
        }
        break;
      }

      case 'addNote':
      case 'addPatientNote': {
        if (!params.patientId) {
          errors.push('Patient ID is required. Look up the patient first using lookupPatient.');
        }
        if (!params.content) {
          errors.push('Note content is required.');
        }
        break;
      }

      case 'getInsurance':
      case 'getPatientInsurance':
      case 'getBalance':
      case 'getPatientBalance': {
        if (!params.patientId) {
          errors.push('Patient ID is required. Look up the patient first using lookupPatient.');
        }
        break;
      }

      case 'saveInsurance':
      case 'addPatientInsurance':
      case 'updatePatientInsurance': {
        if (!params.patientId) {
          errors.push('Patient ID is required. Look up the patient first using lookupPatient.');
        }
        if (!params.insuranceProvider) {
          errors.push('Insurance provider name is required. Ask the caller for their insurance company name.');
        }
        if (!params.memberId) {
          errors.push('Member ID is required. Ask the caller for their insurance member or subscriber ID.');
        }
        break;
      }

      case 'rescheduleAppointment': {
        if (!params.appointmentId) {
          errors.push(
            'Appointment ID is required. Look up the patient\'s appointments first using getAppointments.',
          );
        }
        if (!params.newStartTime && !params.startTime) {
          errors.push(
            'New start time is required. Check availability first using checkAvailability.',
          );
        }
        break;
      }

      case 'cancelAppointment': {
        if (!params.appointmentId) {
          errors.push(
            'Appointment ID is required. Look up the patient\'s appointments first using getAppointments.',
          );
        }
        break;
      }

      case 'getAppointments': {
        if (!params.patientId) {
          errors.push(
            'Patient ID is required. Look up the patient first using lookupPatient.',
          );
        }
        break;
      }

      case 'updatePatient': {
        if (!params.patientId) {
          errors.push(
            'Patient ID is required. Look up the patient first using lookupPatient.',
          );
        }
        break;
      }

      case 'processPayment': {
        if (!params.patientId) {
          errors.push(
            'Patient ID is required. Look up the patient first using lookupPatient.',
          );
        }
        if (!params.amount) {
          errors.push(
            'Payment amount is required. Confirm the amount with the caller before processing.',
          );
        }
        break;
      }
    }

    return errors.length > 0 ? `VALIDATION ERROR: ${errors.join(' ')}` : null;
  }

  private static readonly TOOL_NEXT_STEPS: Record<string, string> = {
    createPatient: 'Immediately proceed to book the appointment using bookAppointment. Do NOT pause or wait for the caller.',
    bookAppointment: 'Tell the caller their booking details: type, date, time. Mention they will receive email and text confirmation. Then ask if there is anything else.',
    checkAvailability: 'Present the available time slots to the caller and ask which one they prefer.',
    lookupPatient: 'Continue with the next step in your workflow based on what the caller needs.',
    cancelAppointment: 'Confirm the cancellation to the caller and offer to reschedule.',
    rescheduleAppointment: 'Confirm the new appointment details to the caller.',
    getAppointments: 'Present the appointments to the caller.',
    getInsurance: 'Share the relevant insurance information with the caller.',
    getBalance: 'Tell the caller their balance amount.',
    processPayment: 'Confirm the payment was processed and provide a summary.',
  };

  /**
   * Format a successful tool result with a clear [SUCCESS] prefix and next-step
   * instruction. This ensures the LLM can unambiguously distinguish success from
   * error and knows exactly what to do next — preventing stalling.
   */
  private formatToolSuccess(toolName: string, resultStr: string): string {
    const nextStep = VapiWebhookController.TOOL_NEXT_STEPS[toolName]
      || 'Continue the conversation naturally. Tell the caller the result and ask if they need anything else.';
    return `[SUCCESS] ${resultStr}\n\n[NEXT STEP] ${nextStep}`;
  }

  /**
   * Format a tool error with a clear [ERROR] prefix and explicit instructions.
   * This prevents the LLM from hallucinating success when a tool actually failed.
   */
  private formatToolError(toolName: string, errorMsg: string): string {
    return (
      `[ERROR] ${toolName} failed: ${errorMsg}\n\n` +
      `[INSTRUCTIONS] This tool call did NOT succeed. Do NOT tell the caller the action was completed. ` +
      `Read the error above, ask the caller for any missing information, and retry the tool call. ` +
      `Keep the conversation going naturally — never go silent.`
    );
  }

  /**
   * Per-call rate limiter. Returns an error string if the same tool has been
   * called more than RATE_LIMIT_PER_TOOL times for the same callId.
   */
  private checkToolRateLimit(callId: string | undefined, toolName: string): string | null {
    if (!callId) return null;

    let callMap = this.toolCallCounts.get(callId);
    if (!callMap) {
      callMap = new Map<string, number>();
      this.toolCallCounts.set(callId, callMap);

      // Lazy cleanup of stale entries
      if (this.toolCallCounts.size > 500) {
        const keys = [...this.toolCallCounts.keys()];
        const toRemove = keys.slice(0, keys.length - 200);
        for (const k of toRemove) this.toolCallCounts.delete(k);
      }
    }

    const count = (callMap.get(toolName) || 0) + 1;
    callMap.set(toolName, count);

    if (count > VapiWebhookController.RATE_LIMIT_PER_TOOL) {
      return (
        `You have already called ${toolName} ${count} times during this call. ` +
        'If you are not getting the expected result, apologize to the caller and offer to connect them with clinic staff.'
      );
    }

    return null;
  }

  /**
   * Resolve unresolved Vapi template variables in tool parameters.
   * The AI model sometimes copies literal {{call.customer.number}} or
   * placeholder text like "caller_phone_number" into tool arguments
   * instead of using the resolved value.
   */
  private resolveTemplateVars(params: any, call: any): any {
    if (!params || !call) return params;

    const customerNumber =
      call.customer?.number || call.phoneNumber?.number || '';

    const PLACEHOLDER_PHONE_VALUES = [
      'caller_phone_number',
      'caller phone number',
      "caller's phone number",
      'phone_number',
      'customer_phone_number',
      'customer phone number',
    ];

    const resolve = (value: any): any => {
      if (typeof value === 'string') {
        let resolved = value.replace(
          /\{\{call\.customer\.number\}\}/g,
          customerNumber,
        );
        if (
          customerNumber &&
          PLACEHOLDER_PHONE_VALUES.includes(resolved.toLowerCase().trim())
        ) {
          this.logger.warn(
            `[resolveTemplateVars] AI sent placeholder "${resolved}", replacing with actual number`,
          );
          resolved = customerNumber;
        }
        return resolved;
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
  private async ensureCallReference(call: any, message?: any): Promise<void> {
    const vapiCallId = call.id;
    if (!vapiCallId) return;

    const accountId = await this.resolveAccountFromCall(call, message);
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
   * Resolve accountId from the Vapi webhook payload.
   *
   * Resolution order:
   * 1. assistant.metadata.accountId (embedded at squad creation — phone-independent)
   * 2. VapiPhoneNumber record by Vapi phone ID
   * 3. VapiPhoneNumber record by phone number string
   * 4. Account.phoneIntegrationSettings JSON scan (legacy fallback)
   */
  private async resolveAccountFromCall(
    call: any,
    message?: any,
  ): Promise<string | null> {
    try {
      // 1. Metadata-based resolution (highest priority, phone-independent)
      const metadataAccountId = message?.assistant?.metadata?.accountId;
      if (metadataAccountId && typeof metadataAccountId === 'string') {
        this.logger.log(
          `[resolveAccount] via assistant metadata (accountId=${metadataAccountId})`,
        );
        return metadataAccountId;
      }

      const phoneNumberId = call?.phoneNumberId;
      const phoneNumber = call?.phoneNumber?.number;

      // 2. VapiPhoneNumber record by Vapi phone ID
      if (phoneNumberId) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneId: phoneNumberId },
          select: { accountId: true },
        });
        if (vapiPhone) {
          this.logger.log(
            `[resolveAccount] via vapiPhoneNumber table (vapiPhoneId=${phoneNumberId})`,
          );
          return vapiPhone.accountId;
        }
      }

      // 3. VapiPhoneNumber record by phone number string
      if (phoneNumber) {
        const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
          where: { phoneNumber },
          select: { accountId: true },
        });
        if (vapiPhone) {
          this.logger.log(
            `[resolveAccount] via vapiPhoneNumber phone string (number=${phoneNumber})`,
          );
          return vapiPhone.accountId;
        }
      }

      // 4. Fallback: search Account.phoneIntegrationSettings JSON for matching vapiPhoneId.
      // Handles cases where the VapiPhoneNumber table is out of sync.
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
              `[resolveAccount] via phoneIntegrationSettings fallback (vapiPhoneId=${phoneNumberId}, accountId=${acct.id})`,
            );
            return acct.id;
          }
        }
      }

      this.logger.warn(
        `[resolveAccount] Could not resolve account: phoneNumberId=${phoneNumberId}, phoneNumber=${phoneNumber}, hasMetadata=${!!message?.assistant?.metadata}`,
      );
      return null;
    } catch (err) {
      this.logger.error(
        `[resolveAccount] Error: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}
