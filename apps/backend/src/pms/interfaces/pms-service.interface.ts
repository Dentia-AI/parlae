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
  PmsCredentials,
  PmsFeatures,
  PmsListResponse,
  Provider,
  TimeSlot,
} from './pms.types';

/**
 * Abstract PMS Service Interface
 * 
 * All PMS providers must implement this interface to ensure consistent behavior
 * across different practice management systems.
 * 
 * HIPAA Compliance:
 * - All methods that handle PHI must be logged via audit trail
 * - All PHI must be encrypted in transit (TLS 1.3+) and at rest
 * - Implement proper error handling to prevent PHI leakage in logs
 */
export interface IPmsService {
  // ============================================================================
  // Connection & Configuration
  // ============================================================================
  
  /**
   * Test the connection to the PMS
   * @returns Success status and optional message
   */
  testConnection(): Promise<PmsApiResponse<{ connectionValid: boolean; message?: string }>>;
  
  /**
   * Get available features for this PMS integration
   * @returns List of supported features
   */
  getFeatures(): Promise<PmsApiResponse<PmsFeatures>>;
  
  /**
   * Update configuration for this PMS integration
   * @param config New configuration
   */
  updateConfig(config: Partial<PmsConfig>): Promise<PmsApiResponse<PmsConfig>>;
  
  // ============================================================================
  // Appointment Management
  // ============================================================================
  
