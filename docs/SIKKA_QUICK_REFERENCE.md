# Sikka API - Quick Reference Card

**Last Updated**: March 2, 2026

---

## Authentication

### Initial Setup (One Time):
```bash
App-Id: <your-app-id>
App-Key: <your-app-key>
```

### Authorization Flow:
```
1. GET /authorized_practices
   Headers: App-Id, App-Key
   → office_id, secret_key, practice_id

2. POST /request_key
   Body: { grant_type: "request_key", office_id, secret_key, app_id, app_key }
   → request_key (24h), refresh_key

3. POST /request_key (refresh)
   Body: { grant_type: "refresh_key", refresh_key, app_id, app_key }
   → new request_key, new refresh_key
```

### Using the API:
```bash
curl -H "Request-Key: YOUR_REQUEST_KEY" https://api.sikkasoft.com/v4/appointments
```

---

## Common Endpoints

### Patients (READ):
```bash
GET /patients                          # List/search patients
GET /patients?firstname=John&lastname=Doe
GET /patients?cell=555-123-4567
GET /patients?email=john@example.com
GET /patients?patient_id=12345
GET /patient_extended_info             # Extended demographics
GET /patient_balance?patient_id=123
```

### Patients (WRITE - Async Writeback):
```bash
POST /patient                          # Singular! Creates new patient
PATCH /patient/{patient_id}            # Update patient
```

**POST /patient body fields:**
- `firstname` (Required), `lastname` (Required), `practice_id` (Required)
- `provider_id` (Required for some PMS)
- `birthdate` (Optional, format: yyyy-MM-dd)
- `email`, `cell`, `homephone`, `workphone`, `other_phone` (Optional)
- `gender` (male/female/unknown), `guarantor_id`, `is_guarantor_exist`
- `address_line1`, `address_line2`, `city`, `state`, `zipcode`, `country`

### Appointments (READ):
```bash
GET /appointments?limit=50
GET /appointments?patient_id=123&practice_id=1
GET /appointments?startdate=2026-03-01&enddate=2026-03-31
GET /appointments_available_slots?practice_id=1&startdate=2026-03-01
```

### Appointments (WRITE - Async Writeback):
```bash
POST /appointment                      # Singular! Book appointment
PATCH /appointments/{appointment_sr_no}
DELETE /appointments/{appointment_sr_no}
```

**POST /appointment body fields:**
- `patient_id` (Required), `provider_id` (Required), `practice_id` (Required)
- `date` (Required, format: yyyy-mm-dd), `time` (Required), `length` (duration in minutes)
- `type`, `description`, `note`, `operatory`
- `guarantor_id`, `staff`, `is_new_patient`
- New patient fields: `firstname`, `lastname`, `birthdate`, `email`, `phone`

### Writeback Status:
```bash
GET /writeback_status?id={writeback_id}
```

---

## Response Formats

### List Response:
```json
{
  "offset": "0",
  "limit": "50",
  "total_count": "87",
  "execution_time": "47",
  "pagination": {
    "first": "https://api.sikkasoft.com/v4/patients?offset=0&limit=50",
    "previous": "",
    "current": "https://api.sikkasoft.com/v4/patients?offset=0&limit=50",
    "next": "https://api.sikkasoft.com/v4/patients?offset=50&limit=50",
    "last": "https://api.sikkasoft.com/v4/patients?offset=50&limit=50"
  },
  "items": [...]
}
```

### Patient Item (default fields):
```json
{
  "patient_id": "799601",
  "guarantor_id": "799600",
  "firstname": "Carlene",
  "middlename": "",
  "lastname": "Victoria",
  "preferred_name": "Caeene",
  "salutation": "",
  "birthdate": "1984-12-10T00:00:00",
  "status": "active"
}
```
Note: Phone fields (`cell`, `homephone`, `workphone`) are available via `fields=get_all` or `patient_extended_info`.

### Appointment Item (fields=get_all):
```json
{
  "appointment_sr_no": "12345",
  "patient_id": "799601",
  "provider_id": "101",
  "practice_id": "1",
  "date": "2026-03-15",
  "time": "10:00",
  "length": "30",
  "status": "scheduled",
  "type": "Checkup",
  "description": "Regular checkup",
  "note": "Patient notes",
  "operatory": "Op 1",
  "patient_name": "Carlene Victoria"
}
```

### Writeback Response (POST/PATCH/DELETE):
```json
{
  "http_code": "201",
  "http_code_desc": "Created",
  "error_code": "API2016",
  "short_message": "New resource created successfully",
  "long_message": "Id:275495",
  "more_information": "https://api.sikkasoft.com/v4/writeback_status?id=275495"
}
```

### Writeback Status Response:
```json
{
  "items": [{
    "id": "275495",
    "office_id": "D37509",
    "method": "POST",
    "api": "patients",
    "is_completed": "True",
    "has_error": "False",
    "completed_time": "2026-02-07 15:30:00",
    "result": "New Patient inserted successfully"
  }]
}
```

---

## Rate Limiting

**Limit**: 200 API requests per practice per **MINUTE** (12,000/hour)

**Strategy**:
- 50 requests reserved for actual operations (bookings, updates)
- 150 requests for status checks
- 10-second initial delay before first check
- Exponential backoff: 10s, 10s, 20s, 30s, 1m, 2m, 5m, 10m, 30m
- Average confirmation: **20-30 seconds**

---

## Field Name Reference (Sikka uses snake_case, NO underscores in names)

| Sikka Field | Our Field | Notes |
|---|---|---|
| `firstname` | `firstName` | No underscore! |
| `lastname` | `lastName` | No underscore! |
| `birthdate` | `dateOfBirth` | Not `date_of_birth` |
| `cell` | `phone` | Mobile phone |
| `homephone` | - | Home phone |
| `workphone` | - | Work phone |
| `patient_id` | `id` | Uses underscore |
| `appointment_sr_no` | `id` | Appointment serial number |
| `practice_id` | `practiceId` | Query param, not path |
| `provider_id` | `providerId` | Uses underscore |
| `startdate` | - | Appointment query param |
| `enddate` | - | Appointment query param |
| `is_completed` | - | Writeback: "True"/"False" string |
| `has_error` | - | Writeback: "True"/"False" string |

---

## Common Issues

### 401 Unauthorized:
```
Cause: Token expired
Fix: Run token refresh job
```

### Writeback ID Not Found:
```
Cause: Sikka does NOT return a plain "id" field in writeback responses
Fix: Parse ID from "long_message" (e.g. "Id:275495") or "more_information" URL
```

### Patient Search Returns Empty:
```
Cause: Using wrong field names (first_name vs firstname) or wrong endpoint (/patients/search vs /patients)
Fix: Use GET /patients with params: firstname, lastname, cell, email
```

---

**Rate Limit**: 200 req/**minute** per practice (12,000/hour)
**Tokens expire in**: 24 hours
**Refresh interval**: Every 23 hours
**Writeback polling**: Every 2 seconds
**Average confirmation**: 20-30 seconds
**Max check attempts**: 10
