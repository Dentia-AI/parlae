# Vapi Webhook Configuration Guide

## 🎯 Architecture Overview

Vapi has **two types of webhooks**:

1. **Call Lifecycle Events** → Single webhook endpoint
2. **Function Calls (Tools)** → Individual tool endpoints

---

## 📞 Call Lifecycle Events

### Endpoint
```
POST https://api.parlae.ca/vapi/webhook
```

### Configuration in Vapi Dashboard

Go to: **Vapi Dashboard → Phone Numbers → Select Phone → Server URL**

```
Server URL: https://api.parlae.ca/vapi/webhook
Server Secret: <VAPI_SERVER_SECRET from env>
```

### Events Received

| Event | When | Purpose |
|-------|------|---------|
| `assistant-request` | Call starts | Configure dynamic assistant settings |
| `status-update` | Call status changes | Track call progression (ringing, answered, etc.) |
| `end-of-call-report` | Call ends | Receive transcript, recording, analytics |

### Handler

**File**: `apps/backend/src/vapi/vapi-webhook.controller.ts`

```typescript
@Post('webhook')
async handleWebhook(@Body() payload, @Headers('x-vapi-signature') signature) {
  const messageType = payload?.message?.type;
  
  switch (messageType) {
    case 'assistant-request':
      return this.handleAssistantRequest(payload);
    case 'status-update':
      return this.handleStatusUpdate(payload);
    case 'end-of-call-report':
      return this.handleEndOfCall(payload);
  }
}
```

---

## 🛠️ Function Calls (Tools)

### Endpoints (One Per Tool)

Each tool has its own dedicated endpoint:

| Tool | Endpoint | Purpose |
|------|----------|---------|
| Transfer to Human | `https://api.parlae.ca/vapi/tools/transfer-to-human` | Transfer call to staff |
| Book Appointment | `https://api.parlae.ca/vapi/tools/book-appointment` | Schedule appointment in PMS |
| Check Availability | `https://api.parlae.ca/vapi/tools/check-availability` | Query open appointment slots |
| Get Patient Info | `https://api.parlae.ca/vapi/tools/get-patient-info` | Lookup patient by phone/name |
| Search Patients | `https://api.parlae.ca/vapi/tools/search-patients` | Search multiple patients |
| Create Patient | `https://api.parlae.ca/vapi/tools/create-patient` | Create new patient record |
| Update Patient | `https://api.parlae.ca/vapi/tools/update-patient` | Update patient information |
| Cancel Appointment | `https://api.parlae.ca/vapi/tools/cancel-appointment` | Cancel existing appointment |

### Configuration in Vapi Dashboard

Go to: **Vapi Dashboard → Assistants → Select Assistant → Functions**

Click **Add Function** and configure each tool:

#### Example: Book Appointment

```json
{
  "name": "bookAppointment",
  "description": "Book a dental appointment for the patient. Use this when the patient wants to schedule a new appointment.",
  "parameters": {
    "type": "object",
    "properties": {
      "patientId": {
        "type": "string",
        "description": "The patient's ID from the PMS system"
      },
      "datetime": {
        "type": "string",
        "description": "Appointment date and time in ISO 8601 format (e.g., 2026-02-15T10:00:00-05:00)"
      },
      "type": {
        "type": "string",
        "description": "Type of appointment (e.g., 'Cleaning', 'Filling', 'Emergency')"
      },
      "duration": {
        "type": "number",
        "description": "Duration in minutes (default: 30)"
      },
      "notes": {
        "type": "string",
        "description": "Any special notes or requests from the patient"
      }
    },
    "required": ["patientId", "datetime"]
  },
  "server": {
    "url": "https://api.parlae.ca/vapi/tools/book-appointment",
    "secret": "<VAPI_WEBHOOK_SECRET from env>"
  }
}
```

#### Example: Transfer to Human

```json
{
  "name": "transferToHuman",
  "description": "Transfer the call to a human staff member. Use this when the patient has an emergency, is frustrated, or requests to speak with someone.",
  "parameters": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "description": "Reason for transfer (e.g., 'emergency', 'complex_question', 'patient_request')",
        "enum": ["emergency", "complex_question", "patient_request", "technical_issue"]
      },
      "summary": {
        "type": "string",
        "description": "Brief summary of the conversation so far to help staff assist the patient"
      },
      "patientInfo": {
        "type": "object",
        "description": "Patient information collected during the call",
        "properties": {
          "name": { "type": "string" },
          "phone": { "type": "string" },
          "concern": { "type": "string" }
        }
      }
    },
    "required": ["reason", "summary"]
  },
  "server": {
    "url": "https://api.parlae.ca/vapi/tools/transfer-to-human",
    "secret": "<VAPI_WEBHOOK_SECRET from env>"
  }
}
```

#### Example: Get Patient Info

```json
{
  "name": "getPatientInfo",
  "description": "Look up patient information by phone number or name. Use this at the start of the call to identify the caller.",
  "parameters": {
    "type": "object",
    "properties": {
      "phone": {
        "type": "string",
        "description": "Patient's phone number"
      },
      "email": {
        "type": "string",
        "description": "Patient's email address"
      },
      "name": {
        "type": "string",
        "description": "Patient's full name"
      },
      "firstName": {
        "type": "string",
        "description": "Patient's first name"
      },
      "lastName": {
        "type": "string",
        "description": "Patient's last name"
      }
    }
  },
  "server": {
    "url": "https://api.parlae.ca/vapi/tools/get-patient-info",
    "secret": "<VAPI_WEBHOOK_SECRET from env>"
  }
}
```

