# Sikka OAuth Integration - Complete Flow

## Overview

Sikka uses a standard OAuth 2.0-style flow to authorize practices and obtain credentials.

## Step-by-Step Flow

### Step 1: User Installs SPU
**Location:** Practice's on-premise server  
**Action:** User receives email with SPU installation instructions  
**User does:**
1. Downloads SPU installer
2. Installs on practice server
3. Configures with their PMS credentials
4. SPU connects their PMS (Dentrix/Eaglesoft/etc.) to Sikka cloud

---

### Step 2: User Authorizes Parlae (OAuth)
**Location:** Parlae frontend setup wizard  
**URL:** `https://api.sikkasoft.com/portal/authapp.aspx`

**Frontend redirects user to Sikka OAuth:**
```
https://api.sikkasoft.com/portal/authapp.aspx
  ?app_id=b0cac8c638d52c92f9c0312159fc4518
  &redirect_uri=https://app.parlae.ca/agent/setup/pms/callback
  &state={accountId_timestamp_nonce}
```

**User sees:** Sikka authorization page with:
- Practice name
- PMS type
- "Allow Parlae to access your practice data" button

---

### Step 3: Sikka Redirects Back with Code
**Location:** Backend OAuth callback endpoint  
**URL:** `https://app.parlae.ca/agent/setup/pms/callback?code={auth_code}&state={state}`

**Backend receives:**
```
GET /agent/setup/pms/callback
  ?code=abc123xyz789
  &state=account_abc123_1738123456_x7y8z9
```

---

### Step 4: Exchange Code for Request Key
**Location:** Backend  
**API:** `POST https://api.sikkasoft.com/v4/request_key`

**Request:**
```json
{
  "grant_type": "authorization_code",
  "code": "abc123xyz789",
  "app_id": "b0cac8c638d52c92f9c0312159fc4518",
  "app_key": "7beec2a9e62bd692eab2e0840b8bb2db"
}
```

**Response:**
```json
{
  "request_key": "70a2c702705ad41c395f8bd639fa7f85",
  "refresh_key": "yyyy-yyyy-yyyy-yyyy",
  "expires_in": 85603,
  "token_type": "Bearer"
}
```

---

### Step 5: Get Practice Credentials
**Location:** Backend  
**API:** `GET https://api.sikkasoft.com/v4/authorized_practices`

**Request:**
```bash
GET https://api.sikkasoft.com/v4/authorized_practices
Headers:
  Request-Key: 70a2c702705ad41c395f8bd639fa7f85
```

**Response:**
```json
{
  "items": [
    {
      "office_id": "D36225",
      "practice_id": "1-1",
      "secret_key": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
      "practice_name": "Happy Dental Clinic",
      "pms_type": "Dentrix"
    }
  ]
}
```

---

### Step 6: Store in AWS Secrets Manager
**Location:** Backend  
**Service:** AWS Secrets Manager

**Secret Name:** `parlae/pms/sikka/{accountId}`

**Secret Value:**
```json
{
  "officeId": "D36225",
  "secretKey": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
  "requestKey": "70a2c702705ad41c395f8bd639fa7f85",
  "refreshKey": "yyyy-yyyy-yyyy-yyyy",
  "tokenExpiry": "2026-02-11T04:00:28Z",
  "practiceName": "Happy Dental Clinic",
  "practiceId": "1-1",
  "pmsType": "Dentrix"
}
```

---

### Step 7: Save Integration Record
**Location:** Backend  
**Database:** PostgreSQL

**Table:** `pms_integrations`
```json
{
  "accountId": "account_abc123",
  "provider": "SIKKA",
  "status": "ACTIVE",
  "metadata": {
    "secretArn": "arn:aws:secretsmanager:...",
    "practiceName": "Happy Dental Clinic",
    "pmsType": "Dentrix"
  }
}
```

---

### Step 8: Redirect User Back to Frontend
**Location:** Backend → Frontend  
**URL:** `https://app.parlae.ca/agent/setup/pms?status=success`

**Frontend shows:** ✅ "Successfully connected to Happy Dental Clinic (Dentrix)"

---

## Implementation Files

### Frontend
- `/app/home/(user)/agent/setup/pms/page.tsx` - PMS setup wizard
- `/app/home/(user)/agent/setup/pms/callback/page.tsx` - OAuth callback handler

### Backend
- `/src/pms/pms.controller.ts` - OAuth callback endpoint
- `/src/pms/pms.service.ts` - OAuth exchange logic
- `/src/common/services/secrets.service.ts` - Secrets Manager integration

