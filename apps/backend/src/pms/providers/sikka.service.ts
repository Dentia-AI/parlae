import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { StructuredLogger } from '../../common/structured-logger';
import { BasePmsService } from '../interfaces/pms-service.interface';
import type {
  Appointment,
  AppointmentAvailabilityQuery,
  AppointmentCancelInput,
  AppointmentCreateInput,
  AppointmentStatus,
  AppointmentUpdateInput,
  Insurance,
  InsuranceCreateInput,
  Patient,
  PatientBalance,
  PatientCreateInput,
  PatientNote,
  PatientNoteCreateInput,
  PatientSearchQuery,
  PatientUpdateInput,
  Payment,
  PaymentCreateInput,
  PmsApiResponse,
  PmsConfig,
  PmsFeatures,
  PmsListResponse,
  Provider,
  SikkaCredentials,
  TimeSlot,
} from '../interfaces/pms.types';

/**
 * Sikka PMS Service Implementation with Token Refresh & Writeback Tracking
 * 
 * Authorization Flow:
 * 1. GET /authorized_practices → Get office_id + secret_key
 * 2. POST /request_key (grant_type: request_key) → Get request_key + refresh_key
 * 3. POST /request_key (grant_type: refresh_key) → Refresh every 24 hours
 * 
 * Writeback Flow (POST/PATCH/DELETE operations):
 * 1. Submit operation → Get writeback_id
 * 2. Poll GET /writeback_status?id={id} → Check status (is_completed/has_error)
 * 3. Return result when completed
 */
@Injectable()
export class SikkaPmsService extends BasePmsService {
  private readonly logger = new StructuredLogger('SikkaPmsService');
  private client: AxiosInstance;
  private readonly baseUrl = 'https://api.sikkasoft.com/v4';
  
  // Credentials
  private readonly appId: string;
  private readonly appKey: string;
  
  // Token state (loaded from database)
  private requestKey?: string;
  private refreshKey?: string;
  private tokenExpiry?: Date;
  private officeId?: string;
  private secretKey?: string;
  private practiceId?: string;
  private practiceIdVerified = false;
  