### Handler

**File**: `apps/backend/src/vapi/vapi-tools.controller.ts`

```typescript
@Controller('vapi/tools')
export class VapiToolsController {
  @Post('book-appointment')
  async bookAppointment(@Body() body, @Headers('x-vapi-signature') signature) {
    this.verifyWebhookSignature(signature);
    return this.vapiToolsService.bookAppointment(body);
  }
  
  @Post('transfer-to-human')
  async transferToHuman(@Body() body, @Headers('x-vapi-signature') signature) {
    this.verifyWebhookSignature(signature);
    return this.vapiToolsService.transferToHuman(body);
  }
  
  // ... other tools
}
```

---

## 🔐 Security & Environment Variables

### Required Environment Variables

**Backend** (`apps/backend/.env`):

```bash
# Vapi webhook signature verification
VAPI_SERVER_SECRET=<your-vapi-server-secret>
VAPI_WEBHOOK_SECRET=<your-vapi-webhook-secret>

# Note: VAPI_SERVER_SECRET is for call lifecycle events
#       VAPI_WEBHOOK_SECRET is for function/tool calls
```

**Both secrets should be configured in AWS SSM**:
```bash
/parlae/backend/VAPI_SERVER_SECRET
/parlae/backend/VAPI_WEBHOOK_SECRET
```

### Signature Verification

Every webhook request includes a signature header: `x-vapi-signature`

Backend verifies this before processing:

```typescript
private verifyWebhookSignature(signature: string) {
  if (signature !== process.env.VAPI_WEBHOOK_SECRET) {
    throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
  }
}
```

---

## 📋 Complete Function List for Vapi

Copy these function definitions into Vapi Dashboard:

### 1. transferToHuman
- **URL**: `https://api.parlae.ca/vapi/tools/transfer-to-human`
- **When to call**: Emergency, frustrated patient, complex request
- **Returns**: `{ success, transferTo, message }`

### 2. bookAppointment
- **URL**: `https://api.parlae.ca/vapi/tools/book-appointment`
- **When to call**: Patient wants to schedule appointment
- **Returns**: `{ success, appointmentId, confirmationNumber, message }`

### 3. checkAvailability
- **URL**: `https://api.parlae.ca/vapi/tools/check-availability`
- **When to call**: Before booking, to show available slots
- **Returns**: `{ success, availableSlots[], message }`

### 4. getPatientInfo
- **URL**: `https://api.parlae.ca/vapi/tools/get-patient-info`
- **When to call**: Start of call, to identify caller
- **Returns**: `{ success, patient: { name, lastVisit, balance }, message }`

### 5. searchPatients
- **URL**: `https://api.parlae.ca/vapi/tools/search-patients`
- **When to call**: Ambiguous patient name (multiple matches)
- **Returns**: `{ success, patients[], count, message }`

### 6. createPatient
- **URL**: `https://api.parlae.ca/vapi/tools/create-patient`
- **When to call**: New patient calling for first time
- **Returns**: `{ success, patient: { id, name }, message }`

### 7. updatePatient
- **URL**: `https://api.parlae.ca/vapi/tools/update-patient`
- **When to call**: Patient provides new phone/email/address
- **Returns**: `{ success, message }`

### 8. cancelAppointment
- **URL**: `https://api.parlae.ca/vapi/tools/cancel-appointment`
- **When to call**: Patient wants to cancel existing appointment
- **Returns**: `{ success, message }`

---

## 🧪 Testing

### Test Lifecycle Webhook
```bash
curl -X POST https://api.parlae.ca/vapi/webhook \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: your-secret" \
  -d '{
    "message": {
      "type": "status-update",
      "call": {"id": "test-123"}
    }
  }'
```

### Test Tool Endpoint
```bash
curl -X POST https://api.parlae.ca/vapi/tools/get-patient-info \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: your-secret" \
  -d '{
    "message": {
      "functionCall": {
        "name": "getPatientInfo",
        "parameters": {
          "phone": "555-1234"
        }
      },
      "call": {"id": "test-call-123"}
    }
  }'
```

---

## 📝 Summary

### Lifecycle Events
✅ **ONE** webhook: `https://api.parlae.ca/vapi/webhook`  
✅ Receives: assistant-request, status-update, end-of-call-report  
✅ Configure in: Phone Number settings

### Function Calls (Tools)
✅ **MULTIPLE** endpoints: `https://api.parlae.ca/vapi/tools/*`  
✅ One endpoint per tool  
✅ Configure in: Assistant → Functions  
✅ Each function specifies its own `server.url`

### Security
✅ All requests verified with `x-vapi-signature` header  
✅ Two secrets: `VAPI_SERVER_SECRET` (lifecycle) + `VAPI_WEBHOOK_SECRET` (tools)  
✅ Store in AWS SSM, inject into ECS tasks
