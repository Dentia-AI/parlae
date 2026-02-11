/**
 * PMS (Practice Management System) Integration Types
 * 
 * HIPAA Compliance Note:
 * This file contains types for handling Protected Health Information (PHI).
 * All PHI must be encrypted in transit (TLS) and at rest (database encryption).
 */

export type PmsProvider = 
  | 'SIKKA'
  | 'KOLLA'
  | 'DENTRIX'
  | 'EAGLESOFT'
  | 'OPEN_DENTAL'
  | 'CUSTOM';

export type PmsConnectionStatus = 
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ERROR'
  | 'SETUP_REQUIRED';

export interface PmsCredentials {
  // Provider-specific credentials
  [key: string]: string | number | boolean | undefined;
}

export interface SikkaCredentials extends PmsCredentials {
  // Primary authentication (required)
  appId: string;               // Application ID
  appKey: string;              // Application Secret Key
  
  // Token state (managed automatically)
  requestKey?: string;         // Current request_key (valid 24h)
  refreshKey?: string;         // Refresh token for renewal
  
  // Practice identifiers (from authorized_practices)
  officeId?: string;           // Office ID
  secretKey?: string;          // Secret key for token generation
  practiceKey?: string;        // Practice identifier (alias for officeId)
  masterCustomerId?: string;   // Customer identifier
  spuInstallationKey?: string; // SPU key (alias for secretKey)
}

export interface KollaCredentials extends PmsCredentials {
  apiKey: string;
}

export interface PmsConfig {
  defaultAppointmentDuration?: number; // minutes
  timezone?: string; // IANA timezone
  allowOnlineBooking?: boolean;
  bookingAdvanceNoticeDays?: number;
  maxFutureBookingDays?: number;
  autoConfirmAppointments?: boolean;
  sendSmsReminders?: boolean;
  sendEmailReminders?: boolean;
  [key: string]: any;
}

export interface PmsFeatures {
  appointments: boolean;
  patients: boolean;
  insurance: boolean;
  payments: boolean;
  notes: boolean;
  providers: boolean;
  [key: string]: boolean;
}

export interface PmsIntegration {
  id: string;
  accountId: string;
  provider: PmsProvider;
  providerName?: string;
  status: PmsConnectionStatus;
  lastSyncAt?: Date;
  lastError?: string;
  credentials: PmsCredentials;
  config?: PmsConfig;
  features?: PmsFeatures;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Appointment Types
// ============================================================================

export type AppointmentStatus = 
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  appointmentType: string;
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  status: AppointmentStatus;
  notes?: string;
  confirmationNumber?: string;
  reminderSent?: boolean;
  metadata?: Record<string, any>;
}

export interface AppointmentCreateInput {
  patientId: string;
  providerId?: string;
  appointmentType: string;
  startTime: Date;
  duration: number; // minutes
  notes?: string;
  sendConfirmation?: boolean;
  metadata?: Record<string, any>;
}

export interface AppointmentUpdateInput {
  startTime?: Date;
  duration?: number;
  providerId?: string;
  appointmentType?: string;
  notes?: string;
  status?: AppointmentStatus;
  sendNotification?: boolean;
}

export interface AppointmentCancelInput {
  reason?: string;
  sendNotification?: boolean;
}

export interface AppointmentAvailabilityQuery {
  date: string; // YYYY-MM-DD
  providerId?: string;
  appointmentType?: string;
  duration?: number; // minutes
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  providerId: string;
  providerName: string;
  available: boolean;
  reason?: string; // If not available
}

// ============================================================================
// Patient Types (PHI - Handle with care!)
// ============================================================================

export interface PatientAddress {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship?: string;
  email?: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // YYYY-MM-DD (PHI)
  phone?: string; // (PHI)
  email?: string; // (PHI)
  address?: PatientAddress; // (PHI)
  emergencyContact?: EmergencyContact; // (PHI)
  balance?: number;
  lastVisit?: Date;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface PatientCreateInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // YYYY-MM-DD
  phone?: string;
  email?: string;
  address?: PatientAddress;
  emergencyContact?: EmergencyContact;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface PatientUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: PatientAddress;
  emergencyContact?: EmergencyContact;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface PatientSearchQuery {
  query: string; // Name, phone, or email
  limit?: number;
  offset?: number;
}

// ============================================================================
// Note Types
// ============================================================================

export interface PatientNote {
  id: string;
  patientId: string;
  content: string;
  category?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
}

export interface PatientNoteCreateInput {
  content: string;
  category?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Insurance Types (PHI - Handle with care!)
// ============================================================================

export interface Insurance {
  id: string;
  patientId: string;
  provider: string;
  policyNumber: string; // (PHI)
  groupNumber?: string; // (PHI)
  subscriberName?: string; // (PHI)
  subscriberDob?: string; // YYYY-MM-DD (PHI)
  relationship?: string; // self, spouse, child, other
  isPrimary: boolean;
  effectiveDate?: Date;
  expirationDate?: Date;
  metadata?: Record<string, any>;
}

export interface InsuranceCreateInput {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
  subscriberName?: string;
  subscriberDob?: string; // YYYY-MM-DD
  relationship?: string;
  isPrimary: boolean;
  effectiveDate?: Date;
  expirationDate?: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Billing & Payment Types
// ============================================================================

export interface PatientBalance {
  total: number;
  insurance: number;
  patient: number;
  lastPayment?: {
    amount: number;
    date: Date;
    method: string;
  };
}

export type PaymentMethod = 
  | 'cash'
  | 'check'
  | 'credit_card'
  | 'debit_card'
  | 'ach'
  | 'other';

export type PaymentStatus = 
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export interface Payment {
  id: string;
  patientId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  confirmationNumber?: string;
  last4?: string; // Last 4 digits of card
  notes?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PaymentCreateInput {
  patientId: string;
  amount: number;
  method: PaymentMethod;
  last4?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Provider Types
// ============================================================================

export interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  title?: string; // Dr., DDS, DMD, etc.
  specialty?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}

// ============================================================================
// Audit Log Types (HIPAA Compliance)
// ============================================================================

export interface PmsAuditLog {
  id: string;
  pmsIntegrationId: string;
  action: string;
  endpoint: string;
  method: string;
  userId?: string;
  vapiCallId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestSummary?: string;
  responseStatus?: number;
  responseTime?: number;
  phiAccessed: boolean;
  patientId?: string;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PmsApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId?: string;
    [key: string]: any;
  };
}

export interface PmsListResponse<T = any> extends PmsApiResponse<T[]> {
  meta?: {
    timestamp: Date;
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
    [key: string]: any;
  };
}
