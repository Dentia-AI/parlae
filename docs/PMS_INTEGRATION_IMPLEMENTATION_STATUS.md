# PMS Integration Implementation Summary

## ✅ What's Been Implemented

### 1. Database Schema (`packages/prisma/schema.prisma`)

Added three new models for PMS integration:

- **`PmsIntegration`**: Stores PMS connection details per account
  - Provider type (Sikka, Kolla, etc.)
  - Encrypted credentials
  - Configuration and features
  - Connection status and error tracking
  
- **`PmsAuditLog`**: HIPAA-compliant audit trail
  - Tracks every API call that accesses PHI
  - Records user/agent context, request details, response status
  - Includes patient ID for PHI access tracking
  
- **`PmsCachedData`**: Optional caching layer
  - Reduces API calls to external PMS
  - Encrypted PHI data with TTL
  - Improves response time for Vapi calls

### 2. Type Definitions (`apps/frontend/packages/shared/src/pms/types.ts`)

Comprehensive TypeScript types for:
- All PMS providers and connection statuses
- Appointments (with all statuses and operations)
- Patients (with PHI annotations)
- Notes, Insurance, Payments
- Providers
- API responses

### 3. Service Layer (`apps/frontend/packages/shared/src/pms/`)

**Abstract Interface** (`pms-service.interface.ts`):
- `IPmsService` interface that all providers must implement
- `BasePmsService` base class with common functionality
- Standardized error handling and response formatting

**Sikka Implementation** (`sikka.service.ts`):
- Complete implementation for Sikka API
- OAuth2 authentication with token refresh
- All CRUD operations for appointments, patients, insurance, payments
- Data mapping from Sikka format to Parlae format
- Robust error handling

**Factory Pattern** (`index.ts`):
- `createPmsService()` factory function
- `validatePmsCredentials()` for credential validation
- Easy to extend for new providers

### 4. API Routes

**Setup Route** (`app/api/pms/setup/route.ts`):
- `POST /api/pms/setup` - Configure PMS integration
  - Validates credentials
  - Tests connection
  - Encrypts and stores credentials
  - Returns available features
- `GET /api/pms/setup` - Get integration status

**Appointments Route** (`app/api/pms/appointments/route.ts`):
- `GET /api/pms/appointments` - List appointments with filters
- `POST /api/pms/appointments` - Book new appointment
- `PATCH /api/pms/appointments/:id` - Reschedule appointment
- `DELETE /api/pms/appointments/:id` - Cancel appointment

**Utilities** (`app/api/pms/_lib/pms-utils.ts`):
- `getPmsService()` - Get PMS service for an account
- `logPmsAccess()` - HIPAA audit logging
- `verifyVapiSignature()` - Webhook authentication
- `redactPhi()` - PHI redaction for logs
- Encryption/decryption helpers

### 5. Documentation

**Architecture Document** (`docs/PMS_INTEGRATION_ARCHITECTURE.md`):
- Complete system architecture
- All API endpoints with request/response examples
- HIPAA compliance checklist
- Security considerations
- Implementation phases
- Testing strategy

## 🚀 Next Steps to Complete

### Phase 1: Complete Remaining API Routes

<blink>Need to create:</blink>

1. **Availability Route** (`app/api/pms/appointments/availability/route.ts`):
   ```typescript
   GET /api/pms/appointments/availability
   ```

2. **Patient Routes** (`app/api/pms/patients/route.ts`):
   ```typescript
   GET /api/pms/patients/search?query=john
   GET /api/pms/patients/:id
   POST /api/pms/patients
   PATCH /api/pms/patients/:id
   ```

3. **Patient Notes Routes** (`app/api/pms/patients/[id]/notes/route.ts`):
   ```typescript
   GET /api/pms/patients/:id/notes
   POST /api/pms/patients/:id/notes
   ```

4. **Insurance Routes** (`app/api/pms/patients/[id]/insurance/route.ts`):
   ```typescript
   GET /api/pms/patients/:id/insurance
   POST /api/pms/patients/:id/insurance
   ```

5. **Billing Routes**:
   - `app/api/pms/patients/[id]/balance/route.ts`
   - `app/api/pms/payments/route.ts`

### Phase 2: UI Setup Wizard

Create a setup wizard at `app/home/(user)/agent/setup/pms/page.tsx`:

```tsx
// Step 1: Select PMS Provider
// Step 2: Enter Credentials
// Step 3: Test Connection
// Step 4: Configure Features
// Step 5: Success & Test
```

Key components:
- Provider selection (Sikka, Kolla coming soon)
- Credential input form (encrypted before sending)
- Connection test with feedback
- Feature toggles
- Test phone number display

### Phase 3: Vapi Tool Configuration

Update Vapi assistant/squad setup to include PMS tools:

```typescript
const pmsTools = [
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment slots for booking',
      parameters: {
        type: 'object',
        properties: {
          date: { 
            type: 'string', 
            format: 'date',
            description: 'Date to check (YYYY-MM-DD)'
          },
          appointmentType: { 
            type: 'string',
            description: 'Type of appointment (cleaning, exam, etc.)'
          },
        },
        required: ['date']
      },
      server: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/pms/appointments/availability`,
        timeoutSeconds: 20,
        secret: process.env.VAPI_WEBHOOK_SECRET
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment for a patient',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          appointmentType: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          duration: { type: 'number', description: 'Duration in minutes' },
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration']
      },
      server: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/pms/appointments`,
        timeoutSeconds: 20,
        secret: process.env.VAPI_WEBHOOK_SECRET
      }
    }
  },
  // Add more tools for patient search, notes, etc.
];
```

