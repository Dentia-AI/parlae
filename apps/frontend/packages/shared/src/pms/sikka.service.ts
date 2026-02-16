// HTTP client helper (replaces axios to avoid bundling issues)
class HttpClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private requestInterceptor?: () => Promise<Record<string, string>>;

  constructor(opts: { baseURL: string; timeout: number; headers: Record<string, string> }) {
    this.baseURL = opts.baseURL;
    this.timeout = opts.timeout;
    this.defaultHeaders = opts.headers;
  }

  setRequestInterceptor(fn: () => Promise<Record<string, string>>) {
    this.requestInterceptor = fn;
  }

  private async request(method: string, path: string, opts?: { params?: any; data?: any }) {
    const headers = { ...this.defaultHeaders };
    if (this.requestInterceptor) {
      Object.assign(headers, await this.requestInterceptor());
    }
    const url = new URL(path, this.baseURL);
    if (opts?.params) {
      Object.entries(opts.params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: opts?.data ? JSON.stringify(opts.data) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { response: { status: res.status, data } });
      return { data };
    } finally {
      clearTimeout(timer);
    }
  }

  get(path: string, opts?: { params?: any; headers?: Record<string, string> }) { return this.request('GET', path, opts); }
  post(path: string, data?: any, opts?: { headers?: Record<string, string> }) { return this.request('POST', path, { data }); }
  patch(path: string, data?: any) { return this.request('PATCH', path, { data }); }
  delete(path: string, opts?: { data?: any }) { return this.request('DELETE', path, { data: opts?.data }); }
}

function isHttpError(err: unknown): err is { response: { status: number; data: any } } {
  return typeof err === 'object' && err !== null && 'response' in err;
}
import { BasePmsService } from './pms-service.interface';
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
} from './types';

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
 * 2. Poll GET /writebacks?id={id} → Check status (pending/completed/failed)
 * 3. Return result when completed
 */
export class SikkaPmsService extends BasePmsService {
  private client: HttpClient;
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
    
    // Load token state (will be loaded from database)
    this.requestKey = creds.requestKey;
    this.refreshKey = creds.refreshKey;
    this.officeId = creds.officeId;
    this.secretKey = creds.secretKey;
    
    this.client = new HttpClient({
      baseURL: this.baseUrl,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.client.setRequestInterceptor(async () => {
      await this.ensureValidToken();
      return this.requestKey ? { 'Request-Key': this.requestKey } : {};
    });
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
      console.log('[Sikka] Fetching authorized practices...');
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${this.baseUrl}/authorized_practices`, {
        headers: { 'App-Id': this.appId, 'App-Key': this.appKey },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const response = { data: await res.json() };
      
      const practices = response.data.items || [];
      if (practices.length === 0) {
        throw new Error('No authorized practices found');
      }
      
      // Use first practice (or find matching practice_id if specified in config)
      const practice = practices[0];
      this.officeId = practice.office_id;
      this.secretKey = practice.secret_key;
      
      console.log(`[Sikka] Found office_id: ${this.officeId}`);
      
      // TODO: Save to database
      
    } catch (error) {
      console.error('[Sikka] Failed to fetch authorized practices:', error);
      throw new Error('Failed to fetch Sikka authorized practices. Please check your App-Id and App-Key.');
    }
  }
  
  /**
   * Get initial request_key using office_id and secret_key
   */
  private async getInitialToken(): Promise<void> {
    try {
      console.log('[Sikka] Getting initial token with request_key grant...');
      
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${this.baseUrl}/request_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'request_key',
          office_id: this.officeId,
          secret_key: this.secretKey,
          app_id: this.appId,
          app_key: this.appKey,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`Sikka authentication failed (${res.status}): ${JSON.stringify(data)}`);
      }

      if (!data.request_key || !data.refresh_key) {
        throw new Error('Invalid token response from Sikka API');
      }

      this.requestKey = data.request_key;
      this.refreshKey = data.refresh_key;

      const expiresInSeconds = parseInt(data.expires_in) || 86400;
      this.tokenExpiry = new Date(Date.now() + expiresInSeconds * 1000);

      console.log(`[Sikka] Token obtained successfully, expires in ${expiresInSeconds}s`);

    } catch (error) {
      console.error('[Sikka] Token request failed:', error);

      if (isHttpError(error)) {
        throw new Error(`Sikka authentication failed (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }

      throw new Error('Failed to authenticate with Sikka API. Please check your credentials.');
    }
  }
  
  /**
   * Refresh request_key using refresh_key
   */
  private async refreshToken(): Promise<void> {
    try {
      console.log('[Sikka] Refreshing token with refresh_key grant...');
      
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${this.baseUrl}/request_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_key',
          refresh_key: this.refreshKey,
          app_id: this.appId,
          app_key: this.appKey,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const data = await res.json();

      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { response: { status: res.status, data } });
      }

      if (!data.request_key || !data.refresh_key) {
        throw new Error('Invalid token response from Sikka API');
      }

      this.requestKey = data.request_key;
      this.refreshKey = data.refresh_key;

