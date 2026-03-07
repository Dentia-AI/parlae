# Sikka API - Quick Reference Card

**Last Updated**: March 2, 2026
**Official Docs**: https://apidocs.sikkasoft.com/

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

## Endpoints We Use

### Patients (READ):
```bash
GET /patients                               # List/search patients
GET /patients?patient_id=12345              # Fetch single patient by ID
GET /patients?firstname=John&lastname=Doe   # Search by name
GET /patients?cell=555-123-4567             # Search by phone
GET /patients?email=john@example.com        # Search by email
GET /patient_extended_info?patient_id=123   # Extended demographics (phone, address, etc.)
GET /patient_balance?patient_id=123         # Patient balance
```

**Important**: Sikka does NOT support `/patients/{id}` as a path parameter. Always use query params.

### Patients (WRITE - Async Writeback):
```bash
POST /patient                               # Singular! Creates new patient
PATCH /patient/{patient_id}                  # Update patient (uses PUT per docs)
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
POST /appointment                              # Singular! Book new appointment
PUT /appointments/{appointment_sr_no}          # Reschedule (change date/time/length/etc.)
PATCH /appointments/{appointment_sr_no}        # Update status only (cancel, confirm, etc.)
```

**There is NO `DELETE` endpoint for appointments.** Cancellation is done via PATCH with status change.

**POST /appointment body fields:**
- `patient_id` (Required), `provider_id` (Required), `practice_id` (Required)
- `date` (Required, format: yyyy-mm-dd), `time` (Required, format: HH:mm), `length` (duration in minutes)
- `type`, `description`, `note`, `operatory`
- `guarantor_id`, `staff`, `is_new_patient`
- New patient fields: `firstname`, `lastname`, `birthdate`, `email`, `phone`

**PUT /appointments/{appointment_sr_no} body fields (Reschedule):**
- `practice_id` (Required)
- `date` (Optional, format: yyyy-mm-dd), `time` (Optional, format: HH:mm)
- `length` (Optional, integer), `provider_id` (Required), `operatory` (Optional)
- `status`, `type`, `description`, `schedule`, `staff`, `check_spu`
- At least one of date/time/length/operatory/provider_id/status must be provided

**PATCH /appointments/{appointment_sr_no} body fields (Status change / Cancel):**
- `appointment_sr_no` (Required), `practice_id` (Required)
- `op`: "replace" (Required)
- `path`: "/status" (Required)
- `value`: new status, e.g. "Cancelled" (Required - get valid values from `appointment_statuses` API)
- `cancellation_note` (Optional), `cancellation_code_id` (Optional, Planet DDS only)
- `status_changed_by` (Optional), `staff` (Optional)

### Medical Notes:
```bash
GET /medical_notes?patient_id=123           # Read notes for a patient
POST /medical_notes                          # Create note (writeback)
```

**Important**: There is NO `/patients/{id}/notes` endpoint. Notes are a flat top-level resource.

### Insurance:
```bash
GET /insurance_plan_coverage?patient_id=123  # Patient's insurance coverage
GET /insurance_companies                      # List insurance companies
GET /insurance_accounts_receivables           # Insurance A/R
```

**Important**: There is NO `/patients/{id}/insurance` nested endpoint.
Insurance write operations are NOT supported via Sikka API - manage through PMS directly.

### Transactions / Payments:
```bash
GET /transactions?patient_id=123            # Payment history
POST /transaction                            # Create payment (writeback)
```

**POST /transaction body fields:**
- `patient_id`, `amount`, `method`, `last4`, `notes`

### Providers:
```bash
GET /providers                               # List all providers
GET /providers?provider_id=PROV1             # Fetch single provider by ID
```

**Important**: Sikka does NOT support `/providers/{id}` as a path parameter. Always use query params.

### Writeback Status:
```bash
GET /writeback_status?id={writeback_id}      # Check specific writeback status
GET /writebacks                               # List all writebacks (uses App-Id/App-Key)
GET /writeback_details?writeback_type=X       # Get valid field values for writebacks
```

---

## Sikka API Architecture Notes

