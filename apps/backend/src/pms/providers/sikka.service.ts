import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { StructuredLogger } from '../../common/structured-logger';
import { BasePmsService } from '../interfaces/pms-service.interface';
import type {
  Appointment,
  AppointmentAvailabilityQuery,
  AppointmentCancelInput,
  AppointmentCreateInput,
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
        return; // Token is still valid
      }
    }
    
    // Need to refresh or get initial token
    if (this.refreshKey) {
      await this.refreshToken();
    } else if (this.officeId && this.secretKey) {
      await this.getInitialToken();
    } else {
      // Need to fetch authorized_practices first
      await this.fetchAuthorizedPractices();
      await this.getInitialToken();
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
        
        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        this.logger.error({ writebackId, attempt, maxAttempts, error: error instanceof Error ? error.message : error, msg: '[Sikka] Error polling writeback status' });
        
        if (attempt === maxAttempts) {
          throw new Error('Writeback status check timeout');
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('Writeback timeout - status remained pending');
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
      if (filters?.status) {
        params.status = filters.status;
      }
      
      const response = await this.client.get('/appointments', { params });
      
      // Sikka v4 API returns { items: [], total_count: 0, pagination: {...} }
      const appointments = (response.data.items || []).map((item: any) => this.mapSikkaAppointment(item));
      
      return this.createListResponse(appointments, {
        total: parseInt(response.data.total_count || '0'),
        limit: params.limit,
        offset: params.offset,
        hasMore: response.data.pagination?.next !== '',
      });
    } catch (error) {
      return this.handleError(error, 'getAppointments') as PmsListResponse<Appointment>;
    }
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

      const slots = (response.data.items || []).map((item: any) => this.mapSikkaTimeSlot(item));
      
      return this.createSuccessResponse(slots);
    } catch (error) {
      return this.handleError(error, 'checkAvailability');
    }
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
      if (data.appointmentType) payload.type = data.appointmentType;
      if (data.notes) payload.note = data.notes;
      if (data.metadata?.operatory) payload.operatory = data.metadata.operatory;
      if (data.metadata?.description) payload.description = data.metadata.description;

      const response = await this.client.post('/appointment', payload);
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        this.logger.error({ responseData: JSON.stringify(response.data).slice(0, 500), msg: '[Sikka] Could not extract writeback ID from appointment booking response' });
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Appointment booking submitted' });
      
      // TODO: Save to PmsWriteback table
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
      if (status.result === 'completed') {
        // Return the appointment data
        const appointment: Appointment = {
          id: writebackId,
          patientId: data.patientId,
          patientName: '', // Will be populated from PMS
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
      if (updates.providerId) {
        payload.provider_id = updates.providerId;
      }
      if (updates.appointmentType) {
        payload.type = updates.appointmentType;
      }
      if (updates.notes) {
        payload.description = updates.notes;
      }
      
      const response = await this.client.put(`/appointments/${appointmentId}`, payload);
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Appointment update submitted' });
      
      // TODO: Save to PmsWriteback table
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
      if (status.result === 'completed') {
        // Fetch updated appointment
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
      const payload: Record<string, any> = {
        appointment_sr_no: appointmentId,
        op: 'replace',
        path: '/status',
        value: 'Cancelled',
        practice_id: this.practiceId,
      };
      if (input.reason) {
        payload.cancellation_note = input.reason;
      }

      const response = await this.client.patch(`/appointments/${appointmentId}`, payload);
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Appointment cancellation submitted' });
      
      // TODO: Save to PmsWriteback table
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
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
  
  async searchPatients(query: PatientSearchQuery): Promise<PmsListResponse<Patient>> {
    try {
      const params: Record<string, any> = {
        limit: query.limit || 10,
        offset: query.offset || 0,
      };

      if (query.cell) {
        params.cell = query.cell;
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
          params.cell = query.query.trim();
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

      const patients = (response.data.items || []).map(this.mapSikkaPatient);
      
      return this.createListResponse(patients, {
        total: parseInt(response.data.total_count || '0'),
        limit: params.limit,
        offset: params.offset,
        hasMore: response.data.pagination?.next !== '',
      });
    } catch (error) {
      return this.handleError(error, 'searchPatients') as PmsListResponse<Patient>;
    }
  }
  
  async getPatient(patientId: string): Promise<PmsApiResponse<Patient>> {
    try {
      const response = await this.client.get('/patients', {
        params: { patient_id: patientId, limit: 1 },
      });
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

      const response = await this.client.post('/patient', payload);
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        this.logger.error({ responseData: JSON.stringify(response.data).slice(0, 500), msg: '[Sikka] Could not extract writeback ID from patient creation response' });
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Patient creation submitted' });
      
      // TODO: Save to PmsWriteback table
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
      if (status.result === 'completed') {
        // Return the patient data (ID will be in writeback response)
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
      const response = await this.client.patch(`/patient/${patientId}`, updates);
      
      const writebackId = this.extractWritebackId(response.data);
      if (!writebackId) {
        this.logger.error({ responseData: JSON.stringify(response.data).slice(0, 500), msg: '[Sikka] Could not extract writeback ID from patient update response' });
        return this.createErrorResponse('WRITEBACK_PARSE_ERROR', 'Could not extract writeback ID from Sikka response', new Error('Missing writeback ID'));
      }
      
      this.logger.log({ writebackId, msg: '[Sikka] Patient update submitted' });
      
      // TODO: Save to PmsWriteback table
      
      // Poll for completion
      const status = await this.pollWritebackStatus(writebackId);
      
      if (status.result === 'completed') {
        // Fetch updated patient
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
      status: sikkaData.status || 'scheduled',
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
    const dateStr = time ? `${date}T${time}` : date;
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
  
  private mapSikkaPatient(sikkaData: any): Patient {
    return {
      id: sikkaData.patient_id || sikkaData.id,
      firstName: sikkaData.firstname || sikkaData.first_name || sikkaData.firstName,
      lastName: sikkaData.lastname || sikkaData.last_name || sikkaData.lastName,
      dateOfBirth: sikkaData.birthdate || sikkaData.date_of_birth || sikkaData.dateOfBirth,
      phone: sikkaData.cell || sikkaData.homephone || sikkaData.workphone || sikkaData.mobile_phone || sikkaData.phone,
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
      firstName: sikkaData.firstName || sikkaData.first_name,
      lastName: sikkaData.lastName || sikkaData.last_name,
      title: sikkaData.title || sikkaData.credentials,
      specialty: sikkaData.specialty,
      phone: sikkaData.phone || sikkaData.phoneNumber || sikkaData.phone_number,
      email: sikkaData.email,
      isActive: sikkaData.isActive !== false && sikkaData.is_active !== false,
      metadata: sikkaData.metadata || {},
    };
  }
}