      const expiresInSeconds = parseInt(data.expires_in) || 86400;
      this.tokenExpiry = new Date(Date.now() + expiresInSeconds * 1000);

      console.log(`[Sikka] Token refreshed successfully, expires in ${expiresInSeconds}s`);

    } catch (error) {
      console.error('[Sikka] Token refresh failed:', error);

      if (isHttpError(error) && error.response.status === 401) {
        console.warn('[Sikka] Refresh key expired, getting new token...');
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
   * Poll writeback status until completed or failed
   */
  private async pollWritebackStatus(writebackId: string, maxAttempts = 10): Promise<{
    result: string;
    errorMessage?: string;
  }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const wbUrl = new URL(`${this.baseUrl}/writebacks`);
        wbUrl.searchParams.set('id', writebackId);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const wbRes = await fetch(wbUrl.toString(), {
          headers: { 'App-Id': this.appId, 'App-Key': this.appKey },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const wbData = await wbRes.json();

        const writebacks = wbData.items || [];
        if (writebacks.length === 0) {
          throw new Error(`Writeback ${writebackId} not found`);
        }
        
        const writeback = writebacks[0];
        const result = writeback.result;
        
        console.log(`[Sikka] Writeback ${writebackId} status: ${result} (attempt ${attempt}/${maxAttempts})`);
        
        // TODO: Update database with status
        
        if (result === 'completed' || result === 'failed') {
          return {
            result,
            errorMessage: writeback.error_message,
          };
        }
        
        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`[Sikka] Error polling writeback status (attempt ${attempt}):`, error);
        
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
      
      if (filters?.startDate) {
        params.startDate = filters.startDate.toISOString().split('T')[0];
      }
      if (filters?.endDate) {
        params.endDate = filters.endDate.toISOString().split('T')[0];
      }
      if (filters?.patientId) {
        params.patientId = filters.patientId;
      }
      if (filters?.providerId) {
        params.providerId = filters.providerId;
      }
      if (filters?.status) {
        params.status = filters.status;
      }
      
      const response = await this.client.get('/appointments', { params });
      
      // Sikka v4 API returns { items: [], total_count: 0, pagination: {...} }
      const appointments = (response.data.items || []).map(this.mapSikkaAppointment);
      
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
        date: query.date,
        duration: query.duration || this.config.defaultAppointmentDuration || 30,
      };
      
      if (query.providerId) {
        params.providerId = query.providerId;
      }
      if (query.appointmentType) {
        params.appointmentType = query.appointmentType;
      }
      
      const response = await this.client.get('/appointments_available_slots', { params });
      
      const slots = (response.data.items || []).map(this.mapSikkaTimeSlot);
      
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
      const payload = {
        patient_id: data.patientId,
        provider_id: data.providerId,
        appointment_type: data.appointmentType,
        start_time: data.startTime.toISOString(),
        duration: data.duration,
        notes: data.notes,
      };
      
      // Submit writeback (note: singular '/appointment' not '/appointments')
      const response = await this.client.post('/appointment', payload);
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Appointment booking submitted, writeback ID: ${writebackId}`);
      
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
          status: 'Scheduled',
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
      const payload: any = {};
      
      if (updates.startTime) {
        payload.start_time = updates.startTime.toISOString();
      }
      if (updates.duration !== undefined) {
        payload.duration = updates.duration;
      }
      if (updates.providerId) {
        payload.provider_id = updates.providerId;
      }
      if (updates.appointmentType) {
        payload.appointment_type = updates.appointmentType;
      }
      if (updates.notes) {
        payload.notes = updates.notes;
      }
      
      // Submit writeback
      const response = await this.client.patch(`/appointments/${appointmentId}`, payload);
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Appointment update submitted, writeback ID: ${writebackId}`);
      
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
      // Submit writeback
      const response = await this.client.delete(`/appointments/${appointmentId}`, {
        data: {
          reason: input.reason,
        },
      });
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Appointment cancellation submitted, writeback ID: ${writebackId}`);
      
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
      const params = {
        query: query.query,
        limit: query.limit || 10,
        offset: query.offset || 0,
      };
      
      const response = await this.client.get('/patients/search', { params });
      
      // Sikka v4 API returns { items: [], total_count: 0, pagination: {...} }
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
      const response = await this.client.get(`/patients/${patientId}`);
      const patient = this.mapSikkaPatient(response.data);
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
      const payload = {
        first_name: data.firstName,
        last_name: data.lastName,
        date_of_birth: data.dateOfBirth,
        phone: data.phone,
        mobile_phone: data.phone,
        email: data.email,
        address: data.address,
      };
      
      // Submit writeback (note: singular '/patient' not '/patients')
      const response = await this.client.post('/patient', payload);
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Patient creation submitted, writeback ID: ${writebackId}`);
      
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
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Patient update submitted, writeback ID: ${writebackId}`);
      
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
      const response = await this.client.get(`/patients/${patientId}/notes`);
      const notes = (response.data.items || response.data.notes || []).map(this.mapSikkaNote);
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
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Note creation submitted, writeback ID: ${writebackId}`);
      
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
      const response = await this.client.get(`/patients/${patientId}/insurance`);
      const insurance = (response.data.items || response.data.insurance || []).map(this.mapSikkaInsurance);
      return this.createListResponse(insurance, {
        total: parseInt(response.data.total_count || insurance.length.toString()),
      });
    } catch (error) {
      return this.handleError(error, 'getPatientInsurance') as PmsListResponse<Insurance>;
    }
  }
  
  async addPatientInsurance(
    patientId: string,
    insurance: InsuranceCreateInput
  ): Promise<PmsApiResponse<Insurance>> {
    try {
      const response = await this.client.post(`/patients/${patientId}/insurance`, insurance);
      const createdInsurance = this.mapSikkaInsurance(response.data);
      return this.createSuccessResponse(createdInsurance);
    } catch (error) {
      return this.handleError(error, 'addPatientInsurance');
    }
  }
  
  async updatePatientInsurance(
    patientId: string,
    insuranceId: string,
    updates: Partial<InsuranceCreateInput>
  ): Promise<PmsApiResponse<Insurance>> {
    try {
      const response = await this.client.patch(
        `/patients/${patientId}/insurance/${insuranceId}`,
        updates
      );
      const updatedInsurance = this.mapSikkaInsurance(response.data);
      return this.createSuccessResponse(updatedInsurance);
    } catch (error) {
      return this.handleError(error, 'updatePatientInsurance');
    }
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
      
      const writebackId = response.data.id;
      
      console.log(`[Sikka] Payment submitted, writeback ID: ${writebackId}`);
      
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
      const response = await this.client.get(`/providers/${providerId}`);
      const provider = this.mapSikkaProvider(response.data);
      return this.createSuccessResponse(provider);
    } catch (error) {
      return this.handleError(error, 'getProvider');
    }
  }
  
  // ============================================================================
  // Data Mapping Functions (Sikka format → Parlae format)
  // ============================================================================
  
  private mapSikkaAppointment(sikkaData: any): Appointment {
    return {
      id: sikkaData.appointment_id || sikkaData.id,
      patientId: sikkaData.patient_id,
      patientName: sikkaData.patient_name || `${sikkaData.patient_first_name || ''} ${sikkaData.patient_last_name || ''}`.trim(),
      providerId: sikkaData.provider_id,
      providerName: sikkaData.provider_name || sikkaData.providerId,
      appointmentType: sikkaData.appointment_type || sikkaData.type || 'General',
      startTime: new Date(sikkaData.appointment_date || sikkaData.start_time || sikkaData.startTime),
      endTime: sikkaData.end_time ? new Date(sikkaData.end_time) : undefined,
      duration: sikkaData.duration || this.config.defaultAppointmentDuration || 30,
      status: sikkaData.status || sikkaData.appointment_status || 'Scheduled',
      notes: sikkaData.notes || sikkaData.appointment_notes,
      confirmationNumber: sikkaData.confirmation_number || sikkaData.confirmationCode,
      reminderSent: sikkaData.reminder_sent || false,
      metadata: sikkaData.metadata || {},
    };
  }
  
  private mapSikkaTimeSlot(sikkaData: any): TimeSlot {
    return {
      startTime: new Date(sikkaData.start_time || sikkaData.startTime),
      endTime: new Date(sikkaData.end_time || sikkaData.endTime),
      providerId: sikkaData.provider_id || sikkaData.providerId,
      providerName: sikkaData.provider_name || sikkaData.providerName,
      available: sikkaData.available !== false,
      reason: sikkaData.reason,
    };
  }
  
  private mapSikkaPatient(sikkaData: any): Patient {
    return {
      id: sikkaData.patient_id || sikkaData.id,
      firstName: sikkaData.first_name || sikkaData.firstName,
      lastName: sikkaData.last_name || sikkaData.lastName,
      dateOfBirth: sikkaData.date_of_birth || sikkaData.dateOfBirth || sikkaData.dob,
      phone: sikkaData.mobile_phone || sikkaData.phone || sikkaData.phoneNumber,
      email: sikkaData.email,
      address: (sikkaData.address || sikkaData.street) ? {
        street: sikkaData.street || sikkaData.address?.street || sikkaData.address?.line1,
        street2: sikkaData.address?.street2 || sikkaData.address?.line2,
        city: sikkaData.city || sikkaData.address?.city,
        state: sikkaData.state || sikkaData.address?.state,
        zip: sikkaData.zip || sikkaData.zipcode || sikkaData.address?.zip || sikkaData.address?.zipCode,
        country: sikkaData.country || sikkaData.address?.country || 'USA',
      } : undefined,
      emergencyContact: sikkaData.emergency_contact || sikkaData.emergencyContact,
      balance: sikkaData.balance || sikkaData.account_balance,
      lastVisit: sikkaData.last_visit ? new Date(sikkaData.last_visit) : undefined,
      notes: sikkaData.notes,
      metadata: sikkaData.metadata || {},
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
