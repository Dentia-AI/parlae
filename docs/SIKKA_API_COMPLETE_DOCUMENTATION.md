# Sikka API Complete Documentation

## Authorization Flow

### Step 1: Get Authorized Practices

First, get your authorized practices to retrieve `office_id` and `secret_key`:

```bash
GET https://api.sikkasoft.com/v4/authorized_practices
Headers:
  Request-Key: <your_initial_request_key>
```

**Response:**
```json
{
  "items": [
    {
      "office_id": "D36225",
      "practice_id": "1-1",
      "secret_key": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
      "practice_name": "Test Dental Clinic"
    }
  ]
}
```

### Step 2: Generate request_key

Use the `office_id` and `secret_key` to generate a new `request_key`:

```bash
POST https://api.sikkasoft.com/v4/request_key
Headers:
  Content-Type: application/json

Body:
{
  "grant_type": "request_key",
  "office_id": "D36225",
  "secret_key": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
  "app_id": "b0cac8c638d52c92f9c0312159fc4518",
  "app_key": "7beec2a9e62bd692eab2e0840b8bb2db"
}
```

**Response:**
```json
{
  "href": "https://api.sikkasoft.com/v4/request_key_info?request_key=xxxx",
  "request_key": "70a2c702705ad41c395f8bd639fa7f85",
  "start_time": "2026-02-10T04:00:28",
  "end_time": "2026-02-11T04:00:28",
  "expires_in": "85603 second(s)",
  "issued_to": "D36225",
  "status": "active",
  "refresh_key": "yyyy-yyyy-yyyy-yyyy",
  "domain": "Dental"
}
```

**Key Fields:**
- `request_key`: Use this for API calls (valid for 24 hours)
- `refresh_key`: Use this to generate a new `request_key` when the current one expires
- `expires_in`: Time until expiration (in seconds)

### Step 3: Refresh request_key (Every 24 Hours)

When your `request_key` is about to expire, use the `refresh_key` to get a new one:

```bash
POST https://api.sikkasoft.com/v4/request_key
Headers:
  Content-Type: application/json

Body:
{
  "grant_type": "refresh_key",
  "refresh_key": "yyyy-yyyy-yyyy-yyyy",
  "app_id": "b0cac8c638d52c92f9c0312159fc4518",
  "app_key": "7beec2a9e62bd692eab2e0840b8bb2db"
}
```

**Response:** (same as Step 2)
```json
{
  "request_key": "new-70a2c702705ad41c395f8bd639fa7f85",
  "refresh_key": "new-yyyy-yyyy-yyyy-yyyy",
  "expires_in": "85603 second(s)"
}
```

### Step 4: Check request_key Info

```bash
GET https://api.sikkasoft.com/v4/request_key_info
Headers:
  Request-Key: <your_request_key>
```

**Response:**
```json
{
  "request_key": "70a2c702705ad41c395f8bd639fa7f85",
  "expires_in": "45231 second(s)",
  "status": "active",
  "request_count": "52"
}
```

---

## Read Operations (GET)

All read operations use `Request-Key` header:

```bash
Headers:
  Request-Key: <your_request_key>
```

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/appointments` | List appointments |
| GET | `/appointments/{id}` | Get specific appointment |
| GET | `/appointments_available_slots` | Get available time slots |
| GET | `/appointment_statuses` | List appointment statuses |

### Patients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/patients` | List patients |
| GET | `/patients/{id}` | Get specific patient |
| GET | `/patient_extended_info` | Extended patient info |
| GET | `/patient_balance` | Patient account balance |
| GET | `/patient_documents` | Patient documents |
| GET | `/patient_treatment_history` | Treatment history |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/providers` | List providers |
| GET | `/operatories` | List operatories |
| GET | `/insurance_companies` | List insurance companies |
| GET | `/transactions` | Financial transactions |

---

## Writeback Operations (POST/PATCH/DELETE)

Writeback operations are **ASYNCHRONOUS** and use `Request-Key` header.

### Important: Writeback Flow

1. **Submit writeback request** → Get an `id`
2. **Request is queued** with status `pending`
3. **SPU (Sikka Platform Utility)** processes the request on practice's server
4. **Poll `/writebacks` endpoint** to check status

### Book Appointment

```bash
POST https://api.sikkasoft.com/v4/appointment
Headers:
  Request-Key: <your_request_key>
  Content-Type: application/json

Body:
{
  "practice_id": "1-1",
  "patient_id": "12345",
  "provider_id": "DOC1",
  "operatory_id": "OP1",
  "start_time": "2026-02-15 10:00:00",
  "duration": "60",
  "appointment_type": "Checkup",
  "appointment_status": "Scheduled"
}
```

**Response:**
```json
{
  "id": "12345678",
  "result": "pending",
  "message": "Appointment creation request submitted"
}
```

### Update Appointment

```bash
PATCH https://api.sikkasoft.com/v4/appointments/{appointment_sr_no}
Headers:
  Request-Key: <your_request_key>
  Content-Type: application/json

Body:
{
  "op": "replace",
  "path": "/appointment_status",
  "value": "Confirmed"
}
```

### Cancel Appointment

```bash
DELETE https://api.sikkasoft.com/v4/appointments/{appointment_sr_no}
Headers:
  Request-Key: <your_request_key>
```

### Create Patient

```bash
POST https://api.sikkasoft.com/v4/patient
Headers:
  Request-Key: <your_request_key>
  Content-Type: application/json

