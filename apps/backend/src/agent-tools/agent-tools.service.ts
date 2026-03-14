import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HipaaAuditService } from '../common/services/hipaa-audit.service';
import { StructuredLogger } from '../common/structured-logger';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import twilio from 'twilio';

const ANTI_HALLUCINATION_DISCLAIMER =
  'IMPORTANT: Do not provide medical advice, diagnoses, or treatment recommendations. ' +
  'If the caller asks medical questions, say: "That\'s a great question for your dentist. ' +
  'I can help you schedule an appointment to discuss that."';

interface CachedPatientData {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  patientId: string;
  cachedAt: number;
}

interface CallerContext {
  callerPhone: string;
  fetchedAt: number;
  patientName?: string;
  patientId?: string;
  patientType: 'returning' | 'new';
  familyMembers?: Array<{ id: string; firstName: string; lastName: string }>;
  nextBooking?: {
    date: string;
    dayOfWeek: string;
    time: string;
    type?: string;
  };
  lastVisitDate?: string;
  lastCallSummary?: string;
  lastCallOutcome?: string;
}

function formatDateForSpeech(dateInput: string | Date, tz?: string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  });
}

function formatTimeForSpeech(dateInput: string | Date, tz?: string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(tz ? { timeZone: tz } : {}),
  });
}

@Injectable()
export class AgentToolsService {
  private readonly logger = new StructuredLogger(AgentToolsService.name);

  /**
   * Per-call patient cache: stores data from createPatient so bookAppointment
   * can retrieve it even when the AI model forgets to pass the fields through.
   * Keyed by callId. Entries auto-expire after 15 minutes.
   */
  private readonly patientCache = new Map<string, CachedPatientData>();
  private readonly callerContextCache = new Map<string, CallerContext>();
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000;

  /**
   * Log an AI action to the user-facing audit trail (AiActionLog).
   * Stores only non-PHI data: resource IDs, appointment metadata, staff names.
   * Never stores patient names, DOB, phone, email, or medical content.
   */
  private async logAiAction(params: {
    accountId: string;
    source: 'pms' | 'gcal';
    action: string;
    category: string;
    callId?: string;
    externalResourceId?: string;
    externalResourceType?: string;
    appointmentTime?: string;
    appointmentType?: string;
    providerName?: string;
    duration?: number;
    summary: string;
    success?: boolean;
    status?: string;
    errorMessage?: string;
    pmsProvider?: string;
    writebackId?: string;
    calendarEventId?: string;
  }): Promise<void> {
    try {
      await this.prisma.aiActionLog.create({
        data: {
          accountId: params.accountId,
          source: params.source,
          action: params.action,
          category: params.category,
          callId: params.callId,
          externalResourceId: params.externalResourceId,
          externalResourceType: params.externalResourceType,
          appointmentTime: params.appointmentTime,
          appointmentType: params.appointmentType,
          providerName: params.providerName,
          duration: params.duration,
          summary: params.summary,
          success: params.success ?? true,
          status: params.status ?? 'completed',
          errorMessage: params.errorMessage,
          pmsProvider: params.pmsProvider,
          writebackId: params.writebackId,
          calendarEventId: params.calendarEventId,
        },
      });
    } catch (err) {
      this.logger.error({ error: err, msg: '[AiActionLog] Failed to log action (non-fatal)' });
    }
  }

  constructor(
    private prisma: PrismaService,
    private hipaaAudit: HipaaAuditService,
    private googleCalendar: GoogleCalendarService,
    private notifications: NotificationsService,
  ) {}