### Flat Endpoint Pattern
Sikka uses **flat, top-level endpoints** - NOT nested REST resources:
- `/patients` (not `/practices/{id}/patients`)
- `/medical_notes` (not `/patients/{id}/notes`)
- `/insurance_plan_coverage` (not `/patients/{id}/insurance`)
- `/providers` (not `/practices/{id}/providers`)

Individual records are fetched via **query params**, not path params:
- `GET /patients?patient_id=123` (not `GET /patients/123`)
- `GET /providers?provider_id=PROV1` (not `GET /providers/PROV1`)

### PQL (Practice Query Language)
Sikka supports a SQL-like query language for combining data from multiple APIs in one call.
Queryable APIs include: `patients`, `appointments`, `providers`, `transactions`, `medical_notes`,
`insurance_companies`, `claims`, `treatment_plans`, and many more.

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
  "patient_id": "5383",
  "provider_id": "DMD2",
  "practice_id": "1",
  "date": "2020-09-29T00:00:00",
  "time": "10:30",
  "length": "60",
  "status": "status",
  "type": "General",
  "description": "Seat Br-UR",
  "note": "",
  "appointment_made_date": "2020-09-14T00:00:00",
  "patient_name": "patient name"
}
```

### Writeback Response (POST/PATCH/PUT):
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

## Field Name Reference (Sikka uses snake_case, names like firstname have NO underscores)

| Sikka Field | Our Field | Notes |
|---|---|---|
| `firstname` | `firstName` | No underscore! |
| `lastname` | `lastName` | No underscore! |
| `birthdate` | `dateOfBirth` | Not `date_of_birth` |
| `cell` | `phone` | Mobile phone |
| `homephone` | - | Home phone (no underscore) |
| `workphone` | - | Work phone (no underscore) |
| `patient_id` | `id` | Uses underscore |
| `appointment_sr_no` | `id` | Appointment serial number |
| `practice_id` | `practiceId` | Query param, not path |
| `provider_id` | `providerId` | Uses underscore |
| `startdate` | - | Appointment query param (no underscore) |
| `enddate` | - | Appointment query param (no underscore) |
| `is_completed` | - | Writeback: "True"/"False" string |
| `has_error` | - | Writeback: "True"/"False" string |

---

## Common Issues & Gotchas

### No DELETE for appointments:
```
Cause: Tried DELETE /appointments/{id}
Fix: Use PATCH /appointments/{id} with op:"replace", path:"/status", value:"Cancelled"
```

### No nested resource endpoints:
```
WRONG: GET /patients/{id}/notes, GET /patients/{id}/insurance
RIGHT: GET /medical_notes?patient_id=X, GET /insurance_plan_coverage?patient_id=X
```

### No direct insurance write:
```
Cause: Tried POST/PATCH /patients/{id}/insurance
Fix: Insurance must be managed through the PMS directly
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

### 401 Unauthorized:
```
Cause: Token expired
Fix: Run token refresh job
```

### Reschedule uses wrong HTTP method:
```
WRONG: PATCH /appointments/{id} with start_time, duration
RIGHT: PUT /appointments/{id} with practice_id (required!), date, time, length, provider_id
```

---

## Documentation Files We Have

| File | Contents | Lines |
|---|---|---|
| `sikka-api.json` | Postman v2.0 - Read API, auth, payment gateway, MCP | 17,314 |
| `sikka-2.json` | Postman examples - Example responses for read endpoints | 13,881 |
| `sikka-3.json` | Postman v2.0 - Writeback (write) APIs | 2,446 |

**Source**: https://apidocs.sikkasoft.com/ (SPA - hard to scrape)

### Endpoints NOT in our docs but used in code:
These were verified via the live docs site and web search:
- `GET /medical_notes?patient_id=X` - confirmed via PQL queryable list
- `GET /insurance_plan_coverage?patient_id=X` - confirmed via API docs
- `GET /patients?patient_id=X` - uses list endpoint with filter (confirmed)
- `GET /providers?provider_id=X` - uses list endpoint with filter (confirmed)

---

**Rate Limit**: 200 req/**minute** per practice (12,000/hour)
**Tokens expire in**: 24 hours
**Refresh interval**: Every 23 hours
**Writeback polling**: Every 2 seconds
**Average confirmation**: 20-30 seconds
**Max check attempts**: 10