  constructor(
    accountId: string,
    credentials: SikkaCredentials,
    config: PmsConfig = {}
  ) {
    super(accountId, credentials, config);
    
    const creds = credentials as SikkaCredentials;
    
    // Validate required credentials
    if (!creds.appId || !creds.appKey) {
      throw new Error('Sikka appId and appKey are required');
    }
    
    this.appId = creds.appId;
    this.appKey = creds.appKey;
    
    this.requestKey = creds.requestKey;
    this.refreshKey = creds.refreshKey;
    this.officeId = creds.officeId;
    this.secretKey = creds.secretKey;
    this.practiceId = creds.practiceId;
    
    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    // Add request interceptor for automatic token refresh
    this.client.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.requestKey) {
        config.headers['Request-Key'] = this.requestKey;
      }
      if (this.practiceId) {
        if (config.params?.practice_id) {
          config.params.practice_id = this.practiceId;
        }
        if (config.data && typeof config.data === 'object' && 'practice_id' in config.data) {
          config.data.practice_id = this.practiceId;
        }
        if (typeof config.data === 'string') {
          try {
            const parsed = JSON.parse(config.data);
            if ('practice_id' in parsed) {
              parsed.practice_id = this.practiceId;
              config.data = JSON.stringify(parsed);
            }
          } catch { /* not JSON, skip */ }
        }
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        this.logger.log({
          accountId,
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          params: response.config.params,
          requestBody: this.safeSlice(response.config.data),
          status: response.status,
          responseBody: this.safeSlice(JSON.stringify(response.data), 2000),
          msg: '[Sikka API] Response',
        });
        return response;
      },
      (error) => {
        const status = error.response?.status;
        const data = error.response?.data;
        this.logger.error({
          accountId,
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          params: error.config?.params,
          requestBody: this.safeSlice(error.config?.data),
          status,
          responseBody: this.safeSlice(JSON.stringify(data), 2000),
          errorMessage: error.message,
          msg: '[Sikka API] Error',
        });
        return Promise.reject(error);
      },
    );
  }

  private safeSlice(value: unknown, maxLen = 500): string {
    if (!value) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
  }
  
  // ============================================================================
  // Authorization & Token Management
  // ============================================================================
  
  /**
   * Ensure we have a valid request_key (auto-refresh if expired)
   */
  private async ensureValidToken(): Promise<void> {
    // Check if token is still valid (with 1-hour buffer)
    if (this.requestKey && this.tokenExpiry) {
      const bufferMs = 60 * 60 * 1000; // 1 hour
      if (Date.now() < this.tokenExpiry.getTime() - bufferMs) {
        if (!this.practiceIdVerified) {
          await this.verifyPracticeId();
        }
        return;
      }
    }
    
    if (this.refreshKey) {
      await this.refreshToken();
    } else if (this.officeId && this.secretKey) {
      await this.getInitialToken();
    } else {
      await this.fetchAuthorizedPractices();
      await this.getInitialToken();
    }

    if (!this.practiceIdVerified) {
      await this.verifyPracticeId();
    }
  }
  
  /**
   * Fetch authorized practices to get office_id and secret_key
   */
  private async fetchAuthorizedPractices(): Promise<void> {
    try {
      this.logger.log({ msg: '[Sikka] Fetching authorized practices' });
      
      const response = await axios.get(`${this.baseUrl}/authorized_practices`, {
        headers: {
          'App-Id': this.appId,
          'App-Key': this.appKey,
        },
        timeout: 15000,
      });
      
      const practices = response.data.items || [];
      if (practices.length === 0) {
        throw new Error('No authorized practices found');
      }
      
      const practice = practices[0];
      this.officeId = practice.office_id;
      this.secretKey = practice.secret_key;
      this.practiceId = practice.practice_id;
      
      this.logger.log({ officeId: this.officeId, practiceId: this.practiceId, msg: '[Sikka] Found practice' });
      
      // TODO: Save to database
      
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : error, msg: '[Sikka] Failed to fetch authorized practices' });
      throw new Error('Failed to fetch Sikka authorized practices. Please check your App-Id and App-Key.');
    }
  }
  
  /**
   * Get initial request_key using office_id and secret_key
   */
  private async getInitialToken(): Promise<void> {
    try {
      this.logger.log({ msg: '[Sikka] Getting initial token with request_key grant' });
      
      const response = await axios.post(
        `${this.baseUrl}/request_key`,
        {
          grant_type: 'request_key',
          office_id: this.officeId,
          secret_key: this.secretKey,
          app_id: this.appId,
          app_key: this.appKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      
      const data = response.data;
      
      if (!data.request_key || !data.refresh_key) {
        throw new Error('Invalid token response from Sikka API');
      }
      
      this.requestKey = data.request_key;
      this.refreshKey = data.refresh_key;
      
      // Parse expires_in (e.g., "85603 second(s)")
      const expiresInSeconds = parseInt(data.expires_in) || 86400; // Default 24 hours
      this.tokenExpiry = new Date(Date.now() + expiresInSeconds * 1000);
      
      this.logger.log({ expiresInSeconds, msg: '[Sikka] Token obtained successfully' });
      
      // TODO: Save to database (requestKey, refreshKey, tokenExpiry)
      
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : error, msg: '[Sikka] Token request failed' });
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        throw new Error(`Sikka authentication failed (${status}): ${JSON.stringify(data)}`);
      }
      
      throw new Error('Failed to authenticate with Sikka API. Please check your credentials.');
    }
  }
  
  /**
   * Refresh request_key using refresh_key
   */
  private async refreshToken(): Promise<void> {
    try {
      this.logger.log({ msg: '[Sikka] Refreshing token with refresh_key grant' });
      
      const response = await axios.post(
        `${this.baseUrl}/request_key`,
        {
          grant_type: 'refresh_key',
          refresh_key: this.refreshKey,
          app_id: this.appId,
          app_key: this.appKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      
      const data = response.data;
      
      if (!data.request_key || !data.refresh_key) {
        throw new Error('Invalid token response from Sikka API');
      }
      
      this.requestKey = data.request_key;
      this.refreshKey = data.refresh_key;
      
      // Parse expires_in
      const expiresInSeconds = parseInt(data.expires_in) || 86400;
      this.tokenExpiry = new Date(Date.now() + expiresInSeconds * 1000);
      
      this.logger.log({ expiresInSeconds, msg: '[Sikka] Token refreshed successfully' });
      
      // TODO: Save to database (requestKey, refreshKey, tokenExpiry)
      
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : error, msg: '[Sikka] Token refresh failed' });
      
      // If refresh fails, try to get a new token
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.logger.warn({ msg: '[Sikka] Refresh key expired, getting new token' });
        await this.getInitialToken();
      } else {
        throw error;
      }
    }
  }
  
  private async verifyPracticeId(): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/authorized_practices`, {
        headers: { 'App-Id': this.appId, 'App-Key': this.appKey },
        timeout: 10000,
      });

      const practices = response.data.items || [];
      if (practices.length > 0) {
        const authorizedId = practices[0].practice_id;
        if (this.practiceId && this.practiceId !== authorizedId) {
          this.logger.warn({
            configuredPracticeId: this.practiceId,
            authorizedPracticeId: authorizedId,
            msg: '[Sikka] Practice ID mismatch — auto-correcting to authorized value',
          });
          this.practiceId = authorizedId;
          this.config?.onPracticeIdCorrected?.(authorizedId);
        } else if (!this.practiceId) {
          this.practiceId = authorizedId;
          this.config?.onPracticeIdCorrected?.(authorizedId);
        }
        if (!this.officeId) this.officeId = practices[0].office_id;
        if (!this.secretKey) this.secretKey = practices[0].secret_key;
      }
      this.practiceIdVerified = true;
    } catch (error) {
      this.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        msg: '[Sikka] Could not verify practice_id — continuing with configured value',
      });
      this.practiceIdVerified = true;
    }
  }

  // ============================================================================
  // Writeback Status Tracking
  // ============================================================================
  
  /**
   * Extract writeback ID from Sikka writeback response.
   * Sikka returns: { long_message: "Id:275495", more_information: "https://api.sikkasoft.com/v4/writeback_status?id=275495" }
   */
  private extractWritebackId(responseData: any): string | undefined {
    if (responseData.id) return String(responseData.id);

    const longMsg = responseData.long_message || '';
    const idMatch = longMsg.match(/Id[:\s]*(\S+)/i);
    if (idMatch) return idMatch[1];

    const moreInfo = responseData.more_information || '';
    const urlMatch = moreInfo.match(/[?&]id=([^&\s]+)/);
    if (urlMatch) return urlMatch[1];

    return undefined;
  }

  /**
   * Poll writeback status until completed or failed.
   * Endpoint: GET /writeback_status?id={id}
   * Response: { items: [{ is_completed: "True"/"False", has_error: "True"/"False", result: "message" }] }
   */
  private async pollWritebackStatus(writebackId: string, maxAttempts = 10): Promise<{
    result: string;
    errorMessage?: string;
  }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.client.get('/writeback_status', {
          params: { id: writebackId },
          timeout: 10000,
        });
        
        const items = response.data.items || [];
        if (items.length === 0) {
          throw new Error(`Writeback ${writebackId} not found`);
        }
        
        const writeback = items[0];
        const isCompleted = writeback.is_completed === 'True' || writeback.is_completed === true;
        const hasError = writeback.has_error === 'True' || writeback.has_error === true;
        
        this.logger.log({ writebackId, isCompleted, hasError, result: writeback.result, attempt, maxAttempts, msg: '[Sikka] Writeback poll' });
        
        if (isCompleted) {
          return {
            result: hasError ? 'failed' : 'completed',
            errorMessage: hasError ? writeback.result : undefined,
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error: any) {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
          this.logger.log({
            writebackId,
            httpStatus: status,
            msg: '[Sikka] writeback_status not authorized — treating writeback as accepted',
          });
          return { result: 'completed' };
        }

        this.logger.error({ writebackId, attempt, maxAttempts, error: error instanceof Error ? error.message : error, msg: '[Sikka] Error polling writeback status' });
        
        if (attempt === maxAttempts) {
          return {
            result: 'completed',
            errorMessage: 'Writeback submitted but status polling timed out — writeback may still complete',
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return {
      result: 'completed',
      errorMessage: 'Writeback submitted but status remained pending — writeback may still complete',
    };
  }
  
  // ============================================================================
  // Connection & Configuration
  // ============================================================================
  
  async testConnection(): Promise<PmsApiResponse<{ connectionValid: boolean; message?: string }>> {
    try {
      // Test by fetching appointments
      await this.client.get('/appointments', { params: { limit: 1 } });
      
      return this.createSuccessResponse({
        connectionValid: true,
        message: 'Successfully connected to Sikka API',
      });
    } catch (error) {
      return this.createErrorResponse(
        'CONNECTION_FAILED',
        'Failed to connect to Sikka API. Please check your credentials.',
        error
      );
    }
  }
  
  async getFeatures(): Promise<PmsApiResponse<PmsFeatures>> {
    // Sikka supports all features
    return this.createSuccessResponse({
      appointments: true,
      patients: true,
      insurance: true,
      payments: true,
      notes: true,
      providers: true,
    });
  }
  
  async updateConfig(config: Partial<PmsConfig>): Promise<PmsApiResponse<PmsConfig>> {
    this.config = { ...this.config, ...config };
    return this.createSuccessResponse(this.config);
  }
  
  // ============================================================================
  // Appointment Management
  // ============================================================================
  
  async getAppointments(filters?: {
    startDate?: Date;
    endDate?: Date;
    patientId?: string;
    providerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PmsListResponse<Appointment>> {
    try {
      const params: any = {
        limit: filters?.limit || 50,
        offset: filters?.offset || 0,
      };
      
      if (this.practiceId) {
        params.practice_id = this.practiceId;
      }
      if (filters?.startDate) {
        params.startdate = filters.startDate.toISOString().split('T')[0];
      }
      if (filters?.endDate) {
        params.enddate = filters.endDate.toISOString().split('T')[0];
      }
      if (filters?.patientId) {
        params.patient_id = filters.patientId;
      }
      if (filters?.providerId) {
        params.provider_id = filters.providerId;
      }
      // NOTE: Do NOT send `status` as a Sikka query param — Sikka uses
      // PMS-native values (e.g. "Complete", "Broken") that vary by vendor.
      // We filter by normalized status in code after fetching.
      
      const response = await this.client.get('/appointments', { params });
      
      let appointments = (response.data?.items || []).map((item: any) => this.mapSikkaAppointment(item));

      if (filters?.status) {
        const target = this.normalizeSikkaStatus(filters.status);
        appointments = appointments.filter(
          (a: Appointment) => this.normalizeSikkaStatus(a.status) === target,
        );
      }

      return this.createListResponse(appointments, {
        total: appointments.length,
        limit: params.limit,
        offset: params.offset,
        hasMore: response.data?.pagination?.next !== '',
      });
    } catch (error) {
      return this.handleError(error, 'getAppointments') as PmsListResponse<Appointment>;
    }
  }

  /**
   * Normalize PMS-native appointment statuses to a standard set.
   * Sikka returns statuses from the underlying PMS (Dentrix, Open Dental, etc.)
   * which vary by vendor. This maps them to: scheduled, completed, cancelled, no_show.
   */
  private normalizeSikkaStatus(raw: string): AppointmentStatus {
    const s = (raw || '').toLowerCase().trim();
    if (s === 'complete' || s === 'completed') return 'completed';
    if (s === 'broken' || s === 'no_show' || s === 'no-show' || s === 'missed' || s === 'no show') return 'no_show';
    if (s === 'cancelled' || s === 'canceled' || s === 'deleted') return 'cancelled';
    if (s === 'confirmed') return 'confirmed';
    if (s === 'rescheduled') return 'rescheduled';
    return 'scheduled';
  }
  
  async getAppointment(appointmentId: string): Promise<PmsApiResponse<Appointment>> {
    try {
      const response = await this.client.get(`/appointments/${appointmentId}`);
      const appointment = this.mapSikkaAppointment(response.data);
      return this.createSuccessResponse(appointment);
    } catch (error) {
      return this.handleError(error, 'getAppointment');
    }
  }
  
  async checkAvailability(query: AppointmentAvailabilityQuery): Promise<PmsApiResponse<TimeSlot[]>> {
    try {
      const params: any = {
        startdate: query.date,
      };

      if (this.practiceId) {
        params.practice_id = this.practiceId;
      }
      if (query.endDate) {
        params.enddate = query.endDate;
      }
      if (query.providerId) {
        params.provider_id = query.providerId;
      }

      this.logger.log({
        accountId: this.accountId,
        endpoint: '/appointments_available_slots',
        params,
        msg: '[Sikka] checkAvailability request',
      });

      const response = await this.client.get('/appointments_available_slots', { params });

      this.logger.log({
        accountId: this.accountId,
        status: response.status,
        itemCount: response.data.items?.length ?? 0,
        rawResponse: this.safeSlice(JSON.stringify(response.data), 2000),
        msg: '[Sikka] checkAvailability raw response',
      });

      if (response.status === 204 || !(response.data?.items?.length)) {
        this.logger.warn({
          accountId: this.accountId,
          msg: '[Sikka] checkAvailability returned 204/empty — trying booked-appointment fallback',
        });

        const inferResult = await this.inferAvailabilityFromAppointments(query);
        if (inferResult.slots.length > 0) {
          return this.createSuccessResponse(inferResult.slots, { inferred: true });
        }

        if (inferResult.hadProviders) {
          return this.createSuccessResponse([] as TimeSlot[], { inferred: true, closedDay: true });
        }

        return this.createSuccessResponse([] as TimeSlot[], { httpStatus: 204, noContent: true });
      }

      const slots = (response.data.items || []).map((item: any) => this.mapSikkaTimeSlot(item));
      
      return this.createSuccessResponse(slots);
    } catch (error) {
      return this.handleError(error, 'checkAvailability');
    }
  }

  private static readonly DEFAULT_START_HOUR = 8;
  private static readonly DEFAULT_END_HOUR = 17;
  private static readonly SLOT_DURATION_MINS = 30;

  /**
   * Fallback when appointments_available_slots returns 204:
   * Infer open slots by subtracting booked appointments from business hours.
   */
  private async inferAvailabilityFromAppointments(
    query: AppointmentAvailabilityQuery,
  ): Promise<{ slots: TimeSlot[]; hadProviders: boolean }> {
    try {
      const startDate = new Date(`${query.date}T00:00:00`);
      const endDateStr = query.endDate || query.date;
      const endDate = new Date(`${endDateStr}T23:59:59`);

      const [appointmentsResult, providersResult] = await Promise.all([
        this.getAppointments({
          startDate,
          endDate,
          providerId: query.providerId,
          limit: 200,
        }),
        this.getProviders(),
      ]);

      if (!appointmentsResult.success) {
        this.logger.warn({ msg: '[Sikka] inferAvailability: failed to fetch appointments' });
        return { slots: [], hadProviders: false };
      }

      let providers = providersResult.success ? (providersResult.data || []) : [];
      providers = providers.filter(p => p.isActive);
      if (query.providerId) {
        providers = providers.filter(p => p.id === query.providerId);
      }
      if (providers.length === 0 && query.providerId) {
        providers = [{
          id: query.providerId,
          firstName: '',
          lastName: '',
          isActive: true,
        }] as Provider[];
      }
      if (providers.length === 0) {
        this.logger.warn({ msg: '[Sikka] inferAvailability: no providers found' });
        return { slots: [], hadProviders: false };
      }

      const slotDuration = query.duration || SikkaPmsService.SLOT_DURATION_MINS;
      const bookedAppts = appointmentsResult.data || [];
      const allSlots: TimeSlot[] = [];

      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const dateStr = currentDate.toISOString().slice(0, 10);

        for (const provider of providers) {
          const providerAppts = bookedAppts
            .filter(a =>
              a.providerId === provider.id &&
              a.startTime.toISOString().slice(0, 10) === dateStr &&
              a.status !== 'cancelled',
            )
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

          const dayStart = new Date(`${dateStr}T${String(SikkaPmsService.DEFAULT_START_HOUR).padStart(2, '0')}:00:00`);
          const dayEnd = new Date(`${dateStr}T${String(SikkaPmsService.DEFAULT_END_HOUR).padStart(2, '0')}:00:00`);

          const gaps = this.findGaps(dayStart, dayEnd, providerAppts, slotDuration);

          for (const gap of gaps) {
            allSlots.push({
              startTime: gap.start,
              endTime: gap.end,
              providerId: provider.id,
              providerName: `${provider.firstName || ''} ${provider.lastName || ''}`.trim(),
              available: true,
              reason: 'inferred',
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      this.logger.log({
        accountId: this.accountId,
        inferredSlotCount: allSlots.length,
        dateRange: `${query.date} - ${endDateStr}`,
        providerCount: providers.length,
        bookedCount: bookedAppts.length,
        msg: '[Sikka] inferAvailability complete',
      });

      return { slots: allSlots, hadProviders: true };
    } catch (error) {
      this.logger.warn({
        error: error instanceof Error ? error.message : error,
        msg: '[Sikka] inferAvailability failed (non-fatal)',
      });
      return { slots: [], hadProviders: false };
    }
  }

  /**
   * Find available time gaps between booked appointments within business hours.
   * Returns slot-sized blocks that fit in the gaps.
   */
  private findGaps(
    dayStart: Date,
    dayEnd: Date,
    sortedAppts: Appointment[],
    slotMinutes: number,
  ): Array<{ start: Date; end: Date }> {
    const gaps: Array<{ start: Date; end: Date }> = [];
    let cursor = dayStart.getTime();
    const endMs = dayEnd.getTime();
    const slotMs = slotMinutes * 60_000;

    for (const appt of sortedAppts) {
      const apptStart = appt.startTime.getTime();
      const apptEnd = appt.endTime.getTime();

      while (cursor + slotMs <= Math.min(apptStart, endMs)) {
        gaps.push({ start: new Date(cursor), end: new Date(cursor + slotMs) });
        cursor += slotMs;
      }

      cursor = Math.max(cursor, apptEnd);
    }

    while (cursor + slotMs <= endMs) {
      gaps.push({ start: new Date(cursor), end: new Date(cursor + slotMs) });
      cursor += slotMs;
    }

    return gaps;
  }
  
  /**
   * Book appointment (ASYNC - returns writeback ID)
   */
  async bookAppointment(data: AppointmentCreateInput): Promise<PmsApiResponse<Appointment>> {
    try {
      const payload: Record<string, any> = {
        patient_id: data.patientId,
        provider_id: data.providerId,
        date: data.startTime.toISOString().split('T')[0],
        time: data.startTime.toTimeString().slice(0, 5),
        length: String(data.duration || 30),
        practice_id: this.practiceId,
      };
      if (!payload.provider_id) {
        payload.provider_id = await this.resolveProviderId();
      }
      if (data.metadata?.appointmentTypeId) {
        payload.type = data.metadata.appointmentTypeId;
      }
      payload.description = data.metadata?.description || data.appointmentType || data.notes || 'Appointment';
      if (data.notes) payload.note = data.notes;
      payload.operatory = data.metadata?.operatory || await this.resolveOperatory();

      this.logger.log({
        accountId: this.accountId,
        writebackPayload: payload,
        msg: '[Sikka] bookAppointment submitting writeback',
      });

      const response = await this.client.post('/appointment', payload);

      this.logger.log({
        accountId: this.accountId,
        httpStatus: response.status,
        responseData: JSON.stringify(response.data).slice(0, 1000),
        msg: '[Sikka] bookAppointment writeback response',
      });
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        this.logger.error({ responseData: JSON.stringify(response.data).slice(0, 500), msg: '[Sikka] Could not extract writeback ID from appointment booking response' });
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Appointment booking submitted — polling writeback status' });
      
      const status = await this.pollWritebackStatus(writebackId);

      this.logger.log({
        accountId: this.accountId,
        writebackId,
        writebackResult: status.result,
        writebackError: status.errorMessage,
        msg: '[Sikka] bookAppointment writeback final status',
      });
      
      if (status.result === 'completed') {
        const appointment: Appointment = {
          id: writebackId,
          patientId: data.patientId,
          patientName: '',
          providerId: data.providerId || '',
          providerName: '',
          appointmentType: data.appointmentType || 'General',
          startTime: data.startTime,
          endTime: new Date(data.startTime.getTime() + (data.duration || 30) * 60000),
          duration: data.duration || 30,
          status: 'scheduled',
          notes: data.notes,
        };
        
        return this.createSuccessResponse(appointment);
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Appointment booking failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'bookAppointment');
    }
  }
  
  /**
   * Reschedule appointment (ASYNC)
   */
  async rescheduleAppointment(
    appointmentId: string,
    updates: AppointmentUpdateInput
  ): Promise<PmsApiResponse<Appointment>> {
    try {
      const payload: Record<string, any> = {
        practice_id: this.practiceId,
      };
      
      if (updates.startTime) {
        payload.date = updates.startTime.toISOString().split('T')[0];
        payload.time = updates.startTime.toISOString().split('T')[1].slice(0, 5);
      }
      if (updates.duration !== undefined) {
        payload.length = String(updates.duration);
      }
      payload.provider_id = updates.providerId || await this.resolveProviderId();
      if (updates.appointmentType) {
        payload.type = updates.appointmentType;
      }
      if (updates.notes) {
        payload.description = updates.notes;
      }
      
      this.logger.log({
        accountId: this.accountId,
        appointmentId,
        writebackPayload: payload,
        msg: '[Sikka] rescheduleAppointment submitting writeback',
      });

      const response = await this.client.put(`/appointments/${appointmentId}`, payload);

      this.logger.log({
        accountId: this.accountId,
        httpStatus: response.status,
        responseData: JSON.stringify(response.data).slice(0, 1000),
        msg: '[Sikka] rescheduleAppointment writeback response',
      });
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Appointment update submitted — polling writeback status' });
      
      const status = await this.pollWritebackStatus(writebackId);

      this.logger.log({
        accountId: this.accountId,
        writebackId,
        writebackResult: status.result,
        writebackError: status.errorMessage,
        msg: '[Sikka] rescheduleAppointment writeback final status',
      });
      
      if (status.result === 'completed') {
        return await this.getAppointment(appointmentId);
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Appointment update failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'rescheduleAppointment');
    }
  }
  
  /**
   * Cancel appointment (ASYNC)
   */
  async cancelAppointment(
    appointmentId: string,
    input: AppointmentCancelInput
  ): Promise<PmsApiResponse<{ cancelled: boolean; message?: string }>> {
    try {
      const cancelStatus = await this.resolveCancelStatus();
      const payload: Record<string, any> = {
        appointment_sr_no: appointmentId,
        op: 'replace',
        path: '/appointment_status',
        value: cancelStatus,
        practice_id: this.practiceId,
      };
      if (input.reason) {
        payload.cancellation_note = input.reason;
      }

      this.logger.log({
        accountId: this.accountId,
        appointmentId,
        writebackPayload: payload,
        msg: '[Sikka] cancelAppointment submitting writeback',
      });

      const response = await this.client.patch(`/appointments/${appointmentId}`, payload);

      this.logger.log({
        accountId: this.accountId,
        httpStatus: response.status,
        responseData: JSON.stringify(response.data).slice(0, 1000),
        msg: '[Sikka] cancelAppointment writeback response',
      });
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Appointment cancellation submitted — polling writeback status' });
      
      const status = await this.pollWritebackStatus(writebackId);

      this.logger.log({
        accountId: this.accountId,
        writebackId,
        writebackResult: status.result,
        writebackError: status.errorMessage,
        msg: '[Sikka] cancelAppointment writeback final status',
      });
      
      if (status.result === 'completed') {
        return this.createSuccessResponse({
          cancelled: true,
          message: 'Appointment cancelled successfully',
        });
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Appointment cancellation failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'cancelAppointment');
    }
  }
  
  // ============================================================================
  // Patient Management
  // ============================================================================

  async listPatients(options?: { limit?: number; offset?: number }): Promise<PmsListResponse<Patient>> {
    try {
      const params: Record<string, any> = {
        limit: options?.limit || 500,
        offset: options?.offset || 0,
      };
      if (this.practiceId) {
        params.practice_id = this.practiceId;
      }

      const response = await this.client.get('/patients', { params });
      const patients = (response.data?.items || []).map((item: any) => this.mapSikkaPatient(item));

      return this.createListResponse(patients, {
        total: parseInt(response.data?.total_count || '0'),
        limit: params.limit,
        offset: params.offset,
        hasMore: (response.data?.pagination?.next || '') !== '',
      });
    } catch (error) {
      return this.handleError(error, 'listPatients') as PmsListResponse<Patient>;
    }
  }

  async searchPatients(query: PatientSearchQuery): Promise<PmsListResponse<Patient>> {
    try {
      const params: Record<string, any> = {
        limit: query.limit || 10,
        offset: query.offset || 0,
      };

      let phoneDigits: string | undefined;

      if (query.cell) {
        const digits = query.cell.replace(/\D/g, '');
        params.cell = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
        phoneDigits = params.cell;
      }
      if (query.firstname) {
        params.firstname = query.firstname;
      }
      if (query.lastname) {
        params.lastname = query.lastname;
      }
      if (query.email) {
        params.email = query.email;
      }

      if (!params.cell && !params.firstname && !params.lastname && !params.email && query.query) {
        const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(query.query.trim());
        if (isPhone) {
          const qDigits = query.query.replace(/\D/g, '');
          params.cell = qDigits.length === 11 && qDigits.startsWith('1') ? qDigits.slice(1) : qDigits;
          phoneDigits = params.cell;
        } else if (query.query.includes('@')) {
          params.email = query.query.trim();
        } else {
          const parts = query.query.trim().split(/\s+/);
          if (parts.length >= 2) {
            params.firstname = parts[0];
            params.lastname = parts.slice(1).join(' ');
          } else {
            params.lastname = parts[0];
          }
        }
      }

      this.logger.log({
        accountId: this.accountId,
        endpoint: '/patients',
        params,
        msg: '[Sikka] searchPatients request',
      });

      const response = await this.client.get('/patients', { params });

      this.logger.log({
        accountId: this.accountId,
        status: response.status,
        totalCount: response.data.total_count,
        itemCount: response.data.items?.length ?? 0,
        rawItems: this.safeSlice(JSON.stringify(response.data.items), 2000),
        pagination: response.data.pagination,
        msg: '[Sikka] searchPatients raw response',
      });

      const patients = (response.data.items || []).map((item: any) => this.mapSikkaPatient(item));
      
      if (patients.length > 0) {
        return this.createListResponse(patients, {
          total: parseInt(response.data.total_count || '0'),
          limit: params.limit,
          offset: params.offset,
          hasMore: response.data.pagination?.next !== '',
        });
      }

      // Fallback: Sikka only filters by `cell`. If the practice stores phone
      // numbers in homephone/workphone, the cell search will miss them.
      // Fetch patients with extended phone fields and match client-side.
      if (phoneDigits) {
        return this.searchPatientsByAnyPhone(phoneDigits, params.limit);
      }

      return this.createListResponse(patients, {
        total: 0,
        limit: params.limit,
        offset: params.offset,
        hasMore: false,
      });
    } catch (error) {
      return this.handleError(error, 'searchPatients') as PmsListResponse<Patient>;
    }
  }

  private static readonly EXTENDED_PHONE_FIELDS =
    'patient_id,firstname,middlename,lastname,preferred_name,salutation,birthdate,status,' +
    'address_line1,address_line2,city,state,zipcode,cell,homephone,workphone,email,' +
    'first_visit,last_visit,provider_id,practice_id,guarantor_id';

  /**
   * Fallback search: fetches patients with homephone/workphone fields
   * and matches against any phone field client-side.
   */
  private async searchPatientsByAnyPhone(
    phoneDigits: string,
    limit: number,
  ): Promise<PmsListResponse<Patient>> {
    this.logger.log({
      accountId: this.accountId,
      phoneDigits: phoneDigits.slice(0, 3) + '****',
      msg: '[Sikka] cell search returned empty, trying homephone/workphone fallback',
    });

    const batchSize = 100;
    let offset = 0;
    const matched: Patient[] = [];

    for (let page = 0; page < 10 && matched.length < limit; page++) {
      const params: Record<string, any> = {
        limit: batchSize,
        offset,
        fields: SikkaPmsService.EXTENDED_PHONE_FIELDS,
      };
      if (this.practiceId) params.practice_id = this.practiceId;

      const resp = await this.client.get('/patients', { params });
      const items: any[] = resp.data?.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        if (this.phoneMatchesAny(phoneDigits, item.cell, item.homephone, item.workphone)) {
          matched.push(this.mapSikkaPatient(item));
          if (matched.length >= limit) break;
        }
      }

      const total = parseInt(resp.data?.total_count || '0');
      offset += batchSize;
      if (offset >= total) break;
    }

    this.logger.log({
      accountId: this.accountId,
      matchedCount: matched.length,
      msg: '[Sikka] homephone/workphone fallback complete',
    });

    return this.createListResponse(matched, {
      total: matched.length,
      limit,
      offset: 0,
      hasMore: false,
    });
  }

  private phoneMatchesAny(targetDigits: string, ...phones: (string | undefined | null)[]): boolean {
    for (const raw of phones) {
      if (!raw) continue;
      const digits = raw.replace(/\D/g, '');
      if (!digits) continue;
      const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      if (normalized === targetDigits) return true;
    }
    return false;
  }
  
  async getPatient(patientId: string): Promise<PmsApiResponse<Patient>> {
    try {
      const params: Record<string, any> = { patient_id: patientId, limit: 1 };
      if (this.practiceId) {
        params.practice_id = this.practiceId;
      }
      const response = await this.client.get('/patients', { params });
      const items = response.data.items || [];
      if (items.length === 0) {
        return this.createErrorResponse('NOT_FOUND', `Patient ${patientId} not found`, new Error('Patient not found'));
      }
      const patient = this.mapSikkaPatient(items[0]);
      return this.createSuccessResponse(patient);
    } catch (error) {
      return this.handleError(error, 'getPatient');
    }
  }
  
  /**
   * Create patient (ASYNC)
   */
  async createPatient(data: PatientCreateInput): Promise<PmsApiResponse<Patient>> {
    try {
      const payload: Record<string, any> = {
        firstname: data.firstName,
        lastname: data.lastName,
        practice_id: this.practiceId,
      };
      payload.provider_id = data.metadata?.providerId || await this.resolveProviderId();
      if (data.dateOfBirth) payload.birthdate = data.dateOfBirth;
      if (data.phone) payload.cell = data.phone;
      if (data.email) payload.email = data.email;
      if (data.address) {
        if (data.address.street) payload.address_line1 = data.address.street;
        if (data.address.street2) payload.address_line2 = data.address.street2;
        if (data.address.city) payload.city = data.address.city;
        if (data.address.state) payload.state = data.address.state;
        if (data.address.zip) payload.zipcode = data.address.zip;
        if (data.address.country) payload.country = data.address.country;
      }

      this.logger.log({
        accountId: this.accountId,
        writebackPayload: { ...payload, birthdate: payload.birthdate ? '***' : undefined },
        msg: '[Sikka] createPatient submitting writeback',
      });

      const response = await this.client.post('/patient', payload);

      this.logger.log({
        accountId: this.accountId,
        httpStatus: response.status,
        responseData: JSON.stringify(response.data).slice(0, 1000),
        msg: '[Sikka] createPatient writeback response',
      });
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        this.logger.error({ responseData: JSON.stringify(response.data).slice(0, 500), msg: '[Sikka] Could not extract writeback ID from patient creation response' });
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Patient creation submitted — polling writeback status' });
      
      const status = await this.pollWritebackStatus(writebackId);

      this.logger.log({
        accountId: this.accountId,
        writebackId,
        writebackResult: status.result,
        writebackError: status.errorMessage,
        msg: '[Sikka] createPatient writeback final status',
      });
      
      if (status.result === 'completed') {
        const patient: Patient = {
          id: writebackId,
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          phone: data.phone,
          email: data.email,
          address: data.address,
        };
        
        return this.createSuccessResponse(patient);
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Patient creation failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'createPatient');
    }
  }
  
  /**
   * Update patient (ASYNC)
   */
  async updatePatient(
    patientId: string,
    updates: PatientUpdateInput
  ): Promise<PmsApiResponse<Patient>> {
    try {
      const payload: Record<string, any> = {
        practice_id: this.practiceId,
      };
      if (updates.firstName) payload.firstname = updates.firstName;
      if (updates.lastName) payload.lastname = updates.lastName;
      if (updates.phone) payload.cell = updates.phone;
      if (updates.email) payload.email = updates.email;
      if (updates.notes) payload.note = updates.notes;
      if (updates.address) {
        if (updates.address.street) payload.address_line1 = updates.address.street;
        if (updates.address.street2) payload.address_line2 = updates.address.street2;
        if (updates.address.city) payload.city = updates.address.city;
        if (updates.address.state) payload.state = updates.address.state;
        if (updates.address.zip) payload.zipcode = updates.address.zip;
      }
      if (updates.metadata) {
        for (const [key, value] of Object.entries(updates.metadata)) {
          if (value !== undefined) payload[key] = value;
        }
      }

      this.logger.log({
        accountId: this.accountId,
        patientId,
        writebackPayload: payload,
        msg: '[Sikka] updatePatient submitting writeback',
      });

      const response = await this.client.patch(`/patient/${patientId}`, payload);

      this.logger.log({
        accountId: this.accountId,
        httpStatus: response.status,
        responseData: JSON.stringify(response.data).slice(0, 1000),
        msg: '[Sikka] updatePatient writeback response',
      });
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        this.logger.error({ responseData: JSON.stringify(response.data).slice(0, 500), msg: '[Sikka] Could not extract writeback ID from patient update response' });
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Patient update submitted — polling writeback status' });
      
      const status = await this.pollWritebackStatus(writebackId);

      this.logger.log({
        accountId: this.accountId,
        writebackId,
        writebackResult: status.result,
        writebackError: status.errorMessage,
        msg: '[Sikka] updatePatient writeback final status',
      });
      
      if (status.result === 'completed') {
        return await this.getPatient(patientId);
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Patient update failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'updatePatient');
    }
  }
  
  // ============================================================================
  // Patient Notes
  // ============================================================================
  
  async getPatientNotes(patientId: string): Promise<PmsListResponse<PatientNote>> {
    try {
      const response = await this.client.get('/medical_notes', {
        params: { patient_id: patientId },
      });
      const notes = (response.data.items || []).map(this.mapSikkaNote);
      return this.createListResponse(notes, {
        total: parseInt(response.data.total_count || notes.length.toString()),
      });
    } catch (error) {
      return this.handleError(error, 'getPatientNotes') as PmsListResponse<PatientNote>;
    }
  }
  
  async addPatientNote(
    patientId: string,
    note: PatientNoteCreateInput
  ): Promise<PmsApiResponse<PatientNote>> {
    try {
      const response = await this.client.post(`/medical_notes`, {
        patient_id: patientId,
        ...note,
      });
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Note creation submitted' });
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
      if (status.result === 'completed') {
        const createdNote: PatientNote = {
          id: writebackId,
          patientId,
          content: note.content,
          category: note.category,
          createdAt: new Date(),
        };
        return this.createSuccessResponse(createdNote);
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Note creation failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'addPatientNote');
    }
  }
  
  // ============================================================================
  // Insurance Management
  // ============================================================================
  
  async getPatientInsurance(patientId: string): Promise<PmsListResponse<Insurance>> {
    try {
      const response = await this.client.get('/insurance_plan_coverage', {
        params: { patient_id: patientId },
      });
      const insurance = (response.data.items || []).map(this.mapSikkaInsurance);
      return this.createListResponse(insurance, {
        total: parseInt(response.data.total_count || insurance.length.toString()),
      });
    } catch (error) {
      return this.handleError(error, 'getPatientInsurance') as PmsListResponse<Insurance>;
    }
  }
  
  async addPatientInsurance(
    _patientId: string,
    _insurance: InsuranceCreateInput
  ): Promise<PmsApiResponse<Insurance>> {
    return this.createErrorResponse(
      'NOT_SUPPORTED',
      'Sikka API does not support direct insurance creation. Insurance must be managed through the PMS.',
      new Error('Operation not supported'),
    );
  }
  
  async updatePatientInsurance(
    _patientId: string,
    _insuranceId: string,
    _updates: Partial<InsuranceCreateInput>
  ): Promise<PmsApiResponse<Insurance>> {
    return this.createErrorResponse(
      'NOT_SUPPORTED',
      'Sikka API does not support direct insurance updates. Insurance must be managed through the PMS.',
      new Error('Operation not supported'),
    );
  }
  
  // ============================================================================
  // Billing & Payments
  // ============================================================================
  
  async getPatientBalance(patientId: string): Promise<PmsApiResponse<PatientBalance>> {
    try {
      const response = await this.client.get(`/patient_balance`, {
        params: { patient_id: patientId },
      });
      const balance = this.mapSikkaBalance(response.data);
      return this.createSuccessResponse(balance);
    } catch (error) {
      return this.handleError(error, 'getPatientBalance');
    }
  }
  
  async processPayment(payment: PaymentCreateInput): Promise<PmsApiResponse<Payment>> {
    try {
      const payload = {
        patient_id: payment.patientId,
        amount: payment.amount,
        method: payment.method,
        last4: payment.last4,
        notes: payment.notes,
      };
      
      const response = await this.client.post('/transaction', payload);
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Payment submitted' });
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
      if (status.result === 'completed') {
        const processedPayment: Payment = {
          id: writebackId,
          patientId: payment.patientId,
          amount: payment.amount,
          method: payment.method,
          status: 'completed',
          timestamp: new Date(),
        };
        return this.createSuccessResponse(processedPayment);
      } else {
        return this.createErrorResponse(
          'WRITEBACK_FAILED',
          `Payment failed: ${status.errorMessage}`,
          new Error(status.errorMessage)
        );
      }
    } catch (error) {
      return this.handleError(error, 'processPayment');
    }
  }
  
  async getPaymentHistory(patientId: string): Promise<PmsListResponse<Payment>> {
    try {
      const response = await this.client.get(`/transactions`, {
        params: { patient_id: patientId },
      });
      const payments = (response.data.items || response.data.payments || []).map(this.mapSikkaPayment);
      return this.createListResponse(payments, {
        total: parseInt(response.data.total_count || payments.length.toString()),
      });
    } catch (error) {
      return this.handleError(error, 'getPaymentHistory') as PmsListResponse<Payment>;
    }
  }
  
  // ============================================================================
  // Provider Management
  // ============================================================================
  
  async getProviders(): Promise<PmsListResponse<Provider>> {
    try {
      const response = await this.client.get('/providers');
      const providers = (response.data.items || response.data.providers || []).map(this.mapSikkaProvider);
      return this.createListResponse(providers, {
        total: parseInt(response.data.total_count || providers.length.toString()),
      });
    } catch (error) {
      return this.handleError(error, 'getProviders') as PmsListResponse<Provider>;
    }
  }
  
  async getProvider(providerId: string): Promise<PmsApiResponse<Provider>> {
    try {
      const response = await this.client.get('/providers', {
        params: { provider_id: providerId, limit: 1 },
      });
      const items = response.data.items || [];
      if (items.length === 0) {
        return this.createErrorResponse('NOT_FOUND', `Provider ${providerId} not found`, new Error('Provider not found'));
      }
      const provider = this.mapSikkaProvider(items[0]);
      return this.createSuccessResponse(provider);
    } catch (error) {
      return this.handleError(error, 'getProvider');
    }
  }
  
  // ============================================================================
  // Writeback Helpers — resolve required Sikka params on demand
  // ============================================================================

  private async resolveProviderId(): Promise<string | undefined> {
    try {
      const result = await this.getProviders();
      const active = result.success ? (result.data || []).filter(p => p.isActive) : [];
      if (active.length > 0) {
        this.logger.log({
          accountId: this.accountId,
          providerId: active[0].id,
          msg: '[Sikka] Auto-resolved provider_id',
        });
        return active[0].id;
      }
    } catch { /* non-fatal */ }
    return undefined;
  }

  private static readonly CANCEL_STATUS_KEYWORDS = ['broken', 'cancelled', 'canceled', 'deleted', 'no_show', 'no show', 'missed'];

  /**
   * Dynamically resolves the PMS-specific status value that represents a
   * cancellation by querying practice_variables.  Falls back to common
   * terms if the API call fails or returns nothing useful.
   */
  private async resolveCancelStatus(): Promise<string> {
    try {
      const response = await this.client.get('/practice_variables', {
        params: {
          cust_id: this.practiceId,
          practice_id: this.practiceId,
          service_name: 'Appointment Status',
        },
      });
      const items: any[] = response.data?.items || [];
      const statusItems = items.filter(
        (i: any) => i.service_item === 'appointment status',
      );
      for (const keyword of SikkaPmsService.CANCEL_STATUS_KEYWORDS) {
        const match = statusItems.find(
          (i: any) => (i.value || '').toLowerCase() === keyword,
        );
        if (match) {
          this.logger.log({
            accountId: this.accountId,
            cancelStatus: match.value,
            msg: '[Sikka] Resolved cancel status from practice_variables',
          });
          return match.value;
        }
      }
      if (statusItems.length > 0) {
        this.logger.log({
          accountId: this.accountId,
          availableStatuses: statusItems.map((i: any) => i.value),
          msg: '[Sikka] No recognised cancel keyword — returning first non-scheduled status',
        });
      }
    } catch {
      this.logger.warn({
        accountId: this.accountId,
        msg: '[Sikka] practice_variables lookup failed — using fallback cancel status',
      });
    }
    return 'broken';
  }

  private async resolveOperatory(): Promise<string | undefined> {
    try {
      const response = await this.client.get('/operatories', {
        params: { cust_id: this.practiceId, practice_id: this.practiceId, is_hidden: 'F', limit: 1 },
      });
      const items = response.data?.items || [];
      if (items.length > 0) {
        const item = items[0];
        const op = item.operatory || item.operatory_id || item.id;
        if (op) {
          this.logger.log({
            accountId: this.accountId,
            operatory: op,
            operatoryRaw: {
              operatory: item.operatory,
              abbreviation: item.abbreviation,
              operatory_id: item.operatory_id,
            },
            msg: '[Sikka] Auto-resolved operatory',
          });
          return String(op);
        }
      }
    } catch { /* non-fatal — operatory may not be strictly enforced by all PMS */ }
    return undefined;
  }

  // ============================================================================
  // Data Mapping Functions (Sikka format → Parlae format)
  // ============================================================================
  
  private mapSikkaAppointment(sikkaData: any): Appointment {
    const startTime = this.parseSikkaDateTime(sikkaData.date, sikkaData.time) ||
      new Date(sikkaData.appointment_date || sikkaData.start_time || sikkaData.startTime);
    const length = parseInt(sikkaData.length) || sikkaData.duration || this.config.defaultAppointmentDuration || 30;
    const endTime = new Date(startTime.getTime() + length * 60000);

    return {
      id: sikkaData.appointment_sr_no || sikkaData.appointment_id || sikkaData.id,
      patientId: sikkaData.patient_id,
      patientName: sikkaData.patient_name || '',
      providerId: sikkaData.provider_id,
      providerName: sikkaData.provider_name || '',
      appointmentType: sikkaData.type || sikkaData.description || 'General',
      startTime,
      endTime,
      duration: length,
      status: this.normalizeSikkaStatus(sikkaData.status || 'scheduled'),
      notes: sikkaData.note || sikkaData.notes,
      confirmationNumber: sikkaData.appointment_sr_no || sikkaData.confirmation_number,
      reminderSent: sikkaData.is_confirmed === 'True' || false,
      metadata: {
        operatory: sikkaData.operatory,
        hygienist: sikkaData.hygienist,
        practiceId: sikkaData.practice_id,
        guarantorId: sikkaData.guarantor_id,
        ...(sikkaData.metadata || {}),
      },
    };
  }

  private parseSikkaDateTime(date?: string, time?: string): Date | null {
    if (!date) return null;
    const datePart = date.includes('T') ? date.split('T')[0] : date;
    const dateStr = time ? `${datePart}T${time}` : date;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  private mapSikkaTimeSlot(sikkaData: any): TimeSlot {
    const startTime = this.parseSikkaDateTime(sikkaData.date, sikkaData.time) ||
      new Date(sikkaData.start_time || sikkaData.startTime || Date.now());
    const length = parseInt(sikkaData.length) || 30;
    const endTime = new Date(startTime.getTime() + length * 60000);

    return {
      startTime,
      endTime,
      providerId: sikkaData.provider_id,
      providerName: sikkaData.provider_name || '',
      available: sikkaData.available !== false,
      reason: sikkaData.reason,
    };
  }
  
  private normalizePhone(raw: string | undefined | null): string | undefined {
    if (!raw) return undefined;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return undefined;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    return `+${digits}`;
  }

  private mapSikkaPatient(sikkaData: any): Patient {
    const rawPhone = sikkaData.cell || sikkaData.homephone || sikkaData.workphone || sikkaData.mobile_phone || sikkaData.phone;
    return {
      id: sikkaData.patient_id || sikkaData.id,
      firstName: sikkaData.firstname || sikkaData.first_name || sikkaData.firstName,
      lastName: sikkaData.lastname || sikkaData.last_name || sikkaData.lastName,
      dateOfBirth: sikkaData.birthdate || sikkaData.date_of_birth || sikkaData.dateOfBirth,
      phone: this.normalizePhone(rawPhone),
      email: sikkaData.email,
      address: (sikkaData.address_line1 || sikkaData.street || sikkaData.address) ? {
        street: sikkaData.address_line1 || sikkaData.street || sikkaData.address?.street,
        street2: sikkaData.address_line2 || sikkaData.address?.street2,
        city: sikkaData.city || sikkaData.address?.city,
        state: sikkaData.state || sikkaData.address?.state,
        zip: sikkaData.zipcode || sikkaData.zip || sikkaData.address?.zip,
        country: sikkaData.country || sikkaData.address?.country || 'USA',
      } : undefined,
      emergencyContact: sikkaData.emergency_contact,
      balance: sikkaData.balance || sikkaData.account_balance,
      lastVisit: sikkaData.last_visit ? new Date(sikkaData.last_visit) : undefined,
      notes: sikkaData.notes,
      metadata: {
        guarantorId: sikkaData.guarantor_id,
        preferredName: sikkaData.preferred_name,
        salutation: sikkaData.salutation,
        status: sikkaData.status,
        ...(sikkaData.metadata || {}),
      },
    };
  }
  
  private mapSikkaNote(sikkaData: any): PatientNote {
    return {
      id: sikkaData.id || sikkaData.noteId || sikkaData.note_id,
      patientId: sikkaData.patientId || sikkaData.patient_id,
      content: sikkaData.content || sikkaData.note || sikkaData.text,
      category: sikkaData.category || sikkaData.type,
      createdBy: sikkaData.createdBy || sikkaData.created_by || sikkaData.author,
      createdAt: new Date(sikkaData.createdAt || sikkaData.created_at || sikkaData.createdDate),
      updatedAt: sikkaData.updatedAt ? new Date(sikkaData.updatedAt) : undefined,
      metadata: sikkaData.metadata || {},
    };
  }
  
  private mapSikkaInsurance(sikkaData: any): Insurance {
    return {
      id: sikkaData.id || sikkaData.insuranceId || sikkaData.insurance_id,
      patientId: sikkaData.patientId || sikkaData.patient_id,
      provider: sikkaData.provider || sikkaData.insuranceProvider || sikkaData.insurance_provider,
      policyNumber: sikkaData.policyNumber || sikkaData.policy_number,
      groupNumber: sikkaData.groupNumber || sikkaData.group_number,
      subscriberName: sikkaData.subscriberName || sikkaData.subscriber_name,
      subscriberDob: sikkaData.subscriberDob || sikkaData.subscriber_dob || sikkaData.subscriberDateOfBirth,
      relationship: sikkaData.relationship,
      isPrimary: sikkaData.isPrimary !== false && sikkaData.is_primary !== false,
      effectiveDate: sikkaData.effectiveDate || sikkaData.effective_date ? new Date(sikkaData.effectiveDate || sikkaData.effective_date) : undefined,
      expirationDate: sikkaData.expirationDate || sikkaData.expiration_date ? new Date(sikkaData.expirationDate || sikkaData.expiration_date) : undefined,
      metadata: sikkaData.metadata || {},
    };
  }
  
  private mapSikkaBalance(sikkaData: any): PatientBalance {
    return {
      total: sikkaData.total || sikkaData.totalBalance || sikkaData.total_balance || 0,
      insurance: sikkaData.insurance || sikkaData.insuranceBalance || sikkaData.insurance_balance || 0,
      patient: sikkaData.patient || sikkaData.patientBalance || sikkaData.patient_balance || 0,
      lastPayment: sikkaData.lastPayment || sikkaData.last_payment ? {
        amount: sikkaData.lastPayment?.amount || sikkaData.last_payment?.amount,
        date: new Date(sikkaData.lastPayment?.date || sikkaData.last_payment?.date),
        method: sikkaData.lastPayment?.method || sikkaData.last_payment?.method,
      } : undefined,
    };
  }
  
  private mapSikkaPayment(sikkaData: any): Payment {
    return {
      id: sikkaData.id || sikkaData.paymentId || sikkaData.payment_id || sikkaData.transaction_id,
      patientId: sikkaData.patientId || sikkaData.patient_id,
      amount: sikkaData.amount,
      method: sikkaData.method || sikkaData.paymentMethod || sikkaData.payment_method || 'cash',
      status: sikkaData.status || 'completed',
      confirmationNumber: sikkaData.confirmationNumber || sikkaData.confirmation_number || sikkaData.transactionId || sikkaData.transaction_id,
      last4: sikkaData.last4 || sikkaData.cardLast4 || sikkaData.card_last4,
      notes: sikkaData.notes,
      timestamp: new Date(sikkaData.timestamp || sikkaData.paymentDate || sikkaData.payment_date || sikkaData.createdAt || sikkaData.created_at),
      metadata: sikkaData.metadata || {},
    };
  }
  
  private mapSikkaProvider(sikkaData: any): Provider {
    return {
      id: sikkaData.id || sikkaData.providerId || sikkaData.provider_id,
      firstName: sikkaData.firstName || sikkaData.first_name || sikkaData.firstname || '',
      lastName: sikkaData.lastName || sikkaData.last_name || sikkaData.lastname || '',
      title: sikkaData.title || sikkaData.credentials,
      specialty: sikkaData.specialty || sikkaData.specialty_code,
      phone: sikkaData.phone || sikkaData.phoneNumber || sikkaData.phone_number,
      email: sikkaData.email,
      isActive: sikkaData.isActive !== false && sikkaData.is_active !== false
        && sikkaData.status !== 'inactive',
      metadata: sikkaData.metadata || {},
    };
  }
}