### Phase 4: Environment Variables

Add to `.env.local`:

```bash
# PMS Integration
ENCRYPTION_KEY=<64-character hex string>  # Generate with: openssl rand -hex 32
VAPI_WEBHOOK_SECRET=<your-vapi-webhook-secret>

# Sikka API (for testing)
SIKKA_APPLICATION_ID=b0cac8c638d52c92f9c0312159fc4518
SIKKA_SECRET_KEY=7beec2a9e62bd692eab2e0840b8bb2db

# Kolla API (reserved for future)
KOLLA_API_KEY=kc.hvly7moue5bhxiipwan445tnja
```

### Phase 5: Database Migration

Run Prisma migration:

```bash
cd packages/prisma
npx prisma migrate dev --name add_pms_integration
npx prisma generate
```

### Phase 6: Testing

1. **Unit Tests**: Test PMS service methods
2. **Integration Tests**: Test with Sikka sandbox
3. **E2E Tests**: Test complete booking flow via Vapi call
4. **HIPAA Audit**: Verify all PHI access is logged

### Phase 7: Sikka Setup

Before going live:

1. **Sign BAA with Sikka**: Required for HIPAA compliance
2. **Get Production Credentials**: Move from test to production
3. **Configure Rate Limits**: Prevent abuse
4. **Set up Monitoring**: Track API health and errors

## 🔐 Security Checklist

- [x] Credentials encrypted at rest (AES-256-GCM)
- [x] TLS 1.3+ for all API calls
- [x] Vapi webhook signature verification
- [x] HIPAA audit logging for all PHI access
- [x] PHI redaction in application logs
- [x] Account-scoped data access
- [ ] Rate limiting (needs implementation)
- [ ] IP whitelisting (optional, for extra security)
- [ ] BAA signed with Sikka
- [ ] Security audit completed

## 📊 Monitoring & Alerts

Set up monitoring for:

1. **PMS Connection Health**
   - Alert if connection fails
   - Alert if error rate > 5%

2. **API Performance**
   - Track response times
   - Alert if p95 > 5 seconds

3. **HIPAA Compliance**
   - Alert on suspicious PHI access patterns
   - Alert on failed authentication attempts

4. **Business Metrics**
   - Appointment booking success rate
   - Most common appointment types
   - Peak call times

## 🎯 Key Integration Points

### 1. Vapi Assistant Prompt

Update assistant system prompts to include PMS capabilities:

```
You are a helpful dental receptionist for [Clinic Name].

When patients call, you can:
1. Check appointment availability
2. Book new appointments
3. Reschedule existing appointments
4. Cancel appointments
5. Look up patient information
6. Add notes to patient records

Always confirm details before booking or canceling appointments.
```

### 2. Call Metadata

Ensure Vapi call metadata includes account ID:

```typescript
const call = await vapiClient.calls.create({
  phoneNumberId: phoneNumber.vapi_phone_id,
  assistantId: assistant.id,
  metadata: {
    accountId: clinic.id, // CRITICAL: Required for PMS API authentication
    clinicName: clinic.name,
  },
});
```

### 3. Error Handling

All Vapi tools should handle errors gracefully:

```typescript
// In Vapi assistant tool call handler
if (!response.success) {
  return {
    error: true,
    message: "I'm sorry, I couldn't complete that request. Let me transfer you to our staff."
  };
}
```

## 📝 Sample Vapi Call Flow

```
1. Patient calls clinic phone number
2. Vapi routes to clinic's squad (with account ID in metadata)
3. Triage assistant greets patient
4. Patient: "I need to book a cleaning"
5. AI calls checkAvailability tool → /api/pms/appointments/availability
6. AI: "We have Monday at 10am or Wednesday at 2pm"
7. Patient: "Monday works"
8. AI calls bookAppointment tool → /api/pms/appointments
9. AI: "Perfect! You're all set for Monday at 10am"
10. Confirmation sent to patient
```

## 🔗 Resources

- [Sikka API Docs](https://apidocs.sikkasoft.com)
- [Sikka Write-back API](https://documenter.getpostman.com/view/1842814/TzCHCWFT)
- [Vapi Docs](https://docs.vapi.ai)
- [HIPAA Compliance Guide](https://www.hhs.gov/hipaa/for-professionals/security/index.html)

## 🚦 Status

**Overall Progress**: ~60% complete

- ✅ Database schema
- ✅ Type definitions
- ✅ Service layer (Sikka)
- ✅ Setup API
- ✅ Appointments API (partial)
- ⏳ Remaining appointment endpoints
- ⏳ Patient APIs
- ⏳ Insurance APIs
- ⏳ Payment APIs
- ⏳ UI setup wizard
- ⏳ Vapi integration
- ⏳ Testing
- ⏳ Documentation

**Ready for**: Internal testing with Sikka sandbox

**Next Milestone**: Complete all API routes and setup wizard (Phase 1-2)

---

**Questions or Issues?**
- Check [PMS_INTEGRATION_ARCHITECTURE.md](./PMS_INTEGRATION_ARCHITECTURE.md) for detailed specs
- Review Sikka API documentation for endpoint details
- Ensure ENCRYPTION_KEY is set in environment variables before testing
