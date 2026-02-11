# Backend API Reference

## Base URL

- **Development**: `http://localhost:4000`
- **Production**: `https://api.parlae.ai`

## Authentication

### Authenticated Endpoints
Use Cognito JWT token in Authorization header:

```bash
Authorization: Bearer <JWT_TOKEN>
```

Get token from NextAuth session in frontend.

### Webhook Endpoints
Use webhook signature in custom header:

```bash
x-vapi-signature: <WEBHOOK_SECRET>
```

## PMS Endpoints

### Setup PMS Integration

**POST** `/pms/setup`

Setup or update PMS integration for the authenticated user's account.

**Authentication**: Required (Cognito JWT)

**Request Body**:
```json
{
  "provider": "SIKKA",
  "credentials": {
    "appId": "your_app_id",
    "appKey": "your_app_key"
  },
  "config": {
    "timezone": "America/Toronto",
    "defaultAppointmentDuration": 30
  }
}
```

**Response**:
```json
{
  "success": true,
  "provider": "SIKKA"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "CONNECTION_FAILED",
    "message": "Failed to connect to PMS"
  }
}
```

### Get PMS Status

**GET** `/pms/status`

Get PMS integration status for the authenticated user's account.

**Authentication**: Required (Cognito JWT)

**Response**:
```json
{
  "success": true,
  "integrations": [
    {
      "id": "pms_123",
      "provider": "SIKKA",
      "providerName": "Sikka",
      "status": "active",
      "lastSyncAt": "2026-02-11T12:00:00Z",
      "features": {
        "appointments": true,
        "patients": true,
        "insurance": true
      },
      "createdAt": "2026-02-10T10:00:00Z",
      "updatedAt": "2026-02-11T12:00:00Z"
    }
  ]
}
```

## Vapi Tool Endpoints

All Vapi tool endpoints require webhook signature verification.

### Transfer to Human

**POST** `/vapi/tools/transfer-to-human`

Called by Vapi when the AI needs to transfer a call to a human.

**Authentication**: Webhook signature (`x-vapi-signature` header)

**Request Body** (from Vapi):
```json
{
  "call": {
    "id": "call_123",
    "phoneNumberId": "phone_abc"
  },
  "message": {
    "functionCall": {
      "name": "transferToHuman",
      "parameters": {
        "reason": "emergency",
        "summary": "Patient has severe pain",
        "patientInfo": {
          "name": "John Doe",
          "phone": "+14155551234"
        }
      }
    }
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "action": "transfer",
    "transferTo": "+14155556789",
    "message": "Transferring you to our staff now. Please hold.",
    "summary": "Patient has severe pain",
    "patientInfo": {
      "name": "John Doe"
    }
  }
}
```

### Book Appointment

**POST** `/vapi/tools/book-appointment`

Called by Vapi when the AI needs to book an appointment via PMS.

**Authentication**: Webhook signature

**Request Body**:
```json
{
  "call": {
    "id": "call_123",
    "phoneNumberId": "phone_abc"
  },
  "message": {
    "functionCall": {
      "name": "bookAppointment",
      "parameters": {
        "patientId": "patient_123",
        "appointmentType": "cleaning",
        "date": "2026-02-15",
        "time": "10:00",
        "duration": 30
      }
    }
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "appointmentId": "appt_123",
    "confirmationNumber": "CONF-123",
    "message": "Appointment booked for February 15th at 10:00 AM"
  }
}
```

### Check Availability

**POST** `/vapi/tools/check-availability`

Called by Vapi to check available appointment slots.

**Authentication**: Webhook signature

**Request Body**:
```json
{
  "call": {
    "id": "call_123",
    "phoneNumberId": "phone_abc"
  },
  "message": {
    "functionCall": {
      "name": "checkAvailability",
      "parameters": {
        "date": "2026-02-15",
        "appointmentType": "cleaning",
        "providerId": "provider_123"
      }
    }
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "availableSlots": [
      {
        "time": "10:00",
        "provider": "Dr. Smith",
        "available": true
      },
      {
        "time": "14:30",
        "provider": "Dr. Jones",
        "available": true
      }
    ]
  }
}
```

### Get Patient Info

**POST** `/vapi/tools/get-patient-info`

Called by Vapi to lookup patient information.

**Authentication**: Webhook signature

**Request Body**:
```json
{
  "call": {
    "id": "call_123",
    "phoneNumberId": "phone_abc"
  },
  "message": {
    "functionCall": {
      "name": "getPatientInfo",
      "parameters": {
        "phone": "+14155551234"
      }
    }
  }
}
```

**Response**:
```json
{
  "result": {
    "success": true,
    "patient": {
      "id": "patient_123",
      "firstName": "John",
      "lastName": "Doe",
      "lastVisit": "2026-01-15",
      "balance": 150.00
    }
  }
}
```

## Twilio Endpoints

### Voice Webhook

**POST** `/twilio/voice`

Handles all inbound phone calls from Twilio.

**Authentication**: None (comes from Twilio)

**Request Body** (Form data from Twilio):
```
From=+14155551234
To=+14155556789
CallSid=CA123abc
```

**Response** (TwiML XML):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true">
    <Sip username="phone_abc" password="vapi_key">
      sip:phone_abc@sip.vapi.ai
    </Sip>
  </Dial>
</Response>
```

## Error Responses

All endpoints follow consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "statusCode": 400
}
```

### Common Error Codes

- `UNAUTHORIZED` (401) - Missing or invalid auth token
- `INVALID_REQUEST` (400) - Invalid request body
- `INVALID_CREDENTIALS` (400) - Invalid PMS credentials
- `CONNECTION_FAILED` (500) - Failed to connect to PMS
- `NOT_FOUND` (404) - Resource not found
- `INTERNAL_ERROR` (500) - Unexpected server error

## Rate Limits

### Authenticated Endpoints
- **Rate Limit**: 100 requests per minute per user
- **Burst**: 20 requests per second

### Webhook Endpoints
- **Rate Limit**: 1000 requests per minute per account
- **Burst**: 100 requests per second

(Note: Not implemented yet - add rate limiting middleware later)

## CORS Configuration

Backend allows requests from:
- `http://localhost:3000` (development)
- `https://app.parlae.ai` (production frontend)

## Health Check

**GET** `/health`

Check if backend is running and database is connected.

**Response**:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-02-11T12:00:00Z"
}
```

## Development Testing

### Using curl

```bash
# Get JWT token from frontend session
TOKEN="your_jwt_token_here"

# Test PMS setup
curl -X POST http://localhost:4000/pms/setup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"provider":"SIKKA","credentials":{"appId":"test","appKey":"test"}}'

# Test PMS status
curl -X GET http://localhost:4000/pms/status \
  -H "Authorization: Bearer $TOKEN"

# Test Vapi webhook
curl -X POST http://localhost:4000/vapi/tools/transfer-to-human \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: your_webhook_secret" \
  -d '{"call":{"id":"test","phoneNumberId":"test"},"message":{"functionCall":{"parameters":{}}}}'
```

### Using Postman

1. Create a new collection "Parlae Backend"
2. Add environment variables:
   - `baseUrl`: `http://localhost:4000`
   - `jwtToken`: (get from frontend session)
   - `vapiWebhookSecret`: (from env)

3. Import endpoints from this doc
4. Test each endpoint

---

**Last Updated**: February 11, 2026  
**Version**: 1.0  
**Status**: Ready for testing