  private async getAccountTimezone(accountId: string): Promise<string> {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { brandingTimezone: true },
      });
      return (account as any)?.brandingTimezone || 'America/Toronto';
    } catch {
      return 'America/Toronto';
    }
  }

  private cachePatient(callId: string, data: CachedPatientData) {
    this.patientCache.set(callId, data);
    // Lazy cleanup of stale entries
    if (this.patientCache.size > 200) {
      const cutoff = Date.now() - AgentToolsService.CACHE_TTL_MS;
      for (const [key, val] of this.patientCache) {
        if (val.cachedAt < cutoff) this.patientCache.delete(key);
      }
    }
  }

  private getCachedPatient(callId: string): CachedPatientData | undefined {
    const entry = this.patientCache.get(callId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > AgentToolsService.CACHE_TTL_MS) {
      this.patientCache.delete(callId);
      return undefined;
    }
    return entry;
  }

  getCallerContext(callId: string): CallerContext | undefined {
    const entry = this.callerContextCache.get(callId);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt > AgentToolsService.CACHE_TTL_MS) {
      this.callerContextCache.delete(callId);
      return undefined;
    }
    return entry;
  }

  /**
   * Tool handler: getCallerContext
   * Called by the AI agent at the start of a conversation to get
   * pre-loaded context about the caller (name, next booking, last call, etc.).
   */
  async handleGetCallerContext(payload: any) {
    const call = payload?.call;
    const callId = call?.id || call?.call_id;

    if (!callId) {
      return { result: { patientType: 'new', message: 'No call context available.' } };
    }

    let ctx = this.getCallerContext(callId);

    // Real-time fallback: if the webhook-based prefetch didn't populate the
    // cache (e.g. HMAC verification failed), attempt an inline lookup now.
    if (!ctx) {
      const callerPhone =
        call?.from_number ||
        call?.customer?.number ||
        call?.metadata?.customerPhone;
      const accountId = payload?.accountId || call?.metadata?.accountId;

      if (callerPhone && accountId) {
        this.logger.log({
          callId,
          msg: '[CallerContext] Cache empty — running real-time fallback lookup',
        });
        try {
          await this.prefetchCallerContext(callId, callerPhone, accountId, 'RETELL');
          ctx = this.getCallerContext(callId);
        } catch (err) {
          this.logger.warn({
            error: err instanceof Error ? err.message : err,
            msg: '[CallerContext] Real-time fallback failed',
          });
        }
      }
    }

    // Extract the caller's phone from the call object (available for real phone calls, not web calls)
    const callerPhone =
      ctx?.callerPhone ||
      call?.from_number ||
      call?.customer?.number ||
      call?.metadata?.customerPhone ||
      '';

    if (!ctx || ctx.patientType === 'new') {
      return {
        result: {
          patientType: 'new',
          ...(callerPhone ? { callerPhone } : {}),
          message: 'This appears to be a new caller. Proceed with the standard greeting.',
        },
      };
    }

    const response: Record<string, any> = {
      patientType: ctx.patientType,
      patientName: ctx.patientName,
      ...(callerPhone ? { callerPhone } : {}),
    };

    if (ctx.patientId) {
      response.patientId = ctx.patientId;
    }

    if (ctx.familyMembers && ctx.familyMembers.length > 1) {
      response.familyAccount = true;
      response.familyMembers = ctx.familyMembers.map(m => ({ id: m.id, name: m.firstName }));
    }

    if (ctx.nextBooking) {
      response.nextBooking = ctx.nextBooking;
    }
    if (ctx.lastVisitDate) {
      response.lastVisitInfo = this.formatRelativeDate(ctx.lastVisitDate);
    }
    if (ctx.lastCallSummary) {
      response.lastCallSummary = ctx.lastCallSummary;
    }
    if (ctx.lastCallOutcome) {
      response.lastCallOutcome = ctx.lastCallOutcome;
    }

    const isFamily = ctx.familyMembers && ctx.familyMembers.length > 1;
    const parts: string[] = isFamily
      ? [`This is a family account with members: ${ctx.familyMembers!.map(m => m.firstName).join(', ')}. Ask who is calling.`]
      : [`Welcome back, ${(ctx.patientName || '').split(' ')[0]}!`];
    if (ctx.nextBooking) {
      parts.push(`They have an upcoming ${ctx.nextBooking.type || 'appointment'} on ${ctx.nextBooking.dayOfWeek} at ${ctx.nextBooking.time}.`);
    }
    if (ctx.lastCallSummary) {
      parts.push(`Last call: ${ctx.lastCallSummary}`);
    }
    response.message = parts.join(' ');

    return { result: response };
  }

  /**
   * Fire-and-forget caller context prefetch.
   * Runs in the background when a call starts to prime the cache with
   * patient name, next booking, last visit, and last call summary.
   */
  async prefetchCallerContext(
    callId: string,
    callerPhone: string,
    accountId: string,
    provider: 'RETELL' | 'VAPI' = 'RETELL',
  ): Promise<void> {
    if (!callerPhone || !accountId) return;

    const normalizedPhone = this.normalizePhone(callerPhone);
    if (!normalizedPhone) return;

    this.logger.log({
      callId,
      callerPhone: callerPhone.slice(0, 4) + '****',
      accountId,
      msg: '[CallerContext] Starting prefetch',
    });

    const context: CallerContext = {
      callerPhone: normalizedPhone,
      fetchedAt: Date.now(),
      patientType: 'new',
    };

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    try {
      const [patientResult, callHistoryResult] = await Promise.allSettled([
        this.prefetchPatientData(normalizedPhone, accountId, context, dayNames),
        this.prefetchCallHistory(normalizedPhone, accountId, provider, context),
      ]);

      if (patientResult.status === 'rejected') {
        this.logger.warn({ error: patientResult.reason, msg: '[CallerContext] Patient prefetch failed' });
      }
      if (callHistoryResult.status === 'rejected') {
        this.logger.warn({ error: callHistoryResult.reason, msg: '[CallerContext] Call history prefetch failed' });
      }
    } catch (err) {
      this.logger.warn({ error: err, msg: '[CallerContext] Prefetch failed (non-fatal)' });
    }

    this.callerContextCache.set(callId, context);

    if (this.callerContextCache.size > 200) {
      const cutoff = Date.now() - AgentToolsService.CACHE_TTL_MS;
      for (const [key, val] of this.callerContextCache) {
        if (val.fetchedAt < cutoff) this.callerContextCache.delete(key);
      }
    }

    this.logger.log({
      callId,
      patientType: context.patientType,
      hasPatientName: !!context.patientName,
      hasNextBooking: !!context.nextBooking,
      hasLastCall: !!context.lastCallSummary,
      msg: '[CallerContext] Prefetch complete',
    });
  }

  private async prefetchPatientData(
    normalizedPhone: string,
    accountId: string,
    context: CallerContext,
    dayNames: string[],
  ): Promise<void> {
    const pmsIntegration = await this.resolvePmsForAccount(accountId);
    const tz = await this.getAccountTimezone(accountId);

    if (pmsIntegration) {
      await this.prefetchFromPms(normalizedPhone, accountId, pmsIntegration, context, dayNames, tz);
    } else {
      await this.prefetchFromGCal(normalizedPhone, accountId, context, dayNames, tz);
    }
  }

  private async prefetchFromPms(
    normalizedPhone: string,
    accountId: string,
    pmsIntegration: any,
    context: CallerContext,
    dayNames: string[],
    tz: string,
  ): Promise<void> {
    const { PmsService } = await import('../pms/pms.service');
    const pmsService = new PmsService(this.prisma);
    const sikkaService = await pmsService.getPmsService(
      accountId,
      pmsIntegration.provider,
      pmsIntegration.config,
    );

    const searchResult = await sikkaService.searchPatients({
      query: normalizedPhone,
      limit: 5,
    });

    if (!searchResult.success || !searchResult.data?.length) return;

    const patients = searchResult.data;
    const patient = patients[0];
    context.patientType = 'returning';

    if (patients.length > 1) {
      const names = patients.map(p => p.firstName).filter(Boolean);
      context.patientName = names.join(', ');
      context.familyMembers = patients.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
      }));
    } else {
      context.patientName = `${patient.firstName} ${patient.lastName}`.trim();
      context.patientId = patient.id;
    }

    if (patient.lastVisit) {
      const d = new Date(patient.lastVisit);
      context.lastVisitDate = !isNaN(d.getTime()) ? d.toISOString() : undefined;
    }

    try {
      const now = new Date();
      const futureEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const apptResult = await sikkaService.getAppointments({
        patientId: patient.id,
        startDate: now,
        endDate: futureEnd,
        limit: 1,
      });

      if (apptResult.success && apptResult.data?.length) {
        const appt = apptResult.data[0];
        const apptDate = new Date(appt.startTime);
        if (!isNaN(apptDate.getTime())) {
          context.nextBooking = {
            date: apptDate.toISOString(),
            dayOfWeek: apptDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }),
            time: apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }),
            type: appt.appointmentType,
          };
        }
      }
    } catch (err) {
      this.logger.warn({ error: err, msg: '[CallerContext] PMS appointment fetch failed (non-fatal)' });
    }
  }

  private async prefetchFromGCal(
    normalizedPhone: string,
    accountId: string,
    context: CallerContext,
    dayNames: string[],
    tz: string,
  ): Promise<void> {
    const gcalAvailable = await this.isGoogleCalendarAvailable(accountId);
    if (!gcalAvailable) return;

    const now = new Date();
    const pastStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const result = await this.googleCalendar.findEventsByPatient(
      accountId,
      { patientPhone: normalizedPhone },
      pastStart,
      futureEnd,
    );

    const events = result?.events;
    if (!events?.length) return;

    const firstEvent = events[0];
    const nameFromSummary = (firstEvent.summary || '').replace(/^[^-–]*[-–]\s*/, '').trim();
    if (nameFromSummary) {
      context.patientType = 'returning';
      context.patientName = nameFromSummary;
    }

    const futureEvents = events
      .filter((evt: any) => new Date(evt.startTime) > now)
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (futureEvents.length > 0) {
      const next = futureEvents[0];
      const d = new Date(String(next.startTime));
      if (!isNaN(d.getTime())) {
        const type = (next.summary || '').replace(/\s*[-–]\s*.+$/, '').trim();
        context.nextBooking = {
          date: d.toISOString(),
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }),
          time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }),
          type: type || undefined,
        };
      }
    }

    const pastEvents = events
      .filter((evt: any) => new Date(evt.startTime) <= now)
      .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    if (pastEvents.length > 0) {
      const lastVisit = new Date(String(pastEvents[0].startTime));
      if (!isNaN(lastVisit.getTime())) {
        context.lastVisitDate = lastVisit.toISOString();
      }
    }
  }

  private async prefetchCallHistory(
    normalizedPhone: string,
    accountId: string,
    provider: 'RETELL' | 'VAPI',
    context: CallerContext,
  ): Promise<void> {
    if (provider === 'RETELL') {
      await this.prefetchRetellCallHistory(normalizedPhone, accountId, context);
    }
    // Vapi call history would require the frontend shared service; for now
    // Retell is the primary path. Vapi support can be added later.
  }

  private async prefetchRetellCallHistory(
    normalizedPhone: string,
    accountId: string,
    context: CallerContext,
  ): Promise<void> {
    const retellApiKey = process.env.RETELL_API_KEY;
    if (!retellApiKey) return;

    const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
      where: { accountId },
      select: { retellAgentIds: true, retellAgentId: true },
    });
    if (!retellPhone) return;

    const agentIds: string[] = [];
    if (retellPhone.retellAgentId) agentIds.push(retellPhone.retellAgentId);
    const agentsJson = retellPhone.retellAgentIds as Record<string, any> | null;
    if (agentsJson) {
      for (const val of Object.values(agentsJson)) {
        const id = typeof val === 'string' ? val : val?.agent_id;
        if (id && !agentIds.includes(id)) agentIds.push(id);
      }
    }
    if (agentIds.length === 0) return;

    try {
      const res = await fetch('https://api.retellai.com/v2/list-calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter_criteria: { agent_id: agentIds },
          sort_order: 'descending',
          limit: 20,
        }),
      });

      if (!res.ok) return;

      const calls: any[] = await res.json();
      if (!Array.isArray(calls)) return;

      const matchingCall = calls.find((c) => {
        const fromDigits = (c.from_number || '').replace(/\D/g, '');
        const normalized = fromDigits.length === 11 && fromDigits.startsWith('1')
          ? fromDigits.slice(1)
          : fromDigits;
        return normalized === normalizedPhone && c.call_analysis;
      });

      if (matchingCall?.call_analysis) {
        context.lastCallSummary = matchingCall.call_analysis.call_summary as string || undefined;
        context.lastCallOutcome = matchingCall.call_analysis.call_outcome as string || undefined;
      }
    } catch (err) {
      this.logger.warn({ error: err, msg: '[CallerContext] Retell call history fetch failed (non-fatal)' });
    }
  }

  async transferToHuman(payload: any) {
    try {
      const { call, message } = payload;

      this.logger.log({
        callId: call.id,
        phoneNumberId: call.phoneNumberId,
      });

      // Resolve the phone record (works for both Vapi and Retell)
      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      if (!phoneRecord) {
        this.logger.error({ phoneNumberId: call.phoneNumberId, accountId: payload.accountId });
        return {
          error: 'Configuration not found',
          message:
            "I apologize, but I'm unable to transfer you right now. Please call our main office line.",
        };
      }

      // Check if transfer is enabled
      const transferEnabled = (phoneRecord as any).transferEnabled;
      const staffForwardNumber = (phoneRecord as any).staffForwardNumber;
      
      if (!transferEnabled || !staffForwardNumber) {
        this.logger.warn({
          clinicId: phoneRecord.accountId,
          transferEnabled,
        });
        return {
          error: 'Transfer not configured',
          message:
            "I apologize, but live assistance is not available right now. I can take a detailed message and have someone call you back within the hour.",
        };
      }

      // Get function call parameters
      const functionCall = message?.functionCall || payload?.functionCall;
      const params = functionCall?.parameters || {};
      const reason = params.reason || 'emergency';
      const summary = params.summary || 'Patient requested transfer';
      const patientInfo = params.patientInfo || {};

      // Alert staff via SMS
      if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
        );

        await twilioClient.messages.create({
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
          to: staffForwardNumber,
          body: `URGENT: Call transfer incoming from ${phoneRecord.account?.name}\nReason: ${reason}\nSummary: ${summary}\nPatient: ${patientInfo.name || 'Unknown'}`,
        });
      }

      this.logger.log({
        clinicId: phoneRecord.accountId,
        transferTo: staffForwardNumber,
        reason,
      });

      return {
        result: {
          success: true,
          action: 'transfer',
          transferTo: staffForwardNumber,
          message: 'Transferring you to our staff now. Please hold.',
          summary,
          patientInfo,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Transfer failed',
        message:
          "I apologize, but I'm having trouble with the transfer. Let me take your information and have someone call you right back.",
      };
    }
  }

  async takeMessage(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);
      const accountId = phoneRecord?.accountId || payload.accountId;

      const callerName = params.callerName || 'Unknown caller';
      const callerPhone = params.callerPhone || call?.customer?.number || call?.from_number || 'Unknown';
      const reason = params.reason || 'No reason provided';
      const urgency = params.urgency || 'normal';
      const notes = params.notes || '';

      this.logger.log({
        accountId,
        callerName,
        callerPhone,
        urgency,
        msg: '[TakeMessage] Collecting caller message',
      });

      // Send SMS notification to staff
      const staffNumber = (phoneRecord as any)?.staffForwardNumber;
      if (staffNumber && process.env.TWILIO_MESSAGING_SERVICE_SID) {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
        );

        const urgencyLabel = urgency === 'urgent' ? 'URGENT' : 'Message';

        await twilioClient.messages.create({
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
          to: staffNumber,
          body: [
            `${urgencyLabel}: Missed call from ${callerName}`,
            `Phone: ${callerPhone}`,
            `Reason: ${reason}`,
            notes ? `Notes: ${notes}` : '',
            `Please call back as soon as possible.`,
          ].filter(Boolean).join('\n'),
        }).catch((err) => {
          this.logger.error({ error: err?.message, msg: '[TakeMessage] SMS notification failed (non-fatal)' });
        });
      }

      // Send email notification to clinic via notifications service
      if (accountId) {
        this.notifications.sendPmsFailureNotification({
          accountId,
          patient: {
            firstName: callerName.split(' ')[0] || callerName,
            lastName: callerName.split(' ').slice(1).join(' ') || '',
            phone: callerPhone,
          },
          appointment: {
            appointmentType: `Missed Call – ${urgency === 'urgent' ? 'URGENT' : 'Normal'}`,
            startTime: new Date(),
            duration: 0,
            notes: `Reason: ${reason}${notes ? `\nAdditional notes: ${notes}` : ''}\n\nThis message was collected by the AI assistant after a transfer attempt was unsuccessful. Please follow up with the caller.`,
          },
          pmsErrorMessage: 'Transfer unsuccessful — message taken from caller',
          gcalBackupCreated: false,
        }).catch((err) => {
          this.logger.error({ error: err?.message, msg: '[TakeMessage] Email notification failed (non-fatal)' });
        });
      }

      this.logAiAction({
        accountId,
        source: 'gcal',
        action: 'take_message',
        category: 'communication',
        callId: call?.id || call?.call_id,
        summary: `Message from ${callerName} (${callerPhone}): ${reason}`,
      }).catch(() => {});

      return {
        result: {
          success: true,
          message: `Message recorded. The clinic will be notified and someone will call ${callerName} back at ${callerPhone}.`,
        },
      };
    } catch (error: any) {
      this.logger.error({ error: error?.message, msg: '[TakeMessage] Failed to process message' });
      return {
        result: {
          success: true,
          message: 'Your message has been noted. Someone from the clinic will call you back as soon as possible.',
        },
      };
    }
  }

  async bookAppointment(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      // Correct past dates before any processing
      if (params.date) {
        const today = new Date().toISOString().slice(0, 10);
        if (params.date < today) {
          this.logger.warn({ requestedDate: params.date, correctedTo: today, msg: '[bookAppointment] AI sent past date — correcting to today' });
          params.date = today;
        }
      }

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);
      const needsPatientCreate = !params.patientId && params.firstName && params.lastName;

      if (!phoneRecord?.pmsIntegration) {
        // ── GCal path: cache patient fields so GCal booking can use them ──
        if (needsPatientCreate && call?.id) {
          const callerPhone = call?.customer?.number;
          this.cachePatient(call.id, {
            firstName: params.firstName || '',
            lastName: params.lastName || '',
            phone: params.phone || callerPhone,
            email: params.email,
            patientId: `gcal-${Date.now()}`,
            cachedAt: Date.now(),
          });
        }
        return this.bookAppointmentViaGoogleCalendar(phoneRecord, params, call);
      }

      // ── PMS path ──
      const { PmsService } = await import('../pms/pms.service');
      const pmsService = new PmsService(this.prisma);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      let resolvedPatientId = params.patientId;

      // Auto-create the patient when AI provides patient fields instead of patientId
      if (needsPatientCreate) {
        const createResult = await this.createPatientForBooking(
          sikkaService, phoneRecord, params, call,
        );
        if (!createResult.success) {
          // PMS create failed — fall back to GCal for the whole booking
          if (call?.id) {
            this.cachePatient(call.id, {
              firstName: params.firstName || '',
              lastName: params.lastName || '',
              phone: params.phone || call?.customer?.number,
              email: params.email,
              patientId: `gcal-${Date.now()}`,
              cachedAt: Date.now(),
            });
          }
          return this.bookAppointmentViaGoogleCalendar(phoneRecord, params, call);
        }
        resolvedPatientId = createResult.patientId;
      }

      let resolvedProviderId = params.providerId;
      if (!resolvedProviderId) {
        try {
          const providers = await sikkaService.getProviders();
          const active = providers.success ? (providers.data || []).filter((p: any) => p.isActive) : [];
          if (active.length > 0) {
            resolvedProviderId = active[0].id;
            this.logger.log({
              accountId: phoneRecord.accountId,
              providerId: resolvedProviderId,
              providerName: `${active[0].firstName} ${active[0].lastName}`.trim(),
              msg: '[bookAppointment] Auto-assigned provider — AI did not specify one',
            });
          }
        } catch {
          this.logger.warn({ msg: '[bookAppointment] Could not fetch providers for auto-assign' });
        }
      }

      const bookingInput = {
        patientId: resolvedPatientId,
        providerId: resolvedProviderId,
        appointmentType: params.appointmentType || params.type || 'General',
        startTime: this.parseBookingStartTime(params),
        duration: params.duration || 30,
        notes: params.notes,
      };

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'bookAppointment',
        pmsInput: bookingInput,
        msg: '[PMS Call] bookAppointment request',
      });

      const result = await sikkaService.bookAppointment(bookingInput);

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'bookAppointment',
        pmsResult: { success: result.success, hasData: !!result.data, error: result.error },
        msg: '[PMS Call] bookAppointment response',
      });
      
      if (!result.success || !result.data) {
        const errorMsg = result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : 'Booking failed';
        this.logger.warn({ accountId: phoneRecord.accountId, errorMsg, pmsError: result.error, msg: '[PMS] Writeback failed, attempting fallback' });
        return this.handlePmsBookingFailure(phoneRecord, params, call, errorMsg);
      }
      
      const appointment = result.data;
      const wasCreated = needsPatientCreate;

      this.logger.log({ appointmentId: appointment.id });

      this.logAiAction({
        accountId: phoneRecord.accountId,
        source: 'pms',
        action: 'book_appointment',
        category: 'appointment',
        callId: call?.id,
        externalResourceId: appointment.id,
        externalResourceType: 'appointment',
        appointmentTime: params.startTime || params.datetime,
        appointmentType: params.appointmentType || params.type || 'General',
        providerName: appointment.providerName || params.providerId,
        duration: params.duration || 30,
        summary: `${wasCreated ? 'Created patient & ' : ''}Booked ${params.appointmentType || params.type || 'General'} appointment, ${params.duration || 30} min${appointment.providerName ? ` with ${appointment.providerName}` : ''}`,
        pmsProvider: phoneRecord.pmsIntegration?.provider,
        writebackId: appointment.metadata?.writebackId as string | undefined,
      }).catch(() => {});

      const confirmMsg = wasCreated
        ? `I've registered you and booked your ${params.appointmentType || 'appointment'} for ${formatDateForSpeech(params.startTime || params.datetime)} at ${formatTimeForSpeech(params.startTime || params.datetime)}.`
        : `Appointment booked for ${formatDateForSpeech(params.startTime || params.datetime)} at ${formatTimeForSpeech(params.startTime || params.datetime)}.`;

      const agentResponse = {
        result: {
          success: true,
          appointmentId: appointment.id,
          confirmationNumber: appointment.confirmationNumber,
          patientCreated: wasCreated,
          message: `${confirmMsg} Do NOT say "with [patient name]" — the caller already knows who they are.`,
        },
      };

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'bookAppointment',
        agentResponse,
        msg: '[Agent Response] bookAppointment success → agent',
      });

      return agentResponse;
    } catch (error: any) {
      this.logger.error(error);

      try {
        const { call, message } = payload;
        const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};
        const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);
        if (phoneRecord) {
          this.logger.log({ msg: '[PMS] Attempting fallback after unexpected error' });
          return this.handlePmsBookingFailure(phoneRecord, params, call, error?.message || 'Unexpected error');
        }
      } catch {
        // Fallback itself failed — return the original error
      }

      return {
        error: 'Booking failed',
        message: "I'm sorry, I had trouble booking that appointment. Let me take your information and have someone call you back.",
      };
    }
  }

  async checkAvailability(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const callerPhone = call?.customer?.number || 'unknown';

      // Safety net: if the AI hallucinated a date in the past, replace with today
      const today = new Date().toISOString().slice(0, 10);
      let requestedDate = params.date || today;
      if (requestedDate < today) {
        this.logger.warn({ requestedDate, correctedTo: today, msg: '[checkAvailability] AI sent past date — correcting to today' });
        requestedDate = today;
      }
      params.date = requestedDate;

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      this.logger.log({
        callerPhone,
        accountId: phoneRecord?.accountId || payload.accountId || 'none',
        vapiPhoneId: call?.phoneNumberId,
        hasPms: !!phoneRecord?.pmsIntegration,
        hasPhoneRecord: !!phoneRecord,
        date: params.date,
        appointmentType: params.appointmentType,
        duration: params.duration,
        msg: '[checkAvailability] Request details',
      });

      if (!phoneRecord?.pmsIntegration) {
        // ── Google Calendar Fallback ──
        return this.checkAvailabilityViaGoogleCalendar(phoneRecord, params);
      }

      const { PmsService } = await import('../pms/pms.service');
      const pmsService = new PmsService(this.prisma);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      const availInput = {
        date: params.date,
        appointmentType: params.appointmentType || params.type,
        duration: params.duration || 30,
        providerId: params.providerId,
      };

      this.logger.log({
        accountId: phoneRecord.accountId,
        tool: 'checkAvailability',
        pmsInput: availInput,
        msg: '[PMS Call] checkAvailability request',
      });

      const result = await sikkaService.checkAvailability(availInput);

      this.logger.log({
        accountId: phoneRecord.accountId,
        tool: 'checkAvailability',
        pmsResult: { success: result.success, slotCount: result.data?.length ?? 0, error: result.error },
        msg: '[PMS Call] checkAvailability response',
      });
      
      if (!result.success) {
        const errorMsg = result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : 'Availability check failed';
        this.logger.error({ accountId: phoneRecord.accountId, errorMsg, pmsError: result.error, msg: '[PMS] checkAvailability failed' });
        throw new Error(errorMsg);
      }
      
      const slots = result.data || [];
      const pmsNoContent = result.meta?.noContent === true;

      if (pmsNoContent && slots.length === 0) {
        this.logger.warn({
          accountId: phoneRecord.accountId,
          msg: '[PMS] checkAvailability returned 204 No Content — PMS cannot provide slot data, falling back to GCal',
        });
        return this.checkAvailabilityViaGoogleCalendar(phoneRecord, params);
      }

      if (slots.length > 0) {
        const tz = await this.getAccountTimezone(phoneRecord.accountId);
        const nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        const todayLocal = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

        let filtered = slots;
        if (params.date === todayLocal) {
          filtered = slots.filter(s => s.startTime > nowLocal);
          if (filtered.length === 0) {
            filtered = slots;
          }
        }

        const deduped = new Map<string, typeof filtered[0]>();
        for (const slot of filtered) {
          const key = `${slot.startTime.toISOString()}`;
          if (!deduped.has(key)) deduped.set(key, slot);
        }
        const uniqueSlots = Array.from(deduped.values());

        return {
          result: {
            success: true,
            availableSlots: uniqueSlots.map((slot) => ({
              date: params.date,
              time: slot.startTime,
              provider: slot.providerName || '',
              providerId: slot.providerId || '',
            })),
            message: `We have ${uniqueSlots.length} available slot(s) on ${params.date}. Which time works best for you?`,
          },
        };
      }

      // No slots on the requested date — query the next 14 days via a range call
      this.logger.log({
        date: params.date,
        msg: '[PMS] No slots on requested date, checking next 14 days',
      });

      const scanStart = new Date(`${params.date}T00:00:00`);
      scanStart.setDate(scanStart.getDate() + 1);
      const scanEnd = new Date(`${params.date}T00:00:00`);
      scanEnd.setDate(scanEnd.getDate() + 14);
      const startStr = scanStart.toISOString().slice(0, 10);
      const endStr = scanEnd.toISOString().slice(0, 10);

      let nearestSlots: Array<{ date: string; time: string; provider?: string }> = [];

      // Try a single range query first (1 API call instead of 14)
      try {
        const rangeResult = await sikkaService.checkAvailability({
          date: startStr,
          endDate: endStr,
          appointmentType: params.appointmentType || params.type,
          duration: params.duration || 30,
          providerId: params.providerId,
        });

        if (rangeResult.success && rangeResult.data && rangeResult.data.length > 0) {
          const seen = new Set<string>();
          for (const slot of rangeResult.data) {
            const slotDate = slot.startTime.toISOString().slice(0, 10);
            if (!seen.has(slotDate)) {
              seen.add(slotDate);
              nearestSlots.push({
                date: slotDate,
                time: slot.startTime.toISOString(),
                provider: slot.providerName,
              });
              if (nearestSlots.length >= 3) break;
            }
          }
        }
      } catch {
        // Range query not supported — fall back to per-day scan with rate protection
        this.logger.warn({ msg: '[PMS] Range availability query failed, falling back to per-day scan' });
        for (let dayOffset = 1; dayOffset <= 7 && nearestSlots.length < 3; dayOffset++) {
          const nextDate = new Date(`${params.date}T00:00:00`);
          nextDate.setDate(nextDate.getDate() + dayOffset);
          const nextDateStr = nextDate.toISOString().slice(0, 10);

          try {
            const nextResult = await sikkaService.checkAvailability({
              date: nextDateStr,
              appointmentType: params.appointmentType || params.type,
              duration: params.duration || 30,
              providerId: params.providerId,
            });

            if (nextResult.success && nextResult.data && nextResult.data.length > 0) {
              nearestSlots.push({
                date: nextDateStr,
                time: nextResult.data[0].startTime.toISOString(),
                provider: nextResult.data[0].providerName,
              });
            }
          } catch (dayErr: any) {
            if (dayErr?.response?.status === 429) {
              this.logger.warn({ msg: '[PMS] Rate limited during day scan, stopping' });
              break;
            }
          }

          // Brief delay between per-day calls to avoid rate bursts
          if (dayOffset < 7 && nearestSlots.length < 3) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      }

      if (nearestSlots.length > 0) {
        return {
          result: {
            success: true,
            requestedDate: params.date,
            requestedDateAvailable: false,
            availableSlots: nearestSlots,
            message: `Unfortunately ${params.date} is fully booked. The nearest available times are: ${nearestSlots.map((s) => `${s.date} at ${s.time}`).join(', ')}. Would any of those work?`,
          },
        };
      }

      return {
        result: {
          success: true,
          requestedDate: params.date,
          requestedDateAvailable: false,
          availableSlots: [],
          message: `We don't have any availability in the next two weeks. Would you like me to take your information and have someone call you when a slot opens up?`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Availability check failed',
        message: "Let me transfer you to our scheduling team.",
      };
    }
  }

  /** @deprecated v3.x — routes to lookupPatient */
  async getPatientInfo(payload: any) {
    return this.lookupPatient(payload);
  }

  /** @deprecated v3.x — routes to lookupPatient */
  async searchPatients(payload: any) {
    return this.lookupPatient(payload);
  }

  /**
   * Unified patient lookup with HIPAA guardrails (v4.0).
   *
   * Replaces both searchPatients and getPatientInfo. Implements:
   * - Caller phone verification (compares caller phone to patient records)
   * - PHI field redaction based on verification status
   * - Single-result filtering for phone-based searches
   * - Family account handling (multiple patients on one phone)
   * - Anti-hallucination disclaimers in every response
   */
  async lookupPatient(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const isOutboundCampaign = !!call?.metadata?.campaignId;
      const callerPhone = this.normalizePhone(call?.customer?.number || '');

      const searchQuery: Record<string, any> = { limit: 10 };

      const rawPhone = params.phone || params.query || '';
      const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(rawPhone.trim());
      if (isPhone) {
        const digits = rawPhone.replace(/\D/g, '');
        const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
        searchQuery.cell = normalized;
        if (rawPhone.trim() !== normalized) {
          this.logger.log({ raw: rawPhone.trim(), normalized, msg: '[lookupPatient] Phone normalized' });
        }
      } else if (params.email) {
        searchQuery.email = params.email;
      } else if (params.firstName || params.lastName || params.name) {
        if (params.name) {
          const parts = params.name.trim().split(/\s+/);
          searchQuery.firstname = parts[0];
          if (parts.length > 1) searchQuery.lastname = parts.slice(1).join(' ');
        } else {
          if (params.firstName) searchQuery.firstname = params.firstName;
          if (params.lastName) searchQuery.lastname = params.lastName;
        }
      } else if (rawPhone.trim()) {
        searchQuery.query = rawPhone.trim();
      } else if (callerPhone) {
        searchQuery.cell = callerPhone;
      }

      const nameForFallback = this.extractNameQuery(params);
      if (nameForFallback) {
        this.logger.log({ nameForFallback, msg: '[lookupPatient] Name available for OR fallback' });
      }

      const hasSearchCriteria = searchQuery.cell || searchQuery.email || searchQuery.firstname || searchQuery.lastname || searchQuery.query;
      if (!hasSearchCriteria && !nameForFallback) {
        this.logger.warn({ params: Object.keys(params), msg: '[lookupPatient] No search criteria — asking caller for info' });
        return {
          result: {
            success: true,
            patients: [],
            count: 0,
            callerVerified: false,
            message: "I don't have enough information to look you up. Could you please provide your name or the phone number you used when booking?",
            _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
          },
        };
      }

      if (!hasSearchCriteria && nameForFallback) {
        searchQuery.firstname = nameForFallback.firstname;
        if (nameForFallback.lastname) searchQuery.lastname = nameForFallback.lastname;
      }

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      const callerCtx = call?.id ? this.getCallerContext(call.id) : undefined;

      if (!phoneRecord?.pmsIntegration) {
        this.logger.log({ msg: '[lookupPatient] No PMS configured — GCal-only mode' });

        const gcalResult: Record<string, any> = {
          success: true,
          patients: [],
          count: 0,
          callerVerified: false,
          integrationType: 'google_calendar',
          _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
        };

        if (callerCtx?.patientType === 'returning' && callerCtx.patientName) {
          gcalResult.callerVerified = true;
          gcalResult.patientName = callerCtx.patientName;
          gcalResult.message = `Welcome back, ${callerCtx.patientName.split(' ')[0]}! How can I help you today?`;
          if (callerCtx.nextBooking) gcalResult.nextBooking = callerCtx.nextBooking;
          if (callerCtx.lastVisitDate) gcalResult.lastVisitInfo = this.formatRelativeDate(callerCtx.lastVisitDate);
          if (callerCtx.lastCallSummary) gcalResult.lastCallSummary = callerCtx.lastCallSummary;
          if (callerCtx.lastCallOutcome) gcalResult.lastCallOutcome = callerCtx.lastCallOutcome;
        } else {
          gcalResult.message = "[SUCCESS] No existing patient record found. [NEXT STEP] Continue with your workflow. If you are booking, call createPatient with the caller's name, email, and phone. If you are managing appointments (cancel/reschedule), call getAppointments with the caller's name or email to find their appointments on the calendar. Do NOT announce 'I didn't find your record' — just proceed with the next action.";
        }

        return { result: gcalResult };
      }

      const { PmsService } = await import('../pms/pms.service');
      const pmsService = new PmsService(this.prisma);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      this.logger.log({
        accountId: phoneRecord.accountId,
        tool: 'lookupPatient',
        pmsInput: searchQuery,
        msg: '[PMS Call] searchPatients request',
      });

      const result = await sikkaService.searchPatients(searchQuery as any);

      this.logger.log({
        accountId: phoneRecord.accountId,
        tool: 'lookupPatient',
        pmsResult: {
          success: result.success,
          count: result.data?.length ?? 0,
          total: result.meta?.total ?? 0,
          error: result.error,
          firstPatient: result.data?.[0] ? { id: result.data[0].id, phone: result.data[0].phone } : null,
        },
        msg: '[PMS Call] searchPatients response',
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        this.logger.error({ accountId: phoneRecord.accountId, errorMsg, pmsError: result.error, msg: '[PMS] searchPatients failed' });
        const searchDesc = JSON.stringify(searchQuery);
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'lookupPatient',
          endpoint: '/patients',
          method: 'GET',
          callId: call.id,
          requestSummary: `lookupPatient params: ${searchDesc}`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Patient search failed');
      }

      let patients = result.data || [];

      if (patients.length === 0 && searchQuery.cell && nameForFallback) {
        this.logger.log({
          accountId: phoneRecord.accountId,
          tool: 'lookupPatient',
          msg: '[lookupPatient] Phone search returned 0 results — retrying with name',
          phoneCriteria: searchQuery.cell,
          nameCriteria: nameForFallback,
        });

        const nameQuery: Record<string, any> = {
          limit: 10,
          firstname: nameForFallback.firstname,
        };
        if (nameForFallback.lastname) nameQuery.lastname = nameForFallback.lastname;

        const nameResult = await sikkaService.searchPatients(nameQuery as any);
        if (nameResult.success && nameResult.data?.length) {
          patients = nameResult.data;
          this.logger.log({
            accountId: phoneRecord.accountId,
            tool: 'lookupPatient',
            msg: `[lookupPatient] Name fallback found ${patients.length} patient(s)`,
          });
        }
      }

      if (patients.length === 0) {
        const searchDesc = JSON.stringify(searchQuery);
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'lookupPatient',
          endpoint: '/patients',
          method: 'GET',
          callId: call.id,
          requestSummary: `lookupPatient: no results for ${searchDesc}`,
          responseStatus: 200,
          responseTime,
          phiAccessed: false,
        });

        return {
          result: {
            success: true,
            patients: [],
            count: 0,
            callerVerified: false,
            message: "I don't see a record matching that information. Would you like me to create a new patient profile?",
            _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
          },
        };
      }

      const isPhoneQuery = !!searchQuery.cell;
      const phoneMatchedPatients = callerPhone
        ? patients.filter((p: any) => this.normalizePhone(p.phone) === callerPhone)
        : [];

      let callerVerified = phoneMatchedPatients.length > 0;

      // Outbound campaign calls: we initiated the call and already know the patient
      // from the campaign data. Phone verification is meaningless here because
      // customer.number is the dialed number (may be an admin test phone).
      if (!callerVerified && isOutboundCampaign && patients.length === 1) {
        callerVerified = true;
        this.logger.log({
          callId: call?.id,
          campaignId: call?.metadata?.campaignId,
          patientId: patients[0].id,
          msg: '[lookupPatient] Outbound campaign call — auto-verifying single patient match',
        });
      }

      const matchedSet = callerVerified ? (phoneMatchedPatients.length > 0 ? phoneMatchedPatients : patients) : patients;

      // Family account: multiple patients on the same phone
      if (callerVerified && matchedSet.length > 1) {
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'lookupPatient',
          endpoint: '/patients',
          method: 'GET',
          callId: call.id,
          requestSummary: `lookupPatient: family account — ${matchedSet.length} patients on caller phone`,
          responseStatus: 200,
          responseTime,
          phiAccessed: true,
        });

        return {
          result: {
            success: true,
            callerVerified: true,
            familyAccount: true,
            patients: matchedSet.map((p: any) => ({
              id: p.id,
              firstName: p.firstName,
            })),
            count: matchedSet.length,
            message: `I found ${matchedSet.length} patients on this phone number. Which family member are you calling about?`,
            relationshipNote: 'Multiple patients found on this phone number. Ask which family member they need help with.',
            _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
          },
        };
      }

      // Caller verified — return full (but redacted) record for the single match
      if (callerVerified) {
        const patient = matchedSet[0];

        if (call?.id) {
          this.cachePatient(call.id, {
            firstName: patient.firstName,
            lastName: patient.lastName,
            phone: patient.phone,
            email: patient.email,
            patientId: patient.id,
            cachedAt: Date.now(),
          });
        }

        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'lookupPatient',
          endpoint: '/patients',
          method: 'GET',
          callId: call.id,
          requestSummary: 'lookupPatient: caller verified via phone match',
          responseStatus: 200,
          responseTime,
          phiAccessed: true,
        });

        const lastVisitDesc = patient.lastVisit
          ? this.formatRelativeDate(patient.lastVisit)
          : undefined;

        const verifiedResult: Record<string, any> = {
          success: true,
          callerVerified: true,
          patient: {
            id: patient.id,
            name: `${patient.firstName} ${patient.lastName}`,
            email: patient.email,
            dateOfBirth: patient.dateOfBirth,
            lastVisitInfo: lastVisitDesc,
            balance: patient.balance,
          },
          message: `Welcome back, ${patient.firstName}!`,
          _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
          _balanceNote: patient.balance != null
            ? 'Do not interpret or comment on whether the balance is high or low. Simply state the amount if the caller asks.'
            : undefined,
        };

        if (callerCtx) {
          if (callerCtx.nextBooking) verifiedResult.nextBooking = callerCtx.nextBooking;
          if (callerCtx.lastVisitDate) verifiedResult.lastVisitInfo = this.formatRelativeDate(callerCtx.lastVisitDate);
          if (callerCtx.lastCallSummary) verifiedResult.lastCallSummary = callerCtx.lastCallSummary;
          if (callerCtx.lastCallOutcome) verifiedResult.lastCallOutcome = callerCtx.lastCallOutcome;
        }

        return { result: verifiedResult };
      }

      // NOT verified — phone-based search that didn't match caller, or name-based search
      // Return minimal info only (no PHI beyond name + id)
      if (isPhoneQuery) {
        const patient = patients[0];

        // Cache patient data even when not verified so booking fallback can use the name
        if (call?.id) {
          this.cachePatient(call.id, {
            firstName: patient.firstName,
            lastName: patient.lastName,
            phone: patient.phone,
            email: patient.email,
            patientId: patient.id,
            cachedAt: Date.now(),
          });
        }

        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'lookupPatient',
          endpoint: '/patients',
          method: 'GET',
          callId: call.id,
          requestSummary: 'lookupPatient: phone search — caller NOT verified (phone mismatch)',
          responseStatus: 200,
          responseTime,
          phiAccessed: true,
        });

        return {
          result: {
            success: true,
            callerVerified: false,
            patient: {
              id: patient.id,
              name: `${patient.firstName} ${patient.lastName}`,
            },
            message: `I found a record but could not verify your identity. To protect your privacy, can you please confirm the date of birth on file?`,
            _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
          },
        };
      }

      // Name-based search — never return individual records to unverified callers
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'lookupPatient',
        endpoint: '/patients',
        method: 'GET',
        callId: call.id,
        requestSummary: `lookupPatient: name search — ${patients.length} results, caller NOT verified`,
        responseStatus: 200,
        responseTime,
        phiAccessed: false,
      });

      return {
        result: {
          success: true,
          callerVerified: false,
          found: true,
          count: patients.length,
          message: `I found ${patients.length} record(s). To protect your privacy, can you confirm the phone number on file so I can pull up the right account?`,
          _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient lookup failed',
        message: "I'm having trouble searching our records. Let me take your information manually.",
        _hipaa: ANTI_HALLUCINATION_DISCLAIMER,
      };
    }
  }

  private normalizePhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  }

  /**
   * Convert a raw date into a relative description so the AI
   * cannot mistake it for an appointment date to book.
   */
  private formatRelativeDate(dateInput: string | Date): string {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return 'Unknown';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const months = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
    const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    if (months < 1) return `Recently (${monthName}) — HISTORICAL, not an appointment date`;
    if (months < 12) return `About ${months} month(s) ago (${monthName}) — HISTORICAL, not an appointment date`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    const yStr = years === 1 ? '1 year' : `${years} years`;
    const desc = rem > 0 ? `${yStr} and ${rem} month(s)` : yStr;
    return `About ${desc} ago (${monthName}) — HISTORICAL, not an appointment date`;
  }

  private extractNameQuery(params: any): { firstname: string; lastname?: string } | null {
    const nameRaw = params.name || '';
    if (nameRaw.trim()) {
      const parts = nameRaw.trim().split(/\s+/);
      return { firstname: parts[0], lastname: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
    }
    if (params.firstName || params.lastName) {
      return { firstname: params.firstName, lastname: params.lastName };
    }
    return null;
  }

  /**
   * Create a new patient record
   */
  async createPatient(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      if (!phoneRecord?.pmsIntegration) {
        const callerPhone = call?.customer?.number;
        const patientPhone = params.phone || callerPhone;
        const patientName = `${params.firstName || ''} ${params.lastName || ''}`.trim() || 'Patient';
        const patientId = `gcal-${Date.now()}`;
        const callId = call?.id;

        this.logger.log({ patientName, email: params.email || 'no email', phone: patientPhone, msg: '[createPatient] No PMS — GCal-only mode' });

        if (callId) {
          this.cachePatient(callId, {
            firstName: params.firstName || '',
            lastName: params.lastName || '',
            phone: patientPhone,
            email: params.email,
            patientId,
            cachedAt: Date.now(),
          });
        }

        return {
          result: {
            success: true,
            patient: {
              id: patientId,
              name: patientName,
              phone: patientPhone,
              email: params.email,
            },
            integrationType: 'google_calendar',
            message: `[SUCCESS] Patient ready. [NEXT STEP] Call bookAppointment with patientId="${patientId}". Say something brief like "Perfect, let me book that for you now" and then call bookAppointment. Do NOT mention the patient profile — go straight to booking.`,
          },
        };
      }

      const { PmsService } = await import('../pms/pms.service');
      const pmsService = new PmsService(this.prisma);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      // Use caller's phone from Vapi call metadata if not explicitly provided
      const callerPhone = call?.customer?.number;
      const patientPhone = params.phone || callerPhone;

      const createInput = {
        firstName: params.firstName,
        lastName: params.lastName,
        phone: patientPhone,
        email: params.email,
        dateOfBirth: params.dateOfBirth,
        address: params.address,
        notes: params.notes,
      };

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'createPatient',
        pmsInput: { ...createInput, phone: createInput.phone ? '***' : undefined },
        msg: '[PMS Call] createPatient request',
      });

      const result = await sikkaService.createPatient(createInput);

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'createPatient',
        pmsResult: { success: result.success, hasData: !!result.data, error: result.error },
        msg: '[PMS Call] createPatient response',
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        this.logger.error({ accountId: phoneRecord.accountId, errorMsg, pmsError: result.error, msg: '[PMS] createPatient writeback failed' });
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'createPatient',
          endpoint: '/patients',
          method: 'POST',
          callId: call.id,
          requestSummary: `Attempted to create patient: ${params.firstName} ${params.lastName}`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });

        // PMS write failed — fall back to GCal-only mode so bookAppointment can still succeed
        const callerPhone = call?.customer?.number;
        const fallbackPhone = params.phone || callerPhone;
        const fallbackName = `${params.firstName || ''} ${params.lastName || ''}`.trim() || 'Patient';
        const fallbackId = `gcal-${Date.now()}`;

        this.logger.warn({
          accountId: phoneRecord.accountId,
          patientName: fallbackName,
          msg: '[createPatient] PMS failed — falling back to GCal-only patient with synthetic ID',
        });

        if (call?.id) {
          this.cachePatient(call.id, {
            firstName: params.firstName || '',
            lastName: params.lastName || '',
            phone: fallbackPhone,
            email: params.email,
            patientId: fallbackId,
            cachedAt: Date.now(),
          });
        }

        return {
          result: {
            success: true,
            patient: {
              id: fallbackId,
              name: fallbackName,
              phone: fallbackPhone,
              email: params.email,
            },
            integrationType: 'google_calendar',
            message: `[SUCCESS] Patient ready. [NEXT STEP] Call bookAppointment with patientId="${fallbackId}". Say something brief like "Perfect, let me book that for you now" and then call bookAppointment. Do NOT mention the patient profile — go straight to booking.`,
          },
        };
      }

      const patient = result.data!;

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'createPatient',
        endpoint: '/patients',
        method: 'POST',
        callId: call.id,
        requestSummary: `Created new patient record`,
        responseStatus: 201,
        responseTime,
        phiAccessed: true,
      });

      this.logAiAction({
        accountId: phoneRecord.accountId,
        source: 'pms',
        action: 'create_patient',
        category: 'patient',
        callId: call?.id,
        externalResourceId: patient.id,
        externalResourceType: 'patient',
        summary: 'Created new patient record',
        pmsProvider: phoneRecord.pmsIntegration?.provider,
      }).catch(() => {});

      return {
        result: {
          success: true,
          patient: {
            id: patient.id,
            name: `${patient.firstName} ${patient.lastName}`,
          },
          message: `I've created your patient profile, ${patient.firstName}. Now, what type of appointment would you like, and when works best for you?`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient creation failed',
        message: "I'm having trouble creating your profile. Let me transfer you to our front desk.",
      };
    }
  }

  /**
   * Update existing patient information
   */
  async updatePatient(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      if (!phoneRecord?.pmsIntegration) {
        return this.updatePatientViaGoogleCalendar(phoneRecord, params, call);
      }

      const { PmsService } = await import('../pms/pms.service');
      const pmsService = new PmsService(this.prisma);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      const updateData: any = {};
      if (params.phone) updateData.phone = params.phone;
      if (params.email) updateData.email = params.email;
      if (params.address) updateData.address = params.address;

      const result = await sikkaService.updatePatient(params.patientId, updateData);

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'updatePatient',
          endpoint: `/patients/${params.patientId}`,
          method: 'PUT',
          callId: call.id,
          requestSummary: `Attempted to update patient information`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Patient update failed');
      }

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'updatePatient',
        endpoint: `/patients/${params.patientId}`,
        method: 'PUT',
        callId: call.id,
        requestSummary: `Updated patient information`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
      });

      this.logAiAction({
        accountId: phoneRecord.accountId,
        source: 'pms',
        action: 'update_patient',
        category: 'patient',
        callId: call?.id,
        externalResourceId: params.patientId,
        externalResourceType: 'patient',
        summary: `Updated patient record (fields: ${Object.keys(updateData).join(', ')})`,
        pmsProvider: phoneRecord.pmsIntegration?.provider,
      }).catch(() => {});

      return {
        result: {
          success: true,
          message: "I've updated your information successfully.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient update failed',
        message: "I'm having trouble updating your information. Let me transfer you to our front desk.",
      };
    }
  }

  /**
   * Cancel an existing appointment
   * Sikka API: DELETE /appointments/{appointmentId}
   * Params: { appointmentId, reason? }
   */
  async cancelAppointment(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      if (!phoneRecord?.pmsIntegration) {
        // ── Google Calendar Fallback ──
        return this.cancelAppointmentViaGoogleCalendar(phoneRecord, params);
      }

      const { PmsService } = await import('../pms/pms.service');
      const pmsService = new PmsService(this.prisma);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'cancelAppointment',
        pmsInput: { appointmentId: params.appointmentId, reason: params.reason },
        msg: '[PMS Call] cancelAppointment request',
      });

      const result = await sikkaService.cancelAppointment(
        params.appointmentId,
        { reason: params.reason || 'Patient requested cancellation' }
      );

      this.logger.verbose({
        accountId: phoneRecord.accountId,
        tool: 'cancelAppointment',
        pmsResult: { success: result.success, error: result.error },
        msg: '[PMS Call] cancelAppointment response',
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        this.logger.error({ accountId: phoneRecord.accountId, errorMsg, pmsError: result.error, msg: '[PMS] cancelAppointment writeback failed' });
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'cancelAppointment',
          endpoint: `/appointments/${params.appointmentId}/cancel`,
          method: 'POST',
          callId: call.id,
          requestSummary: `Attempted to cancel appointment`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Appointment cancellation failed');
      }

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'cancelAppointment',
        endpoint: `/appointments/${params.appointmentId}/cancel`,
        method: 'POST',
        callId: call.id,
        requestSummary: `Cancelled appointment: ${params.reason || 'Patient requested'}`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
      });

      this.logAiAction({
        accountId: phoneRecord.accountId,
        source: 'pms',
        action: 'cancel_appointment',
        category: 'appointment',
        callId: call?.id,
        externalResourceId: params.appointmentId,
        externalResourceType: 'appointment',
        summary: `Cancelled appointment${params.reason ? `: ${params.reason}` : ''}`,
        pmsProvider: phoneRecord.pmsIntegration?.provider,
      }).catch(() => {});

      return {
        result: {
          success: true,
          message: "Your appointment has been cancelled successfully. Would you like to reschedule for another time?",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Appointment cancellation failed',
        message: "I'm having trouble cancelling your appointment. Let me transfer you to our scheduling team.",
      };
    }
  }

  // ============================================================================
  // New handlers - matching Sikka API methods
  // ============================================================================

  /**
   * Get a patient's appointments
   * Sikka API: GET /appointments?patientId=xxx
   * Params: { patientId, startDate?, endDate? }
   */
  async getAppointments(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) {
        // ── Google Calendar Fallback ──
        return this.getAppointmentsViaGoogleCalendar(call, params, sikkaService.accountId);
      }

      const today = new Date();
      const ninetyDaysOut = new Date(today);
      ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

      const result = await sikkaService.service.getAppointments({
        patientId: params.patientId,
        startDate: params.startDate ? new Date(params.startDate) : today,
        endDate: params.endDate ? new Date(params.endDate) : ninetyDaysOut,
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get appointments');
      }

      const appointments = result.data || [];

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getAppointments',
        endpoint: '/appointments',
        method: 'GET',
        callId: call.id,
        requestSummary: `Retrieved ${appointments.length} appointments for patient`,
        responseStatus: 200,
        responseTime,
        phiAccessed: appointments.length > 0,
      });

      return {
        result: {
          success: true,
          appointments: appointments.map((apt: any) => ({
            id: apt.id,
            date: apt.startTime,
            type: apt.appointmentType,
            provider: apt.providerName || apt.providerId,
            status: apt.status,
            duration: apt.duration,
          })),
          count: appointments.length,
          message: appointments.length > 0
            ? `I found ${appointments.length} upcoming appointment(s).`
            : "I don't see any upcoming appointments on your record.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to retrieve appointments',
        message: "I'm having trouble looking up your appointments. Can you tell me more about the appointment you're looking for?",
      };
    }
  }

  /**
   * Reschedule an existing appointment
   * Sikka API: PATCH /appointments/{appointmentId}
   * Params: { appointmentId, startTime (ISO 8601), duration?, providerId?, notes? }
   */
  async rescheduleAppointment(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) {
        // ── Google Calendar Fallback ──
        return this.rescheduleAppointmentViaGoogleCalendar(call, params, sikkaService.accountId);
      }

      const updates: any = {};
      if (params.startTime) updates.startTime = new Date(params.startTime);
      if (params.duration) updates.duration = params.duration;
      if (params.providerId) updates.providerId = params.providerId;
      if (params.notes) updates.notes = params.notes;

      const result = await sikkaService.service.rescheduleAppointment(
        params.appointmentId,
        updates,
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        this.logger.error({ accountId: sikkaService.accountId, errorMsg, pmsError: result.error, msg: '[PMS] rescheduleAppointment writeback failed' });
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: sikkaService.pmsIntegrationId,
          action: 'rescheduleAppointment',
          endpoint: `/appointments/${params.appointmentId}`,
          method: 'PATCH',
          callId: call.id,
          requestSummary: `Attempted to reschedule appointment`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });

        const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);
        if (phoneRecord) {
          return this.handlePmsRescheduleFailure(phoneRecord, params, call, errorMsg || 'Reschedule failed');
        }
        return {
          error: 'Reschedule failed',
          message: "I'm having trouble rescheduling. Our team will follow up with you shortly to confirm.",
        };
      }

      const appointment = result.data;

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'rescheduleAppointment',
        endpoint: `/appointments/${params.appointmentId}`,
        method: 'PATCH',
        callId: call.id,
        requestSummary: `Rescheduled appointment to ${params.startTime}`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
      });

      this.logAiAction({
        accountId: sikkaService.accountId!,
        source: 'pms',
        action: 'reschedule_appointment',
        category: 'appointment',
        callId: call?.id,
        externalResourceId: params.appointmentId,
        externalResourceType: 'appointment',
        appointmentTime: params.startTime,
        appointmentType: appointment?.appointmentType,
        providerName: appointment?.providerName || params.providerId,
        duration: params.duration,
        summary: `Rescheduled appointment to ${params.startTime}${appointment?.providerName ? ` with ${appointment.providerName}` : ''}`,
        pmsProvider: 'sikka',
      }).catch(() => {});

      // Fire-and-forget: send reschedule confirmation (SMS + email)
      this.sendRescheduleNotification({
        accountId: sikkaService.accountId!,
        callId: call?.id,
        callerPhone: call?.from_number || call?.retell_llm_dynamic_variables?.from_number,
        newStartTime: new Date(params.startTime),
        duration: params.duration || 30,
        appointmentType: appointment?.appointmentType,
        integrationType: 'pms',
      });

      return {
        result: {
          success: true,
          appointment: appointment ? {
            id: appointment.id,
            date: appointment.startTime,
            type: appointment.appointmentType,
            provider: appointment.providerName,
          } : null,
          message: `Your appointment has been rescheduled to ${new Date(params.startTime).toLocaleString()}.`,
        },
      };
    } catch (error: any) {
      this.logger.error(error);

      // Even on unexpected errors, try the fallback if we have a phone record
      try {
        const { call, message } = payload;
        const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};
        const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);
        if (phoneRecord) {
          this.logger.log({ msg: '[PMS] Attempting reschedule fallback after unexpected error' });
          return this.handlePmsRescheduleFailure(phoneRecord, params, call, error?.message || 'Unexpected error');
        }
      } catch {
        // Fallback itself failed — return the original error
      }

      return {
        error: 'Reschedule failed',
        message: "I'm having trouble rescheduling. Our team will follow up with you shortly to confirm.",
      };
    }
  }

  /**
   * Add a note to a patient's record
   * Sikka API: POST /medical_notes
   * Params: { patientId, content, category? }
   */
  async addPatientNote(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const phoneRecord = await this.resolvePhoneRecord(call, payload.accountId);

      if (!phoneRecord?.pmsIntegration) {
        this.logger.log({ note: (params.content || '').slice(0, 100), msg: '[addPatientNote] No PMS — GCal-only mode' });
        return {
          result: {
            success: true,
            integrationType: 'google_calendar',
            message: "I've noted that information. It will be included in your appointment details.",
          },
        };
      }

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) {
        return sikkaService.error || {
          error: 'PMS not available',
          message: "I'll make sure our team gets that information.",
        };
      }

      const result = await sikkaService.service.addPatientNote(
        params.patientId,
        {
          content: params.content,
          category: params.category || 'general',
          createdBy: 'AI Agent',
        },
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to add note');
      }

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'addPatientNote',
        endpoint: '/medical_notes',
        method: 'POST',
        callId: call.id,
        requestSummary: `Added ${params.category || 'general'} note to patient record`,
        responseStatus: 201,
        responseTime,
        phiAccessed: true,
      });

      this.logAiAction({
        accountId: sikkaService.accountId!,
        source: 'pms',
        action: 'add_note',
        category: 'note',
        callId: call?.id,
        externalResourceId: params.patientId,
        externalResourceType: 'patient',
        summary: `Added ${params.category || 'general'} note to patient record`,
        pmsProvider: 'sikka',
      }).catch(() => {});

      return {
        result: {
          success: true,
          message: "I've added that note to your file.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to add note',
        message: "I'll make sure our team gets that information.",
      };
    }
  }

  /**
   * Get patient's insurance information
   * Sikka API: GET /patients/{patientId}/insurance
   * Params: { patientId }
   */
  async getPatientInsurance(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.getPatientInsurance(params.patientId);

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get insurance');
      }

      const insuranceRecords = result.data || [];

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getPatientInsurance',
        endpoint: `/patients/${params.patientId}/insurance`,
        method: 'GET',
        callId: call.id,
        requestSummary: `Retrieved insurance information`,
        responseStatus: 200,
        responseTime,
        phiAccessed: insuranceRecords.length > 0,
      });

      return {
        result: {
          success: true,
          insurance: insuranceRecords.map((ins: any) => ({
            provider: ins.provider,
            policyNumber: ins.policyNumber,
            isPrimary: ins.isPrimary,
          })),
          count: insuranceRecords.length,
          message: insuranceRecords.length > 0
            ? `I see ${insuranceRecords.length} insurance plan(s) on file.`
            : "I don't see any insurance information on your record.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to get insurance',
        message: "I'm having trouble accessing insurance records. Our billing team can help with that.",
      };
    }
  }

  /**
   * Get patient's account balance
   * Sikka API: GET /patient_balance?patient_id={patientId}
   * Params: { patientId }
   */
  async getPatientBalance(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.getPatientBalance(params.patientId);

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get balance');
      }

      const balance = result.data;

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getPatientBalance',
        endpoint: '/patient_balance',
        method: 'GET',
        callId: call.id,
        requestSummary: `Retrieved patient balance`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
      });

      return {
        result: {
          success: true,
          balance: balance,
          message: balance
            ? `Your current balance is $${(balance as any).amount || 0}.`
            : "I don't see a balance on your account.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to get balance',
        message: "I'm unable to pull up balance information right now. Our billing team can help with that.",
      };
    }
  }

  /**
   * Get list of providers
   * Sikka API: GET /providers
   * Params: none
   */
  async getProviders(payload: any) {
    const startTime = Date.now();
    try {
      const { call } = payload;

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) {
        return sikkaService.error || {
          error: 'PMS not available',
          message: "I don't have access to our provider list right now. Let me take a message and have our team get back to you.",
        };
      }

      const result = await sikkaService.service.getProviders();

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get providers');
      }

      const providers = result.data || [];

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getProviders',
        endpoint: '/providers',
        method: 'GET',
        callId: call.id,
        requestSummary: `Retrieved ${providers.length} providers`,
        responseStatus: 200,
        responseTime,
        phiAccessed: false,
      });

      return {
        result: {
          success: true,
          providers: providers.map((p: any) => ({
            id: p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name,
            specialty: p.specialty,
          })),
          count: providers.length,
          message: `We have ${providers.length} provider(s) available.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to get providers',
        message: "I'm having trouble looking up our providers. Let me help you another way.",
      };
    }
  }

  // ============================================================================
  // Helper: Get Sikka service from Vapi call context
  // Eliminates repeated boilerplate across handlers
  // ============================================================================

  /**
   * Resolve PMS integration for an account (provider-agnostic).
   * Used when we have an accountId but no VapiPhoneNumber record
   * (e.g. Retell calls).
   */
  private async resolvePmsForAccount(accountId: string) {
    return this.prisma.pmsIntegration.findFirst({
      where: { accountId },
    });
  }

  /**
   * Unified save (add or update) insurance — routes based on presence of insuranceId.
   */
  async saveInsurance(payload: any) {
    const params = payload?.message?.functionCall?.parameters
      || payload?.functionCall?.parameters || {};
    if (params.insuranceId) {
      return this.updatePatientInsurance(payload);
    }
    return this.addPatientInsurance(payload);
  }

  /**
   * Add insurance to a patient record
   * Params: { patientId, provider, policyNumber, groupNumber, subscriberName, isPrimary }
   */
  async addPatientInsurance(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.addPatientInsurance(params.patientId, {
        provider: params.provider,
        policyNumber: params.policyNumber,
        groupNumber: params.groupNumber,
        subscriberName: params.subscriberName,
        isPrimary: params.isPrimary ?? true,
      });

      if (!result.success) {
        throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to add insurance');
      }

      return {
        result: {
          success: true,
          insurance: result.data,
          message: `Insurance has been added successfully for ${params.provider}.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return { error: 'Failed to add insurance', message: "I'm having trouble adding insurance information. Our team can help with that." };
    }
  }

  /**
   * Update existing insurance on a patient record
   * Params: { patientId, insuranceId, provider?, policyNumber?, groupNumber? }
   */
  async updatePatientInsurance(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.updatePatientInsurance(params.patientId, params.insuranceId, {
        provider: params.provider,
        policyNumber: params.policyNumber,
        groupNumber: params.groupNumber,
      });

      if (!result.success) {
        throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to update insurance');
      }

      return {
        result: {
          success: true,
          insurance: result.data,
          message: 'Insurance information has been updated.',
        },
      };
    } catch (error) {
      this.logger.error(error);
      return { error: 'Failed to update insurance', message: "I'm having trouble updating insurance information right now." };
    }
  }

  /**
   * Verify insurance coverage eligibility
   * Params: { patientId, insuranceId?, procedureCode? }
   */
  async verifyInsuranceCoverage(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const insuranceResult = await sikkaService.service.getPatientInsurance(params.patientId);
      if (!insuranceResult.success || !insuranceResult.data) {
        return {
          result: {
            success: true,
            verified: false,
            message: "I don't see any insurance on file to verify. Would you like to add insurance information first?",
          },
        };
      }

      return {
        result: {
          success: true,
          verified: true,
          insurance: insuranceResult.data,
          message: 'Insurance is on file. For detailed coverage verification, our billing team can provide specific benefit details.',
        },
      };
    } catch (error) {
      this.logger.error(error);
      return { error: 'Failed to verify coverage', message: "I'm unable to verify coverage right now. Our billing team can help with that." };
    }
  }

  /**
   * Get payment history for a patient
   * Params: { patientId }
   */
  async getPaymentHistory(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.getPaymentHistory(params.patientId);

      if (!result.success) {
        throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to get payment history');
      }

      const payments = result.data || [];

      return {
        result: {
          success: true,
          payments: payments.slice(0, 10),
          count: payments.length,
          message: payments.length > 0
            ? `I can see ${payments.length} recent transaction(s) on your account.`
            : 'No recent transactions found on your account.',
        },
      };
    } catch (error) {
      this.logger.error(error);
      return { error: 'Failed to get payment history', message: "I'm unable to pull up payment history right now." };
    }
  }

  /**
   * Process a payment
   * Params: { patientId, amount, method, last4?, notes? }
   */
  async processPayment(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      const sikkaService = await this.getSikkaService(call, payload.accountId);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.processPayment({
        patientId: params.patientId,
        amount: params.amount,
        method: params.method || 'card',
        last4: params.last4,
        notes: params.notes,
      });

      if (!result.success) {
        throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Payment processing failed');
      }

      return {
        result: {
          success: true,
          payment: result.data,
          message: `Payment of $${params.amount} has been processed successfully.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return { error: 'Payment processing failed', message: "I'm unable to process the payment right now. Our billing team can assist you." };
    }
  }

  /**
   * Create a payment plan for a patient
   * Params: { patientId, totalAmount, numberOfPayments, frequency?, startDate? }
   */
  async createPaymentPlan(payload: any) {
    try {
      const { call, message } = payload;
      const params = message?.functionCall?.parameters || payload?.functionCall?.parameters || {};

      this.logger.log({ patientId: params.patientId, totalAmount: params.totalAmount, numberOfPayments: params.numberOfPayments, msg: '[createPaymentPlan] Creating plan' });

      const monthlyAmount = (params.totalAmount / params.numberOfPayments).toFixed(2);

      return {
        result: {
          success: true,
          plan: {
            patientId: params.patientId,
            totalAmount: params.totalAmount,
            numberOfPayments: params.numberOfPayments,
            monthlyAmount: parseFloat(monthlyAmount),
            frequency: params.frequency || 'monthly',
            startDate: params.startDate || new Date().toISOString(),
          },
          message: `A payment plan of $${monthlyAmount} per month for ${params.numberOfPayments} months (total: $${params.totalAmount}) has been noted. Our billing team will finalize the details and follow up with you.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return { error: 'Failed to create payment plan', message: "I'm unable to set up a payment plan right now. Our billing team can help arrange one for you." };
    }
  }

  private async getSikkaService(call: any, fallbackAccountId?: string): Promise<{
    service: any;
    pmsIntegrationId: string;
    accountId?: string;
    error?: any;
  }> {
    try {
      // 1. Try VapiPhoneNumber (Vapi calls)
      if (call?.phoneNumberId) {
        const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
          where: { vapiPhoneId: call.phoneNumberId },
          include: { pmsIntegration: true },
        });
        if (phoneRecord?.pmsIntegration) {
          const { PmsService } = await import('../pms/pms.service');
          const pmsService = new PmsService(this.prisma);
          const service = await pmsService.getPmsService(
            phoneRecord.accountId,
            phoneRecord.pmsIntegration.provider,
            phoneRecord.pmsIntegration.config,
          );
          return { service, pmsIntegrationId: phoneRecord.pmsIntegration.id, accountId: phoneRecord.accountId };
        }
        if (phoneRecord) {
          return { service: null, pmsIntegrationId: '', accountId: phoneRecord.accountId };
        }
      }

      // 2. Resolve accountId from Retell agent or fallback
      let accountId = fallbackAccountId;
      if (!accountId && call?.agent_id) {
        const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
          where: { retellAgentId: call.agent_id },
          select: { accountId: true },
        });
        accountId = retellPhone?.accountId;
      }

      if (accountId) {
        const pmsIntegration = await this.resolvePmsForAccount(accountId);
        if (pmsIntegration) {
          const { PmsService } = await import('../pms/pms.service');
          const pmsService = new PmsService(this.prisma);
          const service = await pmsService.getPmsService(
            accountId,
            pmsIntegration.provider,
            pmsIntegration.config,
          );
          return { service, pmsIntegrationId: pmsIntegration.id, accountId };
        }
        return { service: null, pmsIntegrationId: '', accountId };
      }

      return { service: null, pmsIntegrationId: '' };
    } catch (error) {
      this.logger.error(error);
      return {
        service: null,
        pmsIntegrationId: '',
        error: {
          error: 'PMS connection failed',
          message: "I'm having trouble connecting to our system. Let me take your information and someone will follow up.",
        },
      };
    }
  }

  // ============================================================================
  // Google Calendar Fallback Methods
  // When PMS is not connected but Google Calendar is, use Calendar as fallback
  // ============================================================================

  /**
   * Helper: Get accountId from call context (supports both Vapi and Retell)
   */
  private async getAccountIdFromCall(call: any, fallbackAccountId?: string): Promise<string | null> {
    if (fallbackAccountId) return fallbackAccountId;

    // Vapi: lookup by phoneNumberId
    if (call?.phoneNumberId) {
      const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        select: { accountId: true },
      });
      if (vapiPhone) return vapiPhone.accountId;
    }

    // Retell: lookup by agent_id
    if (call?.agent_id) {
      const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
        where: { retellAgentId: call.agent_id },
        select: { accountId: true },
      });
      if (retellPhone) return retellPhone.accountId;
    }

    return null;
  }

  /**
   * Helper: Check if Google Calendar is available as fallback for an account
   */
  /**
   * Resolve the phone record from vapiPhoneNumber table.
   * Falls back to using the pre-resolved accountId from the webhook controller
   * when the vapiPhoneNumber table is out of sync.
   */
  private async resolvePhoneRecord(call: any, fallbackAccountId?: string) {
    // 1. Try VapiPhoneNumber (Vapi calls have phoneNumberId)
    if (call?.phoneNumberId) {
      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true, account: true },
      });
      if (phoneRecord) return phoneRecord;
    }

    // 2. Try RetellPhoneNumber by agent_id (Retell calls)
    if (call?.agent_id) {
      const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
        where: { retellAgentId: call.agent_id },
        include: { account: true },
      });
      if (retellPhone) {
        const pmsIntegration = await this.resolvePmsForAccount(retellPhone.accountId);
        return {
          accountId: retellPhone.accountId,
          phoneNumber: retellPhone.phoneNumber,
          pmsIntegration,
          account: retellPhone.account,
        } as any;
      }
    }

    // 3. Fallback: use the pre-resolved accountId from the webhook controller
    if (fallbackAccountId) {
      this.logger.warn(
        `[resolvePhoneRecord] No phone record found, using fallback accountId=${fallbackAccountId}`,
      );
      const [account, pmsIntegration] = await Promise.all([
        this.prisma.account.findUnique({ where: { id: fallbackAccountId } }),
        this.resolvePmsForAccount(fallbackAccountId),
      ]);
      return {
        accountId: fallbackAccountId,
        vapiPhoneId: call?.phoneNumberId,
        pmsIntegration,
        account,
      } as any;
    }

    return null;
  }

  private async isGoogleCalendarAvailable(accountId: string | null | undefined): Promise<boolean> {
    if (!accountId) {
      this.logger.warn({ msg: '[GCal Check] No accountId provided' });
      return false;
    }
    if (!this.googleCalendar.isConfigured()) {
      this.logger.warn({ accountId, msg: '[GCal Check] Google Calendar service not configured (missing env vars)' });
      return false;
    }
    const connected = await this.googleCalendar.isConnectedForAccount(accountId);
    if (!connected) {
      this.logger.warn({ accountId, msg: '[GCal Check] Account has no Google Calendar connection (no OAuth tokens)' });
    }
    return connected;
  }

  /**
   * Handle PMS booking failure: try to create a backup GCal event,
   * then send an email to the clinic with the appointment details.
   * Returns success to the AI so the caller is told "confirmed".
   */
  private async handlePmsBookingFailure(
    phoneRecord: any,
    params: any,
    call: any,
    pmsErrorMessage: string,
  ) {
    const accountId = phoneRecord?.accountId;
    const callerPhone = call?.customer?.number;
    let startTime = this.parseBookingStartTime(params);
    const now = new Date();
    const duration = params.duration || 30;
    const appointmentType = params.appointmentType || params.type || 'General';

    if (startTime < now) {
      const originalTime = startTime.toISOString();
      const hours = startTime.getUTCHours();
      const minutes = startTime.getUTCMinutes();
      const hasIntendedTime = hours !== 0 || minutes !== 0;

      if (hasIntendedTime) {
        // Preserve the intended time, move to today or tomorrow
        const corrected = new Date(now);
        corrected.setUTCHours(hours, minutes, 0, 0);
        if (corrected <= now) {
          corrected.setUTCDate(corrected.getUTCDate() + 1);
        }
        startTime = corrected;
        this.logger.warn({ originalTime, correctedTo: startTime.toISOString(), msg: '[PMS Fallback] AI sent past date — preserving intended time, moved to next occurrence' });
      } else {
        startTime = new Date(now.getTime() + 60 * 60 * 1000);
        this.logger.warn({ originalTime, correctedTo: startTime.toISOString(), msg: '[PMS Fallback] AI sent past startTime with no time component — adjusting to now + 1hr' });
      }
    }

    const callId = call?.id;
    const cached = callId ? this.getCachedPatient(callId) : undefined;

    let patientFirstName = params.firstName || '';
    let patientLastName = params.lastName || '';

    if (!patientFirstName && params.patientName) {
      const parts = params.patientName.trim().split(/\s+/);
      patientFirstName = parts[0] || '';
      patientLastName = parts.slice(1).join(' ') || '';
    }
    if (!patientFirstName && params.name) {
      const parts = params.name.trim().split(/\s+/);
      patientFirstName = parts[0] || '';
      patientLastName = parts.slice(1).join(' ') || '';
    }
    if (!patientFirstName && cached) {
      patientFirstName = cached.firstName || '';
      patientLastName = cached.lastName || '';
    }
    if (!patientFirstName) patientFirstName = 'Patient';

    const patientPhone = params.phone || cached?.phone || callerPhone;
    const patientEmail = params.email || params.patientEmail || cached?.email;

    let gcalBackupCreated = false;
    let gcalEventLink: string | undefined;
    let gcalEventId: string | undefined;

    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);
    if (gcAvailable) {
      try {
        const gcalResult = await this.googleCalendar.createAppointmentEvent(
          accountId,
          {
            patient: {
              firstName: patientFirstName,
              lastName: patientLastName,
              phone: patientPhone,
              email: patientEmail,
            },
            appointmentType,
            startTime,
            duration,
            notes: `[PMS BACKUP] Original PMS writeback failed. ${params.notes || ''}`.trim(),
            providerId: params.providerId,
          },
        );
        gcalBackupCreated = true;
        gcalEventLink = gcalResult.htmlLink || undefined;
        gcalEventId = gcalResult.eventId ?? undefined;
        this.logger.log({ accountId, eventId: gcalResult.eventId, msg: '[PMS Fallback] Backup GCal event created' });

        this.logAiAction({
          accountId,
          source: 'gcal',
          action: 'book_appointment',
          category: 'appointment',
          callId,
          externalResourceId: gcalResult.eventId ?? undefined,
          externalResourceType: 'event',
          appointmentTime: startTime.toISOString(),
          appointmentType,
          duration,
          summary: `Booked ${appointmentType} appointment via GCal (PMS writeback failed)`,
          calendarEventId: gcalResult.eventId ?? undefined,
          pmsProvider: phoneRecord.pmsIntegration?.provider,
        }).catch(() => {});
      } catch (gcalError: any) {
        this.logger.error({ accountId, error: gcalError?.message, msg: '[PMS Fallback] Failed to create backup GCal event' });
      }
    }

    this.notifications.sendPmsFailureNotification({
      accountId,
      patient: {
        firstName: patientFirstName,
        lastName: patientLastName,
        phone: patientPhone,
        email: patientEmail,
      },
      appointment: {
        appointmentType,
        startTime,
        duration,
        notes: params.notes,
      },
      pmsErrorMessage,
      gcalBackupCreated,
      gcalEventLink,
    }).catch((err) => {
      this.logger.error({ error: err?.message, msg: '[PMS Fallback] Email notification also failed' });
    });

    if (gcalBackupCreated) {
      this.notifications.sendAppointmentConfirmation({
        accountId,
        patient: {
          firstName: patientFirstName,
          lastName: patientLastName,
          phone: patientPhone,
          email: patientEmail,
        },
        appointment: {
          appointmentType,
          startTime,
          duration,
          notes: params.notes,
          externalEventLink: gcalEventLink,
        },
        integrationType: 'google_calendar',
      }).then(({ emailSent, smsSent }) => {
        this.logger.log({ accountId, emailSent, smsSent, msg: '[PMS Fallback] Patient confirmation sent' });
      }).catch((err) => {
        this.logger.error({ error: err?.message, msg: '[PMS Fallback] Patient confirmation failed (non-fatal)' });
      });
    }

    const confirmationParts: string[] = [];
    if (gcalBackupCreated) {
      if (patientEmail) confirmationParts.push('email confirmation');
      if (patientPhone) confirmationParts.push('text confirmation');
    }
    const confirmationMsg = confirmationParts.length > 0
      ? ` You'll receive a ${confirmationParts.join(' and ')}.`
      : '';

    const fallbackResponse = {
      result: {
        success: true,
        appointmentId: gcalEventId,
        integrationType: gcalBackupCreated ? 'google_calendar_backup' : 'manual_followup',
        message: gcalBackupCreated
          ? `[SUCCESS] Appointment confirmed for ${formatDateForSpeech(startTime)} at ${formatTimeForSpeech(startTime)}.${confirmationMsg} [NEXT STEP] Confirm the appointment type, date, and time. Do NOT say "with [patient name]" — the caller already knows who they are. Then ask "Is there anything else I can help you with?"`
          : `Your appointment has been noted for ${formatDateForSpeech(startTime)} at ${formatTimeForSpeech(startTime)}. Our team will confirm the details shortly. Do NOT say "with [patient name]" — the caller already knows who they are.`,
      },
    };

    this.logger.verbose({
      accountId,
      tool: 'bookAppointment',
      fallbackType: gcalBackupCreated ? 'gcal_backup' : 'manual_followup',
      gcalAvailable: gcAvailable,
      gcalBackupCreated,
      pmsErrorMessage,
      agentResponse: fallbackResponse,
      msg: '[PMS Fallback] Returning response to agent',
    });

    return fallbackResponse;
  }

  /**
   * Handle PMS reschedule failure: try to create a backup GCal event at the new time,
   * then send an email to the clinic with the reschedule details.
   * Returns success to the AI so the caller is told "rescheduled".
   */
  private async handlePmsRescheduleFailure(
    phoneRecord: any,
    params: any,
    call: any,
    pmsErrorMessage: string,
  ) {
    const accountId = phoneRecord?.accountId;
    const callerPhone = call?.customer?.number;
    const rescheduleParams = {
      startTime: params.startTime || params.newStartTime,
      date: params.date || params.newDate,
      datetime: params.datetime,
    };
    let newStartTime = this.parseBookingStartTime(rescheduleParams);
    const now = new Date();
    const duration = params.duration || 30;
    const appointmentType = params.appointmentType || params.type || 'Reschedule';

    if (newStartTime < now) {
      const originalTime = newStartTime.toISOString();
      const hours = newStartTime.getUTCHours();
      const minutes = newStartTime.getUTCMinutes();
      const hasIntendedTime = hours !== 0 || minutes !== 0;

      if (hasIntendedTime) {
        const corrected = new Date(now);
        corrected.setUTCHours(hours, minutes, 0, 0);
        if (corrected <= now) {
          corrected.setUTCDate(corrected.getUTCDate() + 1);
        }
        newStartTime = corrected;
        this.logger.warn({ originalTime, correctedTo: newStartTime.toISOString(), msg: '[PMS Reschedule Fallback] AI sent past date — preserving intended time, moved to next occurrence' });
      } else {
        newStartTime = new Date(now.getTime() + 60 * 60 * 1000);
        this.logger.warn({ originalTime, correctedTo: newStartTime.toISOString(), msg: '[PMS Reschedule Fallback] AI sent past startTime with no time component — adjusting to now + 1hr' });
      }
    }

    const callId = call?.id;
    const cached = callId ? this.getCachedPatient(callId) : undefined;

    let patientFirstName = params.firstName || '';
    let patientLastName = params.lastName || '';

    if (!patientFirstName && params.patientName) {
      const parts = params.patientName.trim().split(/\s+/);
      patientFirstName = parts[0] || '';
      patientLastName = parts.slice(1).join(' ') || '';
    }
    if (!patientFirstName && params.name) {
      const parts = params.name.trim().split(/\s+/);
      patientFirstName = parts[0] || '';
      patientLastName = parts.slice(1).join(' ') || '';
    }
    if (!patientFirstName && cached) {
      patientFirstName = cached.firstName || '';
      patientLastName = cached.lastName || '';
    }
    if (!patientFirstName) patientFirstName = 'Patient';

    const patientPhone = params.phone || cached?.phone || callerPhone;
    const patientEmail = params.email || params.patientEmail || cached?.email;

    let gcalBackupCreated = false;
    let gcalEventLink: string | undefined;
    let gcalEventId: string | undefined;

    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);
    if (gcAvailable) {
      try {
        const gcalResult = await this.googleCalendar.createAppointmentEvent(
          accountId,
          {
            patient: {
              firstName: patientFirstName,
              lastName: patientLastName,
              phone: patientPhone,
              email: patientEmail,
            },
            appointmentType,
            startTime: newStartTime,
            duration,
            notes: `[PMS RESCHEDULE BACKUP] Original PMS reschedule failed. Old appointment ID: ${params.appointmentId || 'unknown'}. ${params.reason || ''}`.trim(),
            providerId: params.providerId,
          },
        );
        gcalBackupCreated = true;
        gcalEventLink = gcalResult.htmlLink || undefined;
        gcalEventId = gcalResult.eventId ?? undefined;
        this.logger.log({ accountId, eventId: gcalResult.eventId, msg: '[PMS Reschedule Fallback] Backup GCal event created' });

        this.logAiAction({
          accountId,
          source: 'gcal',
          action: 'reschedule_appointment',
          category: 'appointment',
          callId,
          externalResourceId: gcalResult.eventId ?? undefined,
          externalResourceType: 'event',
          appointmentTime: newStartTime.toISOString(),
          appointmentType,
          duration,
          summary: `Rescheduled to ${appointmentType} appointment via GCal (PMS writeback failed). Old ID: ${params.appointmentId || 'unknown'}`,
          calendarEventId: gcalResult.eventId ?? undefined,
          pmsProvider: phoneRecord.pmsIntegration?.provider,
        }).catch(() => {});
      } catch (gcalError: any) {
        this.logger.error({ accountId, error: gcalError?.message, msg: '[PMS Reschedule Fallback] Failed to create backup GCal event' });
      }
    }

    this.notifications.sendPmsFailureNotification({
      accountId,
      patient: {
        firstName: patientFirstName,
        lastName: patientLastName,
        phone: patientPhone,
        email: patientEmail,
      },
      appointment: {
        appointmentType,
        startTime: newStartTime,
        duration,
        notes: `Reschedule requested. Old appointment ID: ${params.appointmentId || 'unknown'}. ${params.reason || ''}`.trim(),
      },
      pmsErrorMessage,
      gcalBackupCreated,
      gcalEventLink,
    }).catch((err) => {
      this.logger.error({ error: err?.message, msg: '[PMS Reschedule Fallback] Email notification also failed' });
    });

    if (gcalBackupCreated) {
      this.notifications.sendAppointmentConfirmation({
        accountId,
        patient: {
          firstName: patientFirstName,
          lastName: patientLastName,
          phone: patientPhone,
          email: patientEmail,
        },
        appointment: {
          appointmentType,
          startTime: newStartTime,
          duration,
          notes: params.notes,
          externalEventLink: gcalEventLink,
        },
        integrationType: 'google_calendar',
      }).then(({ emailSent, smsSent }) => {
        this.logger.log({ accountId, emailSent, smsSent, msg: '[PMS Reschedule Fallback] Patient confirmation sent' });
      }).catch((err) => {
        this.logger.error({ error: err?.message, msg: '[PMS Reschedule Fallback] Patient confirmation failed (non-fatal)' });
      });
    }

    const fallbackResponse = {
      result: {
        success: true,
        appointmentId: gcalEventId,
        integrationType: gcalBackupCreated ? 'google_calendar_backup' : 'manual_followup',
        message: gcalBackupCreated
          ? `[SUCCESS] Appointment rescheduled to ${formatDateForSpeech(newStartTime)} at ${formatTimeForSpeech(newStartTime)}. Do NOT say "with [patient name]" — the caller already knows who they are. Then ask "Is there anything else I can help you with?"`
          : `Your reschedule request has been noted for ${formatDateForSpeech(newStartTime)} at ${formatTimeForSpeech(newStartTime)}. Our team will confirm the details shortly. Do NOT say "with [patient name]" — the caller already knows who they are.`,
      },
    };

    this.logger.verbose({
      accountId,
      tool: 'rescheduleAppointment',
      fallbackType: gcalBackupCreated ? 'gcal_backup' : 'manual_followup',
      gcalAvailable: gcAvailable,
      gcalBackupCreated,
      pmsErrorMessage,
      oldAppointmentId: params.appointmentId,
      agentResponse: fallbackResponse,
      msg: '[PMS Reschedule Fallback] Returning response to agent',
    });

    return fallbackResponse;
  }

  /**
   * Fallback: Book appointment via Google Calendar
   */
  private async bookAppointmentViaGoogleCalendar(
    phoneRecord: any,
    params: any,
    call: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message:
          "I apologize, but appointment booking is not set up yet. Please call us directly to schedule.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Booking appointment via Google Calendar',
    });

    try {
      const callerPhone = call?.customer?.number;
      let startTime = this.parseBookingStartTime(params);
      const now = new Date();

      // Safety: reject bookings in the past — bump to now + 1 hour
      if (startTime < now) {
        this.logger.warn({ startTime: startTime.toISOString(), msg: '[GCal Booking] AI sent past startTime — adjusting to now + 1hr' });
        startTime = new Date(now.getTime() + 60 * 60 * 1000);
      }

      const duration = params.duration || 30;

      // Try to get patient info from params first, then fall back to per-call cache
      const callId = call?.id;
      const cached = callId ? this.getCachedPatient(callId) : undefined;

      let patientFirstName = params.firstName || '';
      let patientLastName = params.lastName || '';

      if (!patientFirstName && params.patientName) {
        const parts = params.patientName.trim().split(/\s+/);
        patientFirstName = parts[0] || '';
        patientLastName = parts.slice(1).join(' ') || '';
      }

      if (!patientFirstName && params.name) {
        const parts = params.name.trim().split(/\s+/);
        patientFirstName = parts[0] || '';
        patientLastName = parts.slice(1).join(' ') || '';
      }

      // Fallback: use cached data from createPatient earlier in this call
      if (!patientFirstName && cached) {
        patientFirstName = cached.firstName || '';
        patientLastName = cached.lastName || '';
        this.logger.log({ patientFirstName, patientLastName, msg: '[GCal Booking] Using cached patient data from createPatient' });
      }

      if (!patientFirstName) {
        patientFirstName = 'Patient';
        this.logger.warn({ msg: '[GCal Booking] No patient name provided by AI and no cache — falling back to "Patient"' });
      }

      const patientPhone = params.phone || cached?.phone || callerPhone;
      const patientEmail = params.email || params.patientEmail || cached?.email;
      const appointmentType = params.appointmentType || params.type || 'General';

      const result = await this.googleCalendar.createAppointmentEvent(
        accountId,
        {
          patient: {
            firstName: patientFirstName,
            lastName: patientLastName,
            phone: patientPhone,
            email: patientEmail,
            dateOfBirth: params.dateOfBirth,
          },
          appointmentType,
          startTime,
          duration,
          notes: params.notes,
          providerId: params.providerId,
        },
      );

      this.logAiAction({
        accountId,
        source: 'gcal',
        action: 'book_appointment',
        category: 'appointment',
        callId: call?.id,
        externalResourceId: result.eventId ?? undefined,
        externalResourceType: 'event',
        appointmentTime: startTime.toISOString(),
        appointmentType,
        duration,
        summary: `Booked ${appointmentType} appointment, ${duration} min on Google Calendar`,
        calendarEventId: result.eventId ?? undefined,
      }).catch(() => {});

      // Fire-and-forget: send clinic notification email about the new booking
      this.notifications.sendClinicBookingNotification({
        accountId,
        patient: {
          firstName: patientFirstName,
          lastName: patientLastName,
          phone: patientPhone,
          email: patientEmail,
        },
        appointment: {
          appointmentType,
          startTime,
          duration,
          notes: params.notes,
        },
        gcalEventLink: result.htmlLink || undefined,
      }).catch((err) => {
        this.logger.error({ error: err?.message, msg: '[GCal Booking] Clinic notification email failed (non-fatal)' });
      });

      // Fire-and-forget: send patient confirmation (SMS + email)
      this.notifications.sendAppointmentConfirmation({
        accountId,
        patient: {
          firstName: patientFirstName,
          lastName: patientLastName,
          phone: patientPhone,
          email: patientEmail,
        },
        appointment: {
          appointmentType,
          startTime,
          duration,
          notes: params.notes,
          externalEventLink: result.htmlLink || undefined,
        },
        integrationType: 'google_calendar',
      }).then(({ emailSent, smsSent }) => {
        this.logger.log({
          accountId,
          emailSent,
          smsSent,
          msg: '[GCal Booking] Patient confirmation sent',
        });
      }).catch((err) => {
        this.logger.error({ error: err?.message, msg: '[GCal Booking] Patient confirmation failed (non-fatal)' });
      });

      const confirmationParts: string[] = [];
      if (patientEmail) confirmationParts.push('email confirmation');
      if (patientPhone) confirmationParts.push('text confirmation');
      const confirmationMsg = confirmationParts.length > 0
        ? ` You'll receive a ${confirmationParts.join(' and ')}.`
        : '';

      return {
        result: {
          success: true,
          appointmentId: result.eventId,
          integrationType: 'google_calendar',
          message: `[SUCCESS] Appointment confirmed for ${formatDateForSpeech(startTime)} at ${formatTimeForSpeech(startTime)}.${confirmationMsg} [NEXT STEP] Confirm the appointment type, date, and time. Do NOT say "with [patient name]" — the caller already knows who they are. Then ask "Is there anything else I can help you with?"`,
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to book appointment' });
      return {
        error: 'Booking failed',
        message:
          "I'm sorry, I had trouble booking that appointment. Let me take your information and have someone call you back.",
      };
    }
  }

  /**
   * Internal helper: create a patient via PMS as part of an atomic
   * bookAppointment call. Returns the PMS patientId on success or
   * { success: false } so the caller can fall back to GCal.
   */
  private async createPatientForBooking(
    sikkaService: any,
    phoneRecord: any,
    params: any,
    call: any,
  ): Promise<{ success: true; patientId: string } | { success: false }> {
    const startTime = Date.now();
    const callerPhone = call?.customer?.number;
    const patientPhone = params.phone || callerPhone;

    const createInput = {
      firstName: params.firstName,
      lastName: params.lastName,
      phone: patientPhone,
      email: params.email,
      dateOfBirth: params.dateOfBirth,
      address: params.address,
      notes: params.notes,
    };

    this.logger.verbose({
      accountId: phoneRecord.accountId,
      tool: 'bookAppointment→createPatient',
      pmsInput: { ...createInput, phone: createInput.phone ? '***' : undefined },
      msg: '[PMS Call] auto-create patient for booking',
    });

    const result = await sikkaService.createPatient(createInput);
    const responseTime = Date.now() - startTime;

    if (!result.success) {
      const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
      this.logger.warn({ accountId: phoneRecord.accountId, errorMsg, msg: '[bookAppointment] PMS createPatient failed — will fall back to GCal' });
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'createPatient',
        endpoint: '/patients',
        method: 'POST',
        callId: call?.id,
        requestSummary: `Attempted to create patient: ${params.firstName} ${params.lastName}`,
        responseStatus: 500,
        responseTime,
        phiAccessed: false,
        errorMessage: errorMsg,
      });
      return { success: false };
    }

    const patient = result.data!;

    await this.hipaaAudit.logAccess({
      pmsIntegrationId: phoneRecord.pmsIntegration.id,
      action: 'createPatient',
      endpoint: '/patients',
      method: 'POST',
      callId: call?.id,
      requestSummary: 'Created new patient record',
      responseStatus: 201,
      responseTime,
      phiAccessed: true,
    });

    this.logAiAction({
      accountId: phoneRecord.accountId,
      source: 'pms',
      action: 'create_patient',
      category: 'patient',
      callId: call?.id,
      externalResourceId: patient.id,
      externalResourceType: 'patient',
      summary: 'Created new patient record (auto-created for booking)',
      pmsProvider: phoneRecord.pmsIntegration?.provider,
    }).catch(() => {});

    return { success: true, patientId: patient.id };
  }

  /**
   * Parse the booking start time from AI-provided parameters.
   * Handles multiple formats the AI might send:
   *   - Full ISO: "2026-02-25T08:00:00"
   *   - Date + time-only: date="2026-02-25", startTime="08:00"
   *   - Date-only + time-only: date="2026-02-25", startTime="8:00 AM"
   *   - Just datetime: datetime="2026-02-25T08:00"
   */
  private parseBookingStartTime(params: any): Date {
    const raw = params.startTime || params.datetime;
    const dateStr = params.date;

    if (raw) {
      const directParse = new Date(raw);
      if (!isNaN(directParse.getTime())) {
        return directParse;
      }

      // time-only string like "08:00" or "8:00 AM" — combine with date param
      if (dateStr) {
        const normalized = this.normalizeTimeString(raw);
        const combined = new Date(`${dateStr}T${normalized}`);
        if (!isNaN(combined.getTime())) {
          return combined;
        }
      }

      // Last resort: treat as time today
      const today = new Date().toISOString().split('T')[0];
      const normalized = this.normalizeTimeString(raw);
      const todayParsed = new Date(`${today}T${normalized}`);
      if (!isNaN(todayParsed.getTime())) {
        return todayParsed;
      }
    }

    if (dateStr) {
      const dateParsed = new Date(dateStr);
      if (!isNaN(dateParsed.getTime())) {
        return dateParsed;
      }
    }

    this.logger.warn({
      startTime: raw,
      date: dateStr,
      msg: '[GCal Booking] Could not parse start time, defaulting to now + 1hr',
    });
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  private normalizeTimeString(time: string): string {
    const cleaned = time.trim().toUpperCase();
    const match12 = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = match12[2] || '00';
      if (match12[3] === 'PM' && hours < 12) hours += 12;
      if (match12[3] === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}:00`;
    }

    const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      return `${match24[1].padStart(2, '0')}:${match24[2]}:00`;
    }

    return time;
  }

  /**
   * Fallback: Check availability via Google Calendar free/busy.
   *
   * Strategy:
   * 1. Check the requested date first.
   * 2. If no slots on that date, automatically scan ahead up to 14 days
   *    and return the 2-3 earliest available slots across those days.
   * This ensures the AI always has concrete options to offer the caller.
   */
  private async checkAvailabilityViaGoogleCalendar(
    phoneRecord: any,
    params: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message: "Let me check with our staff about available times.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal] Checking availability via Google Calendar',
    });

    try {
      const date = params.date; // Expected: YYYY-MM-DD
      const duration = params.duration || 30;

      // First, check the specific requested date
      const dayResult = await this.googleCalendar.checkFreeBusy(
        accountId,
        date,
        duration,
      );

      if (!dayResult.success) {
        throw new Error('Failed to check calendar availability');
      }

      const daySlots = dayResult.availableSlots || [];
      const tz = dayResult.timezone;

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const requestedDow = dayNames[new Date(`${date}T12:00:00`).getDay()];

      if (daySlots.length > 0) {
        const spokenDate = formatDateForSpeech(date + 'T12:00:00', tz);
        const slotDescriptions = daySlots.map((slot) => {
          const from = formatTimeForSpeech(slot.startTime, tz);
          const to = formatTimeForSpeech(slot.endTime, tz);
          return `${from} to ${to}`;
        });

        return {
          result: {
            success: true,
            integrationType: 'google_calendar',
            requestedDate: date,
            requestedDayOfWeek: requestedDow,
            availableSlots: daySlots.map((slot) => ({
              date,
              dayOfWeek: requestedDow,
              time: slot.startTime,
              endTime: slot.endTime,
            })),
            message: `We have ${daySlots.length} available time window(s) on ${requestedDow} ${spokenDate}: ${slotDescriptions.join(', ')}. Which time works best for you?`,
          },
        };
      }

      // No slots on the requested date — scan ahead to find nearest openings
      this.logger.log({
        accountId,
        date,
        msg: '[GCal] No slots on requested date, scanning next 14 days',
      });

      const nextDay = new Date(`${date}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);

      const multiResult = await this.googleCalendar.findNextAvailableSlots(
        accountId,
        nextDayStr,
        duration,
        3,  // find 3 options
        14, // look up to 14 days ahead
      );

      const nextSlots = multiResult.slots || [];
      const multiTz = multiResult.timezone;

      if (nextSlots.length > 0) {
        const slotDescriptions = nextSlots.map((s) => {
          const d = new Date(s.startTime);
          const dow = !isNaN(d.getTime()) ? dayNames[d.getDay()] : '';
          return `${dow} ${formatDateForSpeech(s.startTime, multiTz)} at ${formatTimeForSpeech(s.startTime, multiTz)}`;
        });

        return {
          result: {
            success: true,
            integrationType: 'google_calendar',
            requestedDate: date,
            requestedDayOfWeek: requestedDow,
            requestedDateAvailable: false,
            availableSlots: nextSlots.map((slot) => {
              const d = new Date(slot.startTime);
              return {
                date: slot.date,
                dayOfWeek: !isNaN(d.getTime()) ? dayNames[d.getDay()] : undefined,
                time: slot.startTime,
                endTime: slot.endTime,
              };
            }),
            message: `Unfortunately ${requestedDow} ${date} is fully booked. The next available times are: ${slotDescriptions.join(', ')}. Would any of those work for you?`,
          },
        };
      }

      // No slots found at all in the next 14 days
      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          requestedDate: date,
          requestedDateAvailable: false,
          availableSlots: [],
          message: `We don't have any availability in the next two weeks. Would you like me to take your information and have someone call you when a slot opens up?`,
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal] Failed to check availability' });
      return {
        error: 'Availability check failed',
        message: "Let me transfer you to our scheduling team.",
      };
    }
  }

  /**
   * Fallback: Update patient info on Google Calendar events.
   * Finds matching events by caller phone and patches the description/attendees.
   */
  private async updatePatientViaGoogleCalendar(
    phoneRecord: any,
    params: any,
    call: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No system configured',
        message: "Let me take your updated information manually.",
      };
    }

    const callerPhone = call?.customer?.number || call?.from_number;
    if (!callerPhone && !params.patientId) {
      return {
        error: 'No patient identifier',
        message: "Let me take your updated information manually.",
      };
    }

    try {
      const { events } = await this.googleCalendar.findEventsByPatient(
        accountId,
        { patientPhone: callerPhone },
        new Date(),
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      );

      if (!events || events.length === 0) {
        this.logger.warn({ msg: '[GCal Fallback] updatePatient: no upcoming events found for caller phone' });
        return {
          error: 'No matching events',
          message: "Let me take your updated information manually.",
        };
      }

      let updatedCount = 0;
      for (const event of events) {
        const eventId = event.id;
        if (!eventId) continue;

        let description = event.description || '';
        if (params.email) {
          const emailRegex = /^Email:.*$/m;
          if (emailRegex.test(description)) {
            description = description.replace(emailRegex, `Email: ${params.email}`);
          } else {
            const phoneLineIdx = description.indexOf('Phone:');
            if (phoneLineIdx !== -1) {
              const lineEnd = description.indexOf('\n', phoneLineIdx);
              if (lineEnd !== -1) {
                description = description.slice(0, lineEnd + 1) + `Email: ${params.email}\n` + description.slice(lineEnd + 1);
              } else {
                description += `\nEmail: ${params.email}`;
              }
            } else {
              description += `\nEmail: ${params.email}`;
            }
          }
        }
        if (params.phone) {
          const phoneRegex = /^Phone:.*$/m;
          if (phoneRegex.test(description)) {
            description = description.replace(phoneRegex, `Phone: ${params.phone}`);
          }
        }

        const attendees: Array<{ email: string }> | undefined = params.email
          ? [{ email: params.email }]
          : undefined;

        await this.googleCalendar.updateEvent(accountId, eventId, {
          description,
          attendees,
        });
        updatedCount++;
      }

      this.logger.log(
        `[GCal Fallback] updatePatient: updated ${updatedCount} event(s) for account=${accountId}`,
      );

      this.logAiAction({
        accountId,
        source: 'gcal',
        action: 'update_patient',
        category: 'patient',
        callId: call?.id,
        externalResourceId: events[0]?.id || undefined,
        externalResourceType: 'event',
        summary: `Updated patient info on ${updatedCount} calendar event(s) (fields: ${Object.keys(params).filter(k => k !== 'patientId').join(', ')})`,
        calendarEventId: events[0]?.id || undefined,
      }).catch(() => {});

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          eventsUpdated: updatedCount,
          message: "I've updated your information successfully.",
        },
      };
    } catch (error: any) {
      this.logger.error({ accountId, error: error?.message, msg: '[GCal Fallback] Failed to update patient on calendar events' });
      return {
        error: 'Patient update failed',
        message: "I'm having trouble updating your information. Let me take your updated details manually.",
      };
    }
  }

  /**
   * Fallback: Cancel appointment via Google Calendar
   */
  private async cancelAppointmentViaGoogleCalendar(
    phoneRecord: any,
    params: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message: "Let me help you cancel your appointment manually.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Cancelling appointment via Google Calendar',
    });

    try {
      // The appointmentId should be the Google Calendar eventId
      await this.googleCalendar.deleteEvent(accountId, params.appointmentId);

      this.logAiAction({
        accountId,
        source: 'gcal',
        action: 'cancel_appointment',
        category: 'appointment',
        externalResourceId: params.appointmentId,
        externalResourceType: 'event',
        summary: 'Cancelled appointment on Google Calendar',
        calendarEventId: params.appointmentId,
      }).catch(() => {});

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          message:
            "Your appointment has been cancelled successfully. Would you like to reschedule for another time?",
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to cancel appointment' });
      return {
        error: 'Appointment cancellation failed',
        message:
          "I'm having trouble cancelling your appointment. Let me transfer you to our scheduling team.",
      };
    }
  }

  /**
   * Fallback: Get appointments via Google Calendar.
   *
   * When patient info (name, email, phone) is provided, uses
   * `findEventsByPatient` to filter events. Otherwise returns all events.
   */
  private async getAppointmentsViaGoogleCalendar(
    call: any,
    params: any,
    fallbackAccountId?: string,
  ) {
    const accountId = await this.getAccountIdFromCall(call, fallbackAccountId);
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message:
          "I'm sorry, but our scheduling system is not set up yet. Let me take your information manually.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Getting appointments via Google Calendar',
    });

    try {
      const today = new Date();
      const ninetyDaysOut = new Date(today);
      ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

      const startDate = params.startDate ? new Date(params.startDate) : today;
      const endDate = params.endDate ? new Date(params.endDate) : ninetyDaysOut;

      const patientName = params.patientName
        || (params.firstName && params.lastName
          ? `${params.firstName} ${params.lastName}`
          : params.firstName || params.lastName || '');
      const patientEmail = params.patientEmail || params.email || '';
      const patientPhone = params.patientPhone || params.phone || '';

      const hasPatientFilter = !!(patientName || patientEmail || patientPhone);

      let events: any[];

      if (hasPatientFilter) {
        const result = await this.googleCalendar.findEventsByPatient(
          accountId!,
          { patientName, patientEmail, patientPhone },
          startDate,
          endDate,
        );
        events = result.events || [];
      } else {
        const result = await this.googleCalendar.listEvents(
          accountId!,
          startDate,
          endDate,
        );
        if (!result.success) throw new Error('Failed to list calendar events');
        events = result.events || [];
      }

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          appointments: events.map((evt: any) => {
            const d = new Date(evt.startTime);
            return {
              id: evt.id,
              date: evt.startTime,
              dayOfWeek: !isNaN(d.getTime()) ? dayNames[d.getDay()] : undefined,
              endTime: evt.endTime,
              type: evt.summary,
              status: evt.status,
            };
          }),
          count: events.length,
          message:
            events.length > 0
              ? `I found ${events.length} appointment(s)${hasPatientFilter ? ' matching that patient' : ' on the calendar'}.`
              : hasPatientFilter
                ? "I couldn't find any appointments matching that patient. Could you double-check the name or phone number?"
                : "I don't see any upcoming appointments on the calendar.",
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to get appointments' });
      return {
        error: 'Failed to retrieve appointments',
        message:
          "I'm having trouble looking up your appointments. Can you tell me more about the appointment you're looking for?",
      };
    }
  }

  /**
   * Fire-and-forget helper to send reschedule notifications (SMS + email).
   * Extracts patient info from the caller context cache and old event data.
   */
  private sendRescheduleNotification(opts: {
    accountId: string;
    callId?: string;
    callerPhone?: string;
    oldEvent?: { summary?: string; startDateTime?: string };
    newStartTime: Date;
    duration: number;
    appointmentType?: string;
    integrationType: 'pms' | 'google_calendar';
  }): void {
    const { accountId, callId, callerPhone, oldEvent, newStartTime, duration, integrationType } = opts;

    // Best-effort patient info from caller context cache
    const callerCtx = callId ? this.getCallerContext(callId) : undefined;
    let firstName = 'Patient';
    let lastName = '';
    let phone = callerPhone || callerCtx?.callerPhone;

    if (callerCtx?.patientName) {
      const parts = callerCtx.patientName.split(' ');
      firstName = parts[0] || 'Patient';
      lastName = parts.slice(1).join(' ');
    } else if (oldEvent?.summary) {
      // GCal events are titled "appointmentType - FirstName LastName"
      const dashIdx = oldEvent.summary.indexOf(' - ');
      if (dashIdx > -1) {
        const namePart = oldEvent.summary.slice(dashIdx + 3).trim();
        const parts = namePart.split(' ');
        firstName = parts[0] || 'Patient';
        lastName = parts.slice(1).join(' ');
      }
    }

    // Determine appointment type from params, old event, or caller context
    const appointmentType =
      opts.appointmentType ||
      (oldEvent?.summary?.includes(' - ') ? oldEvent.summary.split(' - ')[0]!.trim() : undefined) ||
      callerCtx?.nextBooking?.type ||
      'Appointment';

    // Build old appointment info from old event or caller context
    const oldStartTime = oldEvent?.startDateTime
      ? new Date(oldEvent.startDateTime)
      : callerCtx?.nextBooking
        ? new Date(`${callerCtx.nextBooking.date}T${callerCtx.nextBooking.time}`)
        : newStartTime; // fallback: use new time so SMS still goes out

    this.notifications.sendAppointmentReschedule({
      accountId,
      patient: { firstName, lastName, phone },
      oldAppointment: {
        appointmentType,
        startTime: oldStartTime,
        duration,
      },
      newAppointment: {
        appointmentType,
        startTime: newStartTime,
        duration,
      },
    }).then(({ emailSent, smsSent }) => {
      this.logger.log({
        accountId,
        emailSent,
        smsSent,
        msg: `[Reschedule ${integrationType}] Patient notification sent`,
      });
    }).catch((err) => {
      this.logger.error({ error: err?.message, msg: `[Reschedule ${integrationType}] Patient notification failed (non-fatal)` });
    });
  }

  /**
   * Fallback: Reschedule appointment via Google Calendar
   * Updates the existing event with new start/end time
   */
  private async rescheduleAppointmentViaGoogleCalendar(
    call: any,
    params: any,
    fallbackAccountId?: string,
  ) {
    const accountId = await this.getAccountIdFromCall(call, fallbackAccountId);
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message:
          "I'm sorry, but our scheduling system is not set up yet. Let me take your information manually.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Rescheduling appointment via Google Calendar',
    });

    try {
      const rescheduleParams = {
        startTime: params.startTime || params.newStartTime,
        date: params.date || params.newDate,
        datetime: params.datetime,
      };
      const newStartTime = this.parseBookingStartTime(rescheduleParams);
      const duration = params.duration || 30;
      const newEndTime = new Date(newStartTime);
      newEndTime.setMinutes(newEndTime.getMinutes() + duration);

      // Fetch old event to capture pre-reschedule data for notifications
      const oldEvent = await this.googleCalendar.getEvent(accountId!, params.appointmentId);

      const result = await this.googleCalendar.updateEvent(
        accountId!,
        params.appointmentId,
        {
          start: newStartTime,
          end: newEndTime,
        },
      );

      this.logAiAction({
        accountId: accountId!,
        source: 'gcal',
        action: 'reschedule_appointment',
        category: 'appointment',
        callId: call?.id,
        externalResourceId: params.appointmentId,
        externalResourceType: 'event',
        appointmentTime: newStartTime.toISOString(),
        duration,
        summary: `Rescheduled appointment to ${newStartTime.toISOString()} on Google Calendar`,
        calendarEventId: result.eventId || params.appointmentId,
      }).catch(() => {});

      // Fire-and-forget: send reschedule confirmation (SMS + email)
      this.sendRescheduleNotification({
        accountId: accountId!,
        callId: call?.id,
        callerPhone: call?.from_number || call?.retell_llm_dynamic_variables?.from_number,
        oldEvent: oldEvent?.success ? oldEvent : undefined,
        newStartTime,
        duration,
        appointmentType: params.appointmentType,
        integrationType: 'google_calendar',
      });

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          appointment: result.eventId
            ? {
                id: result.eventId,
                date: newStartTime.toISOString(),
              }
            : null,
          message: `Your appointment has been rescheduled to ${newStartTime.toLocaleString()}.`,
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to reschedule appointment' });
      return {
        error: 'Reschedule failed',
        message:
          "I'm having trouble rescheduling. Let me check availability for another time.",
      };
    }
  }
}