  /**
   * List appointments with optional filters
   * @param filters Query filters (date range, patient, provider, status)
   */
  getAppointments(filters?: {
    startDate?: Date;
    endDate?: Date;
    patientId?: string;
    providerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PmsListResponse<Appointment>>;
  
  /**
   * Get a specific appointment by ID
   * @param appointmentId PMS appointment ID
   */
  getAppointment(appointmentId: string): Promise<PmsApiResponse<Appointment>>;
  
  /**
   * Check available time slots for appointments
   * @param query Availability query parameters
   */
  checkAvailability(query: AppointmentAvailabilityQuery): Promise<PmsApiResponse<TimeSlot[]>>;
  
  /**
   * Book a new appointment
   * @param data Appointment details
   */
  bookAppointment(data: AppointmentCreateInput): Promise<PmsApiResponse<Appointment>>;
  
  /**
   * Reschedule an existing appointment
   * @param appointmentId PMS appointment ID
   * @param updates Updated appointment details
   */
  rescheduleAppointment(
    appointmentId: string,
    updates: AppointmentUpdateInput
  ): Promise<PmsApiResponse<Appointment>>;
  
  /**
   * Cancel an appointment
   * @param appointmentId PMS appointment ID
   * @param input Cancellation details
   */
  cancelAppointment(
    appointmentId: string,
    input: AppointmentCancelInput
  ): Promise<PmsApiResponse<{ cancelled: boolean; message?: string }>>;
  
  // ============================================================================
  // Patient Management (PHI - Handle with care!)
  // ============================================================================
  
  /**
   * Search for patients by name, phone, or email
   * @param query Search query
   */
  searchPatients(query: PatientSearchQuery): Promise<PmsListResponse<Patient>>;
  
  /**
   * Get patient information by ID
   * @param patientId PMS patient ID
   */
  getPatient(patientId: string): Promise<PmsApiResponse<Patient>>;
  
  /**
   * Create a new patient
   * @param data Patient details
   */
  createPatient(data: PatientCreateInput): Promise<PmsApiResponse<Patient>>;
  
  /**
   * Update patient information
   * @param patientId PMS patient ID
   * @param updates Updated patient details
   */
  updatePatient(
    patientId: string,
    updates: PatientUpdateInput
  ): Promise<PmsApiResponse<Patient>>;
  
  // ============================================================================
  // Patient Notes
  // ============================================================================
  
  /**
   * Get notes for a patient
   * @param patientId PMS patient ID
   */
  getPatientNotes(patientId: string): Promise<PmsListResponse<PatientNote>>;
  
  /**
   * Add a note to a patient's record
   * @param patientId PMS patient ID
   * @param note Note details
   */
  addPatientNote(
    patientId: string,
    note: PatientNoteCreateInput
  ): Promise<PmsApiResponse<PatientNote>>;
  
  // ============================================================================
  // Insurance Management (PHI - Handle with care!)
  // ============================================================================
  
  /**
   * Get insurance information for a patient
   * @param patientId PMS patient ID
   */
  getPatientInsurance(patientId: string): Promise<PmsListResponse<Insurance>>;
  
  /**
   * Add insurance to a patient's record
   * @param patientId PMS patient ID
   * @param insurance Insurance details
   */
  addPatientInsurance(
    patientId: string,
    insurance: InsuranceCreateInput
  ): Promise<PmsApiResponse<Insurance>>;
  
  /**
   * Update insurance information
   * @param patientId PMS patient ID
   * @param insuranceId PMS insurance ID
   * @param updates Updated insurance details
   */
  updatePatientInsurance(
    patientId: string,
    insuranceId: string,
    updates: Partial<InsuranceCreateInput>
  ): Promise<PmsApiResponse<Insurance>>;
  
  // ============================================================================
  // Billing & Payments
  // ============================================================================
  
  /**
   * Get patient balance information
   * @param patientId PMS patient ID
   */
  getPatientBalance(patientId: string): Promise<PmsApiResponse<PatientBalance>>;
  
  /**
   * Process a payment
   * @param payment Payment details
   */
  processPayment(payment: PaymentCreateInput): Promise<PmsApiResponse<Payment>>;
  
  /**
   * Get payment history for a patient
   * @param patientId PMS patient ID
   */
  getPaymentHistory(patientId: string): Promise<PmsListResponse<Payment>>;
  
  // ============================================================================
  // Provider Management
  // ============================================================================
  
  /**
   * List all providers
   */
  getProviders(): Promise<PmsListResponse<Provider>>;
  
  /**
   * Get a specific provider by ID
   * @param providerId PMS provider ID
   */
  getProvider(providerId: string): Promise<PmsApiResponse<Provider>>;
}

/**
 * Base PMS Service Class
 * 
 * Provides common functionality for all PMS service implementations.
 */
export abstract class BasePmsService implements IPmsService {
  protected accountId: string;
  protected credentials: PmsCredentials;
  protected config: PmsConfig;
  
  constructor(
    accountId: string,
    credentials: PmsCredentials,
    config: PmsConfig = {}
  ) {
    this.accountId = accountId;
    this.credentials = credentials;
    this.config = config;
  }
  
  // Abstract methods that must be implemented by subclasses
  abstract testConnection(): Promise<PmsApiResponse<{ connectionValid: boolean; message?: string }>>;
  abstract getFeatures(): Promise<PmsApiResponse<PmsFeatures>>;
  abstract updateConfig(config: Partial<PmsConfig>): Promise<PmsApiResponse<PmsConfig>>;
  abstract getAppointments(filters?: any): Promise<PmsListResponse<Appointment>>;
  abstract getAppointment(appointmentId: string): Promise<PmsApiResponse<Appointment>>;
  abstract checkAvailability(query: AppointmentAvailabilityQuery): Promise<PmsApiResponse<TimeSlot[]>>;
  abstract bookAppointment(data: AppointmentCreateInput): Promise<PmsApiResponse<Appointment>>;
  abstract rescheduleAppointment(appointmentId: string, updates: AppointmentUpdateInput): Promise<PmsApiResponse<Appointment>>;
  abstract cancelAppointment(appointmentId: string, input: AppointmentCancelInput): Promise<PmsApiResponse<{ cancelled: boolean; message?: string }>>;
  abstract searchPatients(query: PatientSearchQuery): Promise<PmsListResponse<Patient>>;
  abstract getPatient(patientId: string): Promise<PmsApiResponse<Patient>>;
  abstract createPatient(data: PatientCreateInput): Promise<PmsApiResponse<Patient>>;
  abstract updatePatient(patientId: string, updates: PatientUpdateInput): Promise<PmsApiResponse<Patient>>;
  abstract getPatientNotes(patientId: string): Promise<PmsListResponse<PatientNote>>;
  abstract addPatientNote(patientId: string, note: PatientNoteCreateInput): Promise<PmsApiResponse<PatientNote>>;
  abstract getPatientInsurance(patientId: string): Promise<PmsListResponse<Insurance>>;
  abstract addPatientInsurance(patientId: string, insurance: InsuranceCreateInput): Promise<PmsApiResponse<Insurance>>;
  abstract updatePatientInsurance(patientId: string, insuranceId: string, updates: Partial<InsuranceCreateInput>): Promise<PmsApiResponse<Insurance>>;
  abstract getPatientBalance(patientId: string): Promise<PmsApiResponse<PatientBalance>>;
  abstract processPayment(payment: PaymentCreateInput): Promise<PmsApiResponse<Payment>>;
  abstract getPaymentHistory(patientId: string): Promise<PmsListResponse<Payment>>;
  abstract getProviders(): Promise<PmsListResponse<Provider>>;
  abstract getProvider(providerId: string): Promise<PmsApiResponse<Provider>>;
  
  /**
   * Helper method to create a success response
   */
  protected createSuccessResponse<T>(data: T, meta?: any): PmsApiResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date(),
        ...meta,
      },
    };
  }
  
  /**
   * Helper method to create an error response
   */
  protected createErrorResponse(
    code: string,
    message: string,
    details?: any
  ): PmsApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date(),
      },
    };
  }
  
  /**
   * Helper method to create a list response
   */
  protected createListResponse<T>(
    data: T[],
    meta?: {
      total?: number;
      page?: number;
      limit?: number;
      hasMore?: boolean;
      [key: string]: any;
    }
  ): PmsListResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date(),
        ...meta,
      },
    };
  }
  
  /**
   * Helper method to handle API errors consistently
   */
  protected handleError(error: any, context: string): PmsApiResponse {
    console.error(`[PMS] Error in ${context}:`, error);
    
    if (error.response) {
      // HTTP error response
      return this.createErrorResponse(
        `HTTP_${error.response.status}`,
        error.response.data?.message || error.message,
        error.response.data
      );
    }
    
    if (error.code === 'ECONNREFUSED') {
      return this.createErrorResponse(
        'CONNECTION_REFUSED',
        'Unable to connect to PMS. Please check your network connection.',
        { code: error.code }
      );
    }
    
    if (error.code === 'ETIMEDOUT') {
      return this.createErrorResponse(
        'TIMEOUT',
        'Request to PMS timed out. Please try again.',
        { code: error.code }
      );
    }
    
    return this.createErrorResponse(
      'UNKNOWN_ERROR',
      error.message || 'An unexpected error occurred',
      { error: error.toString() }
    );
  }
}
