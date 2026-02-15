# Dental Clinic Squad Configuration

## Overview

The dental clinic squad uses 4 Vapi assistants with silent handoffs and Sikka PMS integration for patient and appointment management.

```
┌──────────────────────────────────────────────────────────────┐
│                    TRIAGE RECEPTIONIST                        │
│                   (Entry Point - Greeting)                    │
│  • Greets all callers warmly                                 │
│  • Identifies needs via keywords                             │
│  • Routes to specialist via silent handoff                   │
└──────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
          ▼                 ▼                  ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│   EMERGENCY    │  │    CLINIC      │  │  SCHEDULING    │
│   TRANSFER     │  │  INFORMATION   │  │                │
│                │  │                │  │                │
│ • Urgent care  │  │ • Services     │  │ • searchPat.   │
│ • 911 transfer │  │ • Providers    │  │ • createPat.   │
│ • Emergency    │  │ • Hours/Loc.   │  │ • checkAvail.  │
│   booking      │  │ • Insurance    │  │ • bookAppt.    │
│ • First aid    │  │ • Policies     │  │ • reschedule   │
│   advice       │  │ • Knowledge    │  │ • cancel       │
│                │  │   Base         │  │ • getAppts.    │
│                │  │                │  │ • addNotes     │
│                │  │                │  │ • getProviders │
└────────────────┘  └────────────────┘  └────────────────┘
```

## Silent Handoff Configuration

Destination assistants (Emergency, Clinic Info, Scheduling) use:
- `firstMessage: ""` (empty string)
- `firstMessageMode: "assistant-speaks-first-with-model-generated-message"`

This means:
- No greeting when they take over
- They immediately respond to the context from the previous assistant
- The caller experiences a seamless, continuous conversation

## Files Modified

| File | Purpose |
|------|---------|
| `packages/shared/src/vapi/vapi-pms-tools.config.ts` | Tool definitions matching Sikka API |
| `apps/web/app/api/agent/setup-squad/route.ts` | Squad creation with 4 assistants |
| `apps/web/app/api/vapi/webhook/route.ts` | Webhook dispatch for all tool calls |

## Tool → Sikka API Parameter Mapping

### Patient Management

| Tool Name | Sikka API | Required Params | Optional Params |
|-----------|-----------|-----------------|-----------------|
| `searchPatients` | `GET /patients/search` | `query` (phone/name/email) | `limit` |
| `getPatientInfo` | `GET /patients/{id}` | `patientId` | — |
| `createPatient` | `POST /patient` | `firstName`, `lastName`, `phone` | `email`, `dateOfBirth`, `notes` |
| `updatePatient` | `PATCH /patient/{id}` | `patientId` | `phone`, `email`, `address`, `notes` |

### Appointment Management

| Tool Name | Sikka API | Required Params | Optional Params |
|-----------|-----------|-----------------|-----------------|
| `checkAvailability` | `GET /appointments_available_slots` | `date` (YYYY-MM-DD) | `duration`, `providerId`, `appointmentType` |
| `bookAppointment` | `POST /appointment` | `patientId`, `appointmentType`, `startTime` (ISO 8601), `duration` (mins) | `providerId`, `notes` |
| `rescheduleAppointment` | `PATCH /appointments/{id}` | `appointmentId`, `startTime` (ISO 8601) | `duration`, `providerId`, `notes` |
| `cancelAppointment` | `DELETE /appointments/{id}` | `appointmentId` | `reason` |
| `getAppointments` | `GET /appointments` | `patientId` | `startDate`, `endDate` |

### Notes & Other

| Tool Name | Sikka API | Required Params | Optional Params |
|-----------|-----------|-----------------|-----------------|
| `addPatientNote` | `POST /medical_notes` | `patientId`, `content` | `category` |
| `getPatientInsurance` | `GET /patients/{id}/insurance` | `patientId` | — |
| `getPatientBalance` | `GET /patient_balance` | `patientId` | — |
| `getProviders` | `GET /providers` | — | — |

## Key Fixes Applied (vs. Preliminary Config)

### 1. Tool Parameter Alignment with Sikka API

**Before (wrong):**
```json
{
  "name": "search_patient",
  "parameters": {
    "search_term": "string",
    "search_type": { "enum": ["name", "phone", "email", "patient_id"] }
  }
}
```

**After (correct - matches Sikka):**
```json
{
  "name": "searchPatients",
  "parameters": {
    "query": "string (phone number, name, or email)",
    "limit": "number (optional, default 5)"
  }
}
```

### 2. Booking Parameters Fixed

**Before (wrong):**
```json
{
  "name": "book_appointment",
  "parameters": {
    "patient_id": "string",
    "appointment_date": "string",
    "appointment_time": "string",
    "appointment_type": "string",
    "duration_minutes": "number",
    "send_confirmation": "boolean"
  }
}
```

