# Sikka v4 API Integration

## Overview

Sikka API v4 uses simple header-based authentication instead of OAuth 2.0. This makes integration much simpler and more reliable.

## Authentication

### Request-Key Header

All API requests use a single `Request-Key` header:

```bash
curl 'https://api.sikkasoft.com/v4/appointments' \
  -H 'Request-Key: 70a2c702705ad41c395f8bd639fa7f85'
```

### Test Credentials

```javascript
{
  "requestKey": "70a2c702705ad41c395f8bd639fa7f85",
  "practiceKey": "84A9439BD3627374VGUV",
  "masterCustomerId": "D36225",
  "spuInstallationKey": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0="
}
```

## API Endpoints

Base URL: `https://api.sikkasoft.com/v4`

### Patients

```bash
# List patients
GET /v4/patients?limit=10

# Search patients
GET /v4/patients/search?query=Smith

# Get patient by ID
GET /v4/patients/{patientId}

# Create patient
POST /v4/patients
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@example.com",
  "phone": "+14155551234",
  "dateOfBirth": "1990-01-01"
}
```

### Appointments

```bash
# List appointments
GET /v4/appointments?startDate=2026-02-01&endDate=2026-02-28

# Get appointment by ID
GET /v4/appointments/{appointmentId}

# Book appointment
POST /v4/appointments
{
  "patientId": "123",
  "providerId": "456",
  "startTime": "2026-02-15T10:00:00Z",
  "duration": 60,
  "type": "checkup"
}

# Cancel appointment
DELETE /v4/appointments/{appointmentId}

# Reschedule appointment
PATCH /v4/appointments/{appointmentId}
{
  "startTime": "2026-02-15T14:00:00Z"
}
```

### Availability

```bash
# Get provider availability
GET /v4/availability?providerId=456&startDate=2026-02-01&endDate=2026-02-28
```

## Code Implementation

### SikkaService Configuration

```typescript
// apps/frontend/packages/shared/src/pms/types.ts
export interface SikkaCredentials extends PmsCredentials {
  requestKey: string;          // Primary auth method for v4 API
  practiceKey?: string;        // Optional practice identifier
  masterCustomerId?: string;   // Optional customer identifier
  spuInstallationKey?: string; // For SPU integration
}
```

### HTTP Client Setup

```typescript
// apps/frontend/packages/shared/src/pms/sikka.service.ts
this.client = axios.create({
  baseURL: 'https://api.sikkasoft.com/v4',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Request-Key': this.requestKey, // Simple header auth
  },
});
```

## Database Schema

```sql
-- PMS Integration with Sikka v4 credentials
CREATE TABLE pms_integrations (
  credentials JSONB NOT NULL, -- { "requestKey": "...", "practiceKey": "..." }
  practice_key VARCHAR(255),          -- For quick lookup
  master_customer_id VARCHAR(255),    -- For quick lookup
  spu_installation_key TEXT,          -- For SPU integration
  ...
);
```

## Testing

### Fetch Current State

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
node scripts/fetch-sikka-current-state.js
```

This will:
1. Fetch recent patients
2. Fetch recent appointments (next 7 days)
3. Search for "Smith" to test search

### Expected Output

```
🏥 Sikka API - Current State Check

Credentials:
   Request Key: 70a2c702705ad41c395f8bd639fa7f85
   Practice Key: 84A9439BD3627374VGUV
   Master Customer ID: D36225

════════════════════════════════════════════════════════════

👥 Fetching recent patients...
📊 Patients Found: 0 (empty test account)

📅 Fetching recent appointments...
📊 Appointments Found: 0 (empty test account)

✅ Current state captured!
```

## Differences from OAuth v1 API

| Feature | v1 (OAuth) | v4 (Request-Key) |
|---------|-----------|------------------|
| Base URL | `/api/v1/` | `/v4/` |
| Auth Method | OAuth 2.0 Client Credentials | Header-based |
| Token Refresh | Every ~3600s | Never (static key) |
| Headers | `Authorization: Bearer {token}` | `Request-Key: {key}` |
| Complexity | High | Low |

## Advantages of v4

1. **Simpler**: No OAuth flow, no token refresh
2. **More Reliable**: No token expiry issues
3. **Faster**: No auth request before each operation
4. **Production-Ready**: Static keys work in all environments

## Migration Notes

If migrating from v1 to v4:

1. Update `baseURL` from `/api/v1` to `/v4`
2. Replace OAuth credentials with `requestKey`
3. Remove token refresh logic
4. Update all endpoint URLs (no `/api/` prefix)
5. Test all operations against v4 endpoints

## Security Considerations

- Store `requestKey` encrypted in database
- Never expose in client-side code or logs
- Rotate keys periodically
- Use separate keys for dev/staging/production
- Monitor API usage for anomalies

## Next Steps

1. ✅ Update `SikkaPmsService` to use v4 API
2. ✅ Update seed data with Request-Key credentials
3. ✅ Test patients/appointments endpoints
4. ⏳ Add remaining endpoints (notes, insurance, payments)
5. ⏳ Test end-to-end with Vapi call
6. ⏳ Production deployment with real Sikka credentials
