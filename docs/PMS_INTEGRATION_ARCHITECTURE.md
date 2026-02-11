# PMS Integration Architecture

## Overview

This document outlines the Practice Management System (PMS) integration architecture for Parlae AI. The system enables AI voice agents (via Vapi) to interact with dental practice management systems to book appointments, manage patients, and handle billing.

## Supported PMS Systems

### Primary: Sikka API
- **Documentation**: 
  - https://apidocs.sikkasoft.com
  - https://documenter.getpostman.com/view/1842814/TzCHCWFT
- **Capabilities**: 
  - 100+ PMS connectors (Dentrix, Eaglesoft, Open Dental, etc.)
  - Unified API for appointments, patients, insurance, payments
  - Write-back capabilities for creating/updating records
- **Authentication**: Application ID + Secret Key

### Future Support: Kolla
- **API Key**: `kc.hvly7moue5bhxiipwan445tnja`
- **Status**: Reserved for future implementation

## Core API Priorities

### 1. Appointment Management (Critical)
- ✅ `GET /appointments` - View appointments
- ✅ `POST /appointments` - Book new appointment
- ✅ `PATCH /appointments/:id` - Reschedule appointment
- ✅ `DELETE /appointments/:id` - Cancel appointment
- ✅ `GET /appointments/availability` - Check available time slots

### 2. Patient Management (Critical)
- ✅ `GET /patients/:id` - Get patient info
- ✅ `POST /patients` - Create new patient
- ✅ `PATCH /patients/:id` - Update patient info
- ✅ `GET /patients/:id/notes` - View patient notes
- ✅ `POST /patients/:id/notes` - Add patient note