Body:
{
  "practice_id": "1-1",
  "first_name": "John",
  "last_name": "Smith",
  "date_of_birth": "1990-01-01",
  "email": "john@example.com",
  "mobile_phone": "+14155551234"
}
```

### Update Patient

```bash
PATCH https://api.sikkasoft.com/v4/patient/{patient_id}
Headers:
  Request-Key: <your_request_key>
  Content-Type: application/json

Body:
{
  "email": "newemail@example.com",
  "mobile_phone": "+14155559999"
}
```

---

## Check Writeback Status

After submitting a writeback, poll this endpoint to check status:

```bash
GET https://api.sikkasoft.com/v4/writebacks?id={writeback_id}
Headers:
  App-Id: <your_app_id>
  App-Key: <your_app_key>
```

**OR** get all recent writebacks:

```bash
GET https://api.sikkasoft.com/v4/writebacks?startdate=2026-02-10&enddate=2026-02-11
Headers:
  App-Id: <your_app_id>
  App-Key: <your_app_key>
```

**Response:**
```json
{
  "items": [
    {
      "id": "12345678",
      "result": "completed",  // or "pending", "failed"
      "office_id": "D36225",
      "method": "POST",
      "api_name": "appointment",
      "command_time": "2026-02-10T10:00:00",
      "completed_time": "2026-02-10T10:00:15",
      "duration_in_second": "15",
      "error_message": ""  // if failed
    }
  ]
}
```

**Status Values:**
- `pending`: Waiting to be processed by SPU
- `completed`: Successfully written to PMS
- `failed`: Error occurred (check `error_message`)

---

## Authentication Summary

### For Read Operations (GET):
```bash
Headers:
  Request-Key: <your_request_key>
```

### For Writeback Status Tracking:
```bash
Headers:
  App-Id: <your_app_id>
  App-Key: <your_app_key>
```

### For Token Management:
```bash
POST /v4/request_key
Body: { "grant_type": "request_key" or "refresh_key", ... }
```

---

## Complete Endpoint List

### Authentication & Authorization
- `GET /authorized_practices` - Get practices and credentials
- `POST /request_key` - Generate/refresh request_key
- `GET /request_key_info` - Check request_key status
- `DELETE /request_key` - Revoke request_key

### Appointments (Read)
- `GET /appointments`
- `GET /appointments/{id}`
- `GET /appointments_available_slots`
- `GET /appointment_statuses`
- `GET /preregistered_appointments`

### Appointments (Write)
- `POST /appointment` - Book appointment
- `PATCH /appointments/{id}` - Update appointment
- `DELETE /appointments/{id}` - Cancel appointment

### Patients (Read)
- `GET /patients`
- `GET /patients/{id}`
- `GET /patient_extended_info`
- `GET /patient_balance`
- `GET /patient_treatment_history`
- `GET /patient_documents`
- `GET /patient_images`
- `GET /patient_charts`
- `GET /patient_status_history`
- `GET /patient_addresses`
- `GET /veterinary_patients`

### Patients (Write)
- `POST /patient` - Create patient
- `PATCH /patient/{id}` - Update patient
- `POST /veterinary_patient` - Create veterinary patient

### Clinical Data (Write)
- `POST /medical_notes` - Add medical notes
- `POST /lab_result` - Add lab results
- `POST /document` - Upload document
- `POST /perio_chart` - Add perio chart

### Financial (Read)
- `GET /transactions`
- `GET /accounts_receivables_by_patients`
- `GET /claims`
- `GET /claim_payments`

### Financial (Write)
- `POST /transaction` - Add transaction
- `POST /claim_payment` - Add claim payment
- `PATCH /claims/{id}` - Update claim

### Provider & Practice
- `GET /providers`
- `GET /operatories`
- `GET /practice_info`
- `GET /insurance_companies`
- `GET /procedure_codes`

### Writebacks
- `GET /writeback_details` - Get writeback requirements
- `GET /writebacks` - Check writeback status
- `DELETE /writebacks` - Cancel pending writeback

---

## Response Format

All endpoints return:

```json
{
  "offset": "0",
  "limit": "50",
  "total_count": "100",
  "execution_time": "250",
  "pagination": {
    "first": "https://...",
    "previous": "",
    "current": "https://...",
    "next": "https://...",
    "last": "https://..."
  },
  "items": [...]
}
```

---

## Rate Limiting

Sikka enforces rate limits via headers:

```
X-Rate-Limit-Limit: 20
X-Rate-Limit-Remaining: 15
X-Rate-Limit-Reset: 24
```

---

## Error Responses

```json
{
  "error": "invalid_request",
  "error_description": "request_key has expired",
  "status_code": 401
}
```

Common error codes:
- `401`: Invalid or expired request_key
- `403`: Insufficient permissions
- `404`: Resource not found
- `429`: Rate limit exceeded
- `500`: Server error

---

## Production Checklist

- [ ] Store `refresh_key` securely (encrypted in database)
- [ ] Implement automatic token refresh (every 23 hours)
- [ ] Monitor `request_key` expiration
- [ ] Poll writeback status for async operations
- [ ] Handle rate limits gracefully
- [ ] Log all API calls for audit trail
- [ ] Encrypt PHI data at rest
- [ ] Use HTTPS/TLS for all requests
- [ ] Rotate credentials periodically