---

## Security Considerations

### State Parameter
```typescript
const state = {
  accountId: user.accountId,
  timestamp: Date.now(),
  nonce: randomBytes(16).toString('hex')
};
const stateString = btoa(JSON.stringify(state));
```

**Verify on callback:**
- State matches what we sent
- Timestamp is recent (< 10 minutes)
- Nonce hasn't been used before

### HTTPS Only
- All OAuth redirects must use HTTPS
- Development: Use ngrok or similar for local testing

### Secrets Storage
- Never log `secret_key` or `request_key`
- Store in AWS Secrets Manager immediately
- Database only stores ARN reference

---

## Environment Variables Required

### Backend
```bash
SIKKA_APP_ID=b0cac8c638d52c92f9c0312159fc4518
SIKKA_APP_KEY=7beec2a9e62bd692eab2e0840b8bb2db
SIKKA_REDIRECT_URI=https://app.parlae.ca/agent/setup/pms/callback
SIKKA_OAUTH_URL=https://api.sikkasoft.com/portal/authapp.aspx
```

### Frontend
```bash
NEXT_PUBLIC_SIKKA_OAUTH_URL=https://api.sikkasoft.com/portal/authapp.aspx
NEXT_PUBLIC_SIKKA_APP_ID=b0cac8c638d52c92f9c0312159fc4518
NEXT_PUBLIC_SIKKA_REDIRECT_URI=https://app.parlae.ca/agent/setup/pms/callback
```

---

## Error Handling

### User Cancels Authorization
**Sikka redirects:** `redirect_uri?error=access_denied&state={state}`  
**Frontend shows:** "Authorization cancelled. You can try again anytime."

### Invalid Code
**API returns:** `400 Bad Request`  
**Frontend shows:** "Authorization failed. Please try again or contact support."

### Practice Already Connected
**Backend checks:** Existing integration for this `office_id`  
**Frontend shows:** "This practice is already connected to another account."

---

## Testing

### Local Development
Use ngrok to test OAuth callback:
```bash
ngrok http 3000
# Use ngrok URL as redirect_uri in Sikka developer portal
```

### Sikka Sandbox
Request sandbox credentials from Sikka:
- Sandbox app_id and app_key
- Test practice with SPU installed
- Test OAuth flow end-to-end

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User installs SPU on practice server                         │
│    - Downloads from email                                        │
│    - Installs on Windows/Mac server                             │
│    - Connects to PMS (Dentrix, Eaglesoft, etc.)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. User clicks "Connect PMS" in Parlae setup wizard             │
│    Frontend: /agent/setup/pms                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Frontend redirects to Sikka OAuth                            │
│    https://api.sikkasoft.com/portal/authapp.aspx                │
│    ?app_id=xxx&redirect_uri=yyy&state=zzz                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. User sees Sikka authorization page                           │
│    - Practice: Happy Dental Clinic                              │
│    - PMS: Dentrix                                               │
│    - [Allow] button                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Sikka redirects to callback with code                        │
│    https://app.parlae.ca/agent/setup/pms/callback               │
│    ?code=abc123&state=zzz                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Backend exchanges code for request_key                       │
│    POST https://api.sikkasoft.com/v4/request_key                │
│    Body: { grant_type, code, app_id, app_key }                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Backend gets practice credentials                            │
│    GET https://api.sikkasoft.com/v4/authorized_practices        │
│    Headers: { Request-Key: xxx }                                │
│    → Returns: office_id, secret_key, practice_name             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Backend stores in AWS Secrets Manager                        │
│    Secret: parlae/pms/sikka/{accountId}                         │
│    Value: { officeId, secretKey, requestKey, ... }             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Backend saves integration record in DB                       │
│    pms_integrations table                                       │
│    Status: ACTIVE                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Backend redirects to frontend success page                  │
│     https://app.parlae.ca/agent/setup/pms?status=success        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 11. Frontend shows success message                              │
│     ✅ Connected to Happy Dental Clinic (Dentrix)               │
│     [Continue to next step] →                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Implementation Steps

1. ✅ Add frontend OAuth redirect page
2. ✅ Add backend OAuth callback endpoint
3. ✅ Implement code exchange logic
4. ✅ Implement authorized_practices fetch
5. ✅ Update setup wizard UI
6. ✅ Add error handling
7. ⏳ Test with Sikka sandbox

Ready to implement! 🚀