### 3. Insurance & Billing (High Priority)
- ✅ `GET /patients/:id/insurance` - View insurance info
- ✅ `POST /patients/:id/insurance` - Add insurance
- ✅ `POST /payments` - Process payment
- ✅ `GET /patients/:id/balance` - Get patient balance

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│ VAPI AI ASSISTANT (Voice Agent)                            │
├─────────────────────────────────────────────────────────────┤
│ Tools:                                                       │
│ - bookAppointment(patientId, date, time, type)             │
│ - checkAvailability(date, provider)                         │
│ - getPatientInfo(patientId)                                 │
│ - createPatient(name, dob, phone, email)                   │
│ - addPatientNote(patientId, note)                           │
│ - processPayment(patientId, amount, method)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS Webhook
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PARLAE BACKEND API (/api/pms/*)                            │
├─────────────────────────────────────────────────────────────┤
│ Authentication & Authorization:                              │
│ - Verify Vapi webhook signature                             │
│ - Extract account ID from call context                      │
│ - Load PMS credentials for account                          │
│                                                              │
│ HIPAA Compliance Layer:                                      │
│ - PHI data encryption in transit (TLS 1.3)                  │
│ - PHI data encryption at rest (PostgreSQL encryption)       │
│ - Audit logging (all PHI access logged)                     │
│ - Access controls (account-scoped operations)               │
│ - Data minimization (only request needed fields)            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PMS SERVICE LAYER                                            │
├─────────────────────────────────────────────────────────────┤
│ Abstract Interface:                                          │
│ interface IPmsService {                                      │
│   getAppointments(filters): Appointment[]                   │
│   bookAppointment(data): Appointment                        │
│   getPatient(id): Patient                                   │
│   createPatient(data): Patient                              │
│   ...                                                        │
│ }                                                            │
│                                                              │
│ Implementations:                                             │
│ - SikkaService (implements IPmsService)                     │
│ - KollaService (implements IPmsService) [Future]           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ EXTERNAL PMS SYSTEMS                                         │
├─────────────────────────────────────────────────────────────┤
│ Sikka API:                                                   │
│ - Base URL: https://api.sikkasoft.com                       │
│ - Auth: Bearer token (from app ID + secret)                 │
│ - Rate Limits: TBD                                           │
│                                                              │
│ Kolla API: [Future]                                          │
│ - Base URL: TBD                                              │
│ - Auth: API Key                                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

```prisma
// PMS Provider Types
enum PmsProvider {
  SIKKA
  KOLLA
  DENTRIX
  EAGLESOFT
  OPEN_DENTAL
  CUSTOM
}

// PMS Connection Status
enum PmsConnectionStatus {
  ACTIVE
  INACTIVE
  ERROR
  SETUP_REQUIRED
}

// PMS Integration per Account
model PmsIntegration {
  id          String              @id @default(uuid())
  accountId   String              @map("account_id")
  
  // Provider Info
  provider    PmsProvider         @map("provider")
  providerName String?            @map("provider_name") // Custom name
  
  // Connection Status
  status      PmsConnectionStatus @default(SETUP_REQUIRED) @map("status")
  lastSyncAt  DateTime?           @map("last_sync_at")
  lastError   String?             @map("last_error")
  
  // Credentials (Encrypted)
  credentials Json                @map("credentials") // Provider-specific
  
  // Configuration
  config      Json?               @map("config") // Provider-specific settings
  
  // Feature Flags
  features    Json?               @map("features") // Available features
  
  // Metadata
  metadata    Json?               @map("metadata")
  
  // Timestamps
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")
  
  // Relations
  account     Account             @relation(fields: [accountId], references: [id], onDelete: Cascade)
  auditLogs   PmsAuditLog[]
  
  @@unique([accountId, provider])
  @@index([accountId])
  @@index([status])
  @@map("pms_integrations")
}

// HIPAA-Compliant Audit Logging
model PmsAuditLog {
  id                String         @id @default(uuid())
  pmsIntegrationId  String         @map("pms_integration_id")
  
  // Request Info
  action            String         @map("action") // bookAppointment, getPatient, etc.
  endpoint          String         @map("endpoint")
  method            String         @map("method") // GET, POST, PATCH, DELETE
  
  // User/Agent Context
  userId            String?        @map("user_id")
  vapiCallId        String?        @map("vapi_call_id")
  ipAddress         String?        @map("ip_address")
  userAgent         String?        @map("user_agent")
  
  // Request/Response (PHI redacted in logs)
  requestSummary    String?        @db.Text @map("request_summary")
  responseStatus    Int?           @map("response_status")
  responseTime      Int?           @map("response_time") // milliseconds
  
  // PHI Access Tracking
  phiAccessed       Boolean        @default(false) @map("phi_accessed")
  patientId         String?        @map("patient_id") // External PMS patient ID
  
  // Error Tracking
  success           Boolean        @default(true) @map("success")
  errorMessage      String?        @map("error_message")
  
  // Timestamp
  createdAt         DateTime       @default(now()) @map("created_at")
  
  // Relations
  pmsIntegration    PmsIntegration @relation(fields: [pmsIntegrationId], references: [id], onDelete: Cascade)
  
  @@index([pmsIntegrationId])
  @@index([createdAt])
  @@index([action])
  @@index([vapiCallId])
  @@map("pms_audit_logs")
}

// Cached PMS Data (for faster lookups)
model PmsCachedData {
  id                String         @id @default(uuid())
  pmsIntegrationId  String         @map("pms_integration_id")
  
  // Cache Key
  cacheKey          String         @map("cache_key") // e.g., "patient:12345"
  cacheType         String         @map("cache_type") // patient, appointment, provider, etc.
  
  // Cached Data (Encrypted if contains PHI)
  data              Json           @map("data")
  
  // Cache Metadata
  expiresAt         DateTime       @map("expires_at")
  lastFetchedAt     DateTime       @default(now()) @map("last_fetched_at")
  
  // Timestamps
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")
  
  @@unique([pmsIntegrationId, cacheKey])
  @@index([pmsIntegrationId])
  @@index([expiresAt])
  @@map("pms_cached_data")
}
```

## HIPAA Compliance Checklist

### ✅ Data Encryption
- **In Transit**: All API calls use TLS 1.3+
- **At Rest**: PostgreSQL column encryption for PHI
- **Credentials**: Encrypted using AES-256

### ✅ Access Controls
- **Authentication**: Vapi webhook signature verification
- **Authorization**: Account-scoped data access
- **Role-Based**: Only authorized users can configure PMS

### ✅ Audit Logging
- **All PHI Access Logged**: Every API call tracked
- **Retention**: 6 years minimum (HIPAA requirement)
- **Tamper-Proof**: Append-only audit log

### ✅ Data Minimization
- **Request Only Needed Fields**: Avoid bulk data dumps
- **Cache Expiration**: Short TTL for PHI (5-15 minutes)
- **Redaction**: Sensitive data redacted in logs

### ✅ Business Associate Agreement (BAA)
- **Sikka**: Must sign BAA with Sikka
- **Parlae**: Customer signs BAA with Parlae
- **Documentation**: Store BAA acceptance in database

### ✅ Security Measures
- **Rate Limiting**: Prevent data exfiltration
- **IP Whitelisting**: Restrict PMS API access
- **Monitoring**: Alert on suspicious access patterns

## API Endpoints

### Setup & Configuration

#### `POST /api/pms/setup`
Configure PMS integration for an account.

**Authentication**: Required (account owner/admin)

**Request**:
```json
{
  "provider": "SIKKA",
  "credentials": {
    "applicationId": "b0cac8c638d52c92f9c0312159fc4518",
    "secretKey": "7beec2a9e62bd692eab2e0840b8bb2db",
    "practiceId": "12345" // Practice-specific ID
  },
  "config": {
    "defaultAppointmentDuration": 30,
    "timezone": "America/Los_Angeles",
    "allowOnlineBooking": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "integration": {
    "id": "pms_int_123",
    "provider": "SIKKA",
    "status": "ACTIVE",
    "features": {
      "appointments": true,
      "patients": true,
      "insurance": true,
      "payments": true
    }
  }
}
```

#### `GET /api/pms/status`
Get PMS integration status.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "status": "ACTIVE",
  "provider": "SIKKA",
  "lastSyncAt": "2026-02-07T10:30:00Z",
  "features": {
    "appointments": true,
    "patients": true,
    "insurance": true,
    "payments": true
  }
}
```

#### `POST /api/pms/test-connection`
Test PMS connection.

**Authentication**: Required

**Response**:
```json
{
  "success": true,
  "connectionValid": true,
  "message": "Successfully connected to Sikka API"
}
```

### Appointment Management

#### `GET /api/pms/appointments`
List appointments.

**Authentication**: Vapi webhook signature

**Query Params**:
- `startDate` (ISO 8601)
- `endDate` (ISO 8601)
- `patientId` (optional)
- `providerId` (optional)
- `status` (scheduled, completed, cancelled)

**Response**:
```json
{
  "success": true,
  "appointments": [
    {
      "id": "appt_123",
      "patientId": "pat_456",
      "patientName": "John Doe",
      "providerId": "prov_789",
      "providerName": "Dr. Smith",
      "appointmentType": "Cleaning",
      "startTime": "2026-02-10T14:00:00Z",
      "endTime": "2026-02-10T14:30:00Z",
      "status": "scheduled",
      "notes": "Regular 6-month cleaning"
    }
  ]
}
```

#### `POST /api/pms/appointments`
Book new appointment.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "patientId": "pat_456",
  "providerId": "prov_789",
  "appointmentType": "Cleaning",
  "startTime": "2026-02-10T14:00:00Z",
  "duration": 30,
  "notes": "Patient requested afternoon slot",
  "sendConfirmation": true
}
```

**Response**:
```json
{
  "success": true,
  "appointment": {
    "id": "appt_123",
    "confirmationNumber": "ABC123",
    "patientName": "John Doe",
    "startTime": "2026-02-10T14:00:00Z",
    "endTime": "2026-02-10T14:30:00Z"
  }
}
```

#### `PATCH /api/pms/appointments/:id`
Reschedule appointment.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "startTime": "2026-02-11T10:00:00Z",
  "reason": "Patient conflict",
  "sendNotification": true
}
```

**Response**:
```json
{
  "success": true,
  "appointment": {
    "id": "appt_123",
    "newStartTime": "2026-02-11T10:00:00Z",
    "confirmationNumber": "ABC123"
  }
}
```

#### `DELETE /api/pms/appointments/:id`
Cancel appointment.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "reason": "Patient cancellation",
  "sendNotification": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Appointment cancelled successfully"
}
```

#### `GET /api/pms/appointments/availability`
Check available time slots.

**Authentication**: Vapi webhook signature

**Query Params**:
- `date` (YYYY-MM-DD)
- `providerId` (optional)
- `appointmentType` (optional)
- `duration` (minutes, default 30)

**Response**:
```json
{
  "success": true,
  "date": "2026-02-10",
  "slots": [
    {
      "startTime": "2026-02-10T09:00:00Z",
      "endTime": "2026-02-10T09:30:00Z",
      "providerId": "prov_789",
      "providerName": "Dr. Smith",
      "available": true
    },
    {
      "startTime": "2026-02-10T09:30:00Z",
      "endTime": "2026-02-10T10:00:00Z",
      "providerId": "prov_789",
      "providerName": "Dr. Smith",
      "available": true
    }
  ]
}
```

### Patient Management

#### `GET /api/pms/patients/:id`
Get patient information.

**Authentication**: Vapi webhook signature

**Response**:
```json
{
  "success": true,
  "patient": {
    "id": "pat_456",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1985-05-15",
    "phone": "+1-415-555-1234",
    "email": "john.doe@example.com",
    "address": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94105"
    },
    "emergencyContact": {
      "name": "Jane Doe",
      "phone": "+1-415-555-5678",
      "relationship": "Spouse"
    },
    "balance": 150.00,
    "lastVisit": "2025-08-15T14:00:00Z"
  }
}
```

#### `POST /api/pms/patients`
Create new patient.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1985-05-15",
  "phone": "+1-415-555-1234",
  "email": "john.doe@example.com",
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94105"
  }
}
```

**Response**:
```json
{
  "success": true,
  "patient": {
    "id": "pat_456",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1-415-555-1234",
    "email": "john.doe@example.com"
  }
}
```

#### `PATCH /api/pms/patients/:id`
Update patient information.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "phone": "+1-415-555-9999",
  "email": "newemail@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "patient": {
    "id": "pat_456",
    "phone": "+1-415-555-9999",
    "email": "newemail@example.com"
  }
}
```

#### `GET /api/pms/patients/:id/notes`
Get patient notes.

**Authentication**: Vapi webhook signature

**Response**:
```json
{
  "success": true,
  "notes": [
    {
      "id": "note_123",
      "content": "Patient prefers morning appointments",
      "createdBy": "Dr. Smith",
      "createdAt": "2025-08-15T14:30:00Z"
    }
  ]
}
```

#### `POST /api/pms/patients/:id/notes`
Add patient note.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "content": "Patient requested reminder call day before appointment",
  "category": "preference"
}
```

**Response**:
```json
{
  "success": true,
  "note": {
    "id": "note_124",
    "content": "Patient requested reminder call day before appointment",
    "createdAt": "2026-02-07T10:30:00Z"
  }
}
```

### Insurance & Billing

#### `GET /api/pms/patients/:id/insurance`
Get patient insurance information.

**Authentication**: Vapi webhook signature

**Response**:
```json
{
  "success": true,
  "insurance": [
    {
      "id": "ins_123",
      "provider": "BlueCross BlueShield",
      "policyNumber": "BC123456789",
      "groupNumber": "GRP789",
      "isPrimary": true,
      "effectiveDate": "2025-01-01",
      "expirationDate": "2026-12-31"
    }
  ]
}
```

#### `POST /api/pms/patients/:id/insurance`
Add insurance information.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "provider": "Aetna",
  "policyNumber": "AET987654321",
  "groupNumber": "GRP456",
  "isPrimary": false,
  "subscriberName": "John Doe",
  "subscriberDob": "1985-05-15",
  "relationship": "self"
}
```

**Response**:
```json
{
  "success": true,
  "insurance": {
    "id": "ins_124",
    "provider": "Aetna",
    "policyNumber": "AET987654321",
    "isPrimary": false
  }
}
```

#### `GET /api/pms/patients/:id/balance`
Get patient balance.

**Authentication**: Vapi webhook signature

**Response**:
```json
{
  "success": true,
  "balance": {
    "total": 150.00,
    "insurance": 100.00,
    "patient": 50.00,
    "lastPayment": {
      "amount": 75.00,
      "date": "2025-12-15T10:00:00Z",
      "method": "credit_card"
    }
  }
}
```

#### `POST /api/pms/payments`
Process payment.

**Authentication**: Vapi webhook signature

**Request**:
```json
{
  "patientId": "pat_456",
  "amount": 50.00,
  "method": "credit_card",
  "last4": "4242",
  "notes": "Copay for cleaning appointment"
}
```

**Response**:
```json
{
  "success": true,
  "payment": {
    "id": "pay_123",
    "amount": 50.00,
    "status": "completed",
    "confirmationNumber": "PAY123456",
    "timestamp": "2026-02-07T10:30:00Z"
  }
}
```

### Search & Lookup

#### `GET /api/pms/patients/search`
Search for patients.

**Authentication**: Vapi webhook signature

**Query Params**:
- `query` (name, phone, or email)
- `limit` (default 10)

**Response**:
```json
{
  "success": true,
  "patients": [
    {
      "id": "pat_456",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1-415-555-1234",
      "email": "john.doe@example.com",
      "dateOfBirth": "1985-05-15"
    }
  ]
}
```

## UI Setup Flow

### Step 1: PMS Selection
Show list of supported PMS systems:
- Sikka (100+ systems via unified API)
- Kolla (Coming Soon)
- Direct integrations (Future)

### Step 2: Provider-Specific Setup

#### For Sikka:
1. **Get Credentials**:
   - Application ID
   - Secret Key
   - Practice ID (if applicable)
2. **Test Connection**
3. **Configure Features**:
   - Enable/disable appointment booking
   - Enable/disable patient creation
   - Set booking rules (advance notice, max future date)
4. **Success Screen**:
   - Show which features are enabled
   - Provide test phone number
   - Link to documentation

### Step 3: Vapi Tool Configuration
Automatically configure Vapi tools based on enabled features:

```typescript
const tools = [
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment slots',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          appointmentType: { type: 'string' },
          providerId: { type: 'string' }
        },
        required: ['date']
      },
      server: {
        url: 'https://your-app.com/api/pms/appointments/availability',
        timeoutSeconds: 20,
        secret: process.env.VAPI_WEBHOOK_SECRET
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          date: { type: 'string', format: 'date-time' },
          duration: { type: 'number' },
          appointmentType: { type: 'string' }
        },
        required: ['patientId', 'date', 'appointmentType']
      },
      server: {
        url: 'https://your-app.com/api/pms/appointments',
        timeoutSeconds: 20,
        secret: process.env.VAPI_WEBHOOK_SECRET
      }
    }
  }
  // ... more tools
];
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- ✅ Database schema for PMS integrations
- ✅ Abstract PMS service interface
- ✅ Sikka service implementation
- ✅ HIPAA audit logging
- ✅ Credential encryption

### Phase 2: Appointment APIs (Week 2)
- ✅ GET /appointments (list)
- ✅ POST /appointments (book)
- ✅ PATCH /appointments/:id (reschedule)
- ✅ DELETE /appointments/:id (cancel)
- ✅ GET /appointments/availability (check slots)

### Phase 3: Patient APIs (Week 2-3)
- ✅ GET /patients/:id (get info)
- ✅ POST /patients (create)
- ✅ PATCH /patients/:id (update)
- ✅ GET /patients/:id/notes (view notes)
- ✅ POST /patients/:id/notes (add note)
- ✅ GET /patients/search (lookup)

### Phase 4: Billing APIs (Week 3)
- ✅ GET /patients/:id/insurance
- ✅ POST /patients/:id/insurance
- ✅ GET /patients/:id/balance
- ✅ POST /payments

### Phase 5: UI Setup Wizard (Week 4)
- ✅ PMS selection screen
- ✅ Sikka credential input
- ✅ Connection testing
- ✅ Feature configuration
- ✅ Success confirmation

### Phase 6: Vapi Integration (Week 4-5)
- ✅ Tool definitions for all PMS APIs
- ✅ Webhook signature verification
- ✅ Call context extraction
- ✅ Error handling & retries
- ✅ Testing with live calls

### Phase 7: Testing & Documentation (Week 5)
- ✅ Unit tests for all services
- ✅ Integration tests with Sikka sandbox
- ✅ HIPAA compliance audit
- ✅ API documentation
- ✅ Setup guide for customers

## Security Considerations

### 1. Credential Storage
```typescript
// Encrypt before storing
const encryptedCredentials = await encrypt({
  applicationId: sikkaAppId,
  secretKey: sikkaSecretKey,
  practiceId: practiceId
}, process.env.ENCRYPTION_KEY);

await db.pmsIntegration.create({
  data: {
    accountId: account.id,
    provider: 'SIKKA',
    credentials: encryptedCredentials,
    status: 'ACTIVE'
  }
});
```

### 2. Webhook Security
```typescript
// Verify Vapi webhook signature
function verifyVapiSignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.VAPI_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### 3. Rate Limiting
```typescript
// Prevent abuse
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute per account
  keyGenerator: (req) => req.accountId,
  skip: (req) => req.isInternal
});
```

### 4. PHI Redaction
```typescript
// Redact sensitive data from logs
function redactPhi(data: any): any {
  const redacted = { ...data };
  const phiFields = ['ssn', 'dateOfBirth', 'address', 'phone', 'email'];
  
  phiFields.forEach(field => {
    if (redacted[field]) {
      redacted[field] = '[REDACTED]';
    }
  });
  
  return redacted;
}
```

## Testing Strategy

### 1. Unit Tests
- PMS service methods
- Credential encryption/decryption
- Data transformation (Sikka → Parlae format)
- Error handling

### 2. Integration Tests
- Sikka API sandbox
- End-to-end booking flow
- Error scenarios (invalid credentials, rate limits)
- Webhook verification

### 3. Manual Testing
- UI setup wizard
- Vapi voice calls
- Appointment booking via phone
- Patient creation via phone

### 4. HIPAA Compliance Audit
- Penetration testing
- Access control verification
- Audit log completeness
- Encryption validation

## Monitoring & Alerts

### Key Metrics
- API response times
- Error rates by endpoint
- PMS connection status
- Appointment booking success rate
- PHI access frequency

### Alerts
- PMS connection failure
- High error rate (>5%)
- Suspicious PHI access patterns
- Credential expiration
- API rate limit approaching

## Future Enhancements

### Additional PMS Systems
- Kolla integration
- Direct Dentrix integration
- Direct Eaglesoft integration
- Open Dental integration

### Advanced Features
- Real-time calendar sync
- Automated appointment reminders
- Insurance eligibility verification
- Treatment plan management
- Clinical notes integration

### Analytics
- Booking conversion rates
- Peak call times
- Most common appointment types
- Patient demographics
- Revenue tracking

---

**Next Steps**: 
1. Review architecture with team
2. Sign BAA with Sikka
3. Get Sikka sandbox credentials
4. Implement Phase 1 (core infrastructure)
5. Begin Phase 2 (appointment APIs)