**After (correct - matches Sikka):**
```json
{
  "name": "bookAppointment",
  "parameters": {
    "patientId": "string",
    "appointmentType": "string",
    "startTime": "string (ISO 8601, e.g. 2026-02-20T10:00:00Z)",
    "duration": "number (minutes)",
    "providerId": "string (optional)",
    "notes": "string (optional)"
  }
}
```

### 3. Server URL Structure Fixed

**Before:** `server` was nested inside `function` (wrong placement for Vapi)
```typescript
{
  type: 'function',
  function: {
    name: '...',
    parameters: {...},
    server: { url: '...' }  // WRONG - inside function
  }
}
```

**After:** `server` is at the tool level (correct Vapi format)
```typescript
{
  type: 'function',
  function: {
    name: '...',
    parameters: {...}
  },
  server: { url: '...' }  // CORRECT - tool level
}
```

### 4. Automatic Phone Lookup from Vapi Call Metadata

Vapi provides the caller's phone number in `call.customer.number`. The AI no longer asks for it — it's injected automatically.

The system prompt uses `{{call.customer.number}}` (Vapi template variable) to instruct the AI:
1. Immediately call `searchPatients` with the caller's phone number on handoff
2. If found: Greet by name — "I see your record, [Name]. How can I help?"
3. If NOT found: Ask for name and search again (they may be calling from a different number)
4. If still NOT found: Create new patient — phone is already known from metadata
5. For `createPatient`, the backend auto-fills `phone` from `call.customer.number` if not provided

### 5. Missing Tools Added

- `getAppointments` — Required for cancel/reschedule flows (AI needs to look up existing appointments)
- `getProviders` — For patients asking about specific dentists
- `rescheduleAppointment` — Was using `update_appointment` with wrong params

### 6. All 4 Assistants with Full System Prompts

- **Triage Receptionist**: Warm greeting, keyword-based routing, emergency detection
- **Emergency Transfer**: Calm urgency, first aid advice, emergency booking via Sikka
- **Clinic Information**: Knowledge base access, proactive scheduling suggestions
- **Scheduling**: Full PMS access, phone-first search, appointment CRUD

## Webhook Flow

```
Vapi Call → Webhook (/api/vapi/webhook)
    │
    ├── function-call event
    │   ├── searchPatients → Backend VapiToolsService.searchPatients()
    │   ├── bookAppointment → Backend VapiToolsService.bookAppointment()
    │   ├── checkAvailability → Backend VapiToolsService.checkAvailability()
    │   ├── cancelAppointment → Backend VapiToolsService.cancelAppointment()
    │   ├── createPatient → Backend VapiToolsService.createPatient()
    │   ├── updatePatient → Backend VapiToolsService.updatePatient()
    │   ├── getAppointments → Backend (new handler needed)
    │   ├── rescheduleAppointment → Backend (new handler needed)
    │   ├── addPatientNote → Backend (new handler needed)
    │   ├── getPatientInsurance → Backend (new handler needed)
    │   ├── getPatientBalance → Backend (new handler needed)
    │   ├── getProviders → Backend (new handler needed)
    │   └── transferToHuman → Backend VapiToolsService.transferToHuman()
    │
    ├── end-of-call-report → GHL CRM sync + call data storage
    ├── status-update → Call status tracking
    └── assistant-request → Dynamic assistant config
```

## Environment Variables Required

```env
NEXT_PUBLIC_APP_BASE_URL=https://your-app.com
VAPI_SERVER_SECRET=your-vapi-server-secret
VAPI_WEBHOOK_SECRET=your-webhook-secret
BACKEND_API_URL=https://your-backend.com
BACKEND_API_KEY=your-backend-api-key
```

## Completed Implementation

### Backend Handlers (all implemented in `vapi-tools.service.ts`)
All 13 tool handlers are now implemented with HIPAA audit logging:
- `searchPatients`, `getPatientInfo`, `createPatient`, `updatePatient`
- `checkAvailability`, `bookAppointment`, `rescheduleAppointment`, `cancelAppointment`, `getAppointments`
- `addPatientNote`, `getPatientInsurance`, `getPatientBalance`, `getProviders`
- `transferToHuman`

### Backend Controller (`vapi-tools.controller.ts`)
Dynamic route `POST /vapi/tools/:toolName` dispatches any tool name to the matching service method.
Accepts both camelCase (`bookAppointment`) and kebab-case (`book-appointment`) tool names.
Auth via either `x-vapi-signature` header or `Bearer` token.

### Auto Phone Lookup
- Caller phone (`call.customer.number`) is available in every Vapi webhook payload
- System prompts use `{{call.customer.number}}` template variable
- `createPatient` backend handler auto-fills phone from call metadata when not provided
- AI searches by caller phone immediately on handoff — no need to ask

## Remaining Steps

1. **Knowledge base**: Upload clinic-specific knowledge base files for the Clinic Information assistant

2. **Phone numbers**: Configure real emergency and on-call numbers to replace placeholders in the Emergency Transfer assistant

3. **Testing**: Test each tool call individually via Vapi dashboard before going live

4. **Vapi module registration**: Ensure `VapiToolsModule` exports the new service methods and controller is registered
