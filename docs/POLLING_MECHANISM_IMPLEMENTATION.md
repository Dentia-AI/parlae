# PMS Connection Status Polling Mechanism

## Problem

When Sikka redirects back from OAuth authorization, it goes to the **backend** callback endpoint, not the frontend. This means:

1. ❌ Backend cannot directly communicate with frontend in real-time
2. ❌ Frontend doesn't know when OAuth callback completes
3. ❌ Frontend can't show success/error status immediately

## Solution: Polling-Based Status Check

Frontend polls the backend `/api/pms/connection-status` endpoint until connection is complete.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User clicks "Connect via Sikka" in frontend              │
│    → Frontend redirects to Sikka OAuth                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. User authorizes on Sikka portal                          │
│    → Sikka redirects to BACKEND callback                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Backend receives callback                                │
│    → Exchanges code for credentials                         │
│    → Stores in AWS Secrets Manager                          │
│    → Saves integration in DB with status='ACTIVE'           │
│    → Redirects to frontend with status=connecting           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Frontend detects status=connecting                       │
│    → Starts polling /api/pms/connection-status (1s interval)│
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Backend returns connection status                        │
│    ✅ { isConnected: true, status: 'connected', ... }       │
│    OR                                                        │
│    ❌ { isConnected: false, status: 'failed', error: ... }  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Frontend receives status                                 │
│    → Shows success message                                  │
│    → Stops polling                                          │
│    → Enables "Continue" button                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Backend Endpoint

**`GET /api/pms/connection-status`**

Returns current connection status for the authenticated user:

```typescript
{
  isConnected: boolean;         // true if connected
  status: 'pending' | 'connecting' | 'connected' | 'failed';
  provider?: 'SIKKA';
  practiceName?: string;        // e.g., "Happy Dental Clinic"
  pmsType?: string;             // e.g., "Dentrix"
  error?: string;               // Error message if failed
  timestamp: string;            // ISO timestamp
}
```

**Example Responses:**

**Before connection:**
```json
{
  "isConnected": false,
  "status": "pending",
  "timestamp": "2026-02-11T13:30:00Z"
}
```

**During OAuth callback (backend processing):**
```json
{
  "isConnected": false,
  "status": "connecting",
  "provider": "SIKKA",
  "timestamp": "2026-02-11T13:30:05Z"
}
```

**After successful connection:**
```json
{
  "isConnected": true,
  "status": "connected",
  "provider": "SIKKA",
  "practiceName": "Happy Dental Clinic",
  "pmsType": "Dentrix",
  "timestamp": "2026-02-11T13:30:08Z"
}
```

**If connection failed:**
```json
{
  "isConnected": false,
  "status": "failed",
  "provider": "SIKKA",
  "error": "Failed to exchange authorization code",
  "timestamp": "2026-02-11T13:30:08Z"
}
```

---

### Frontend Polling Logic

**When to start polling:**
- URL contains `?status=connecting`

**Polling configuration:**
- Interval: 1 second
- Max duration: 60 seconds (60 polls)
- Stop conditions:
  - `isConnected === true` → Success!
  - `status === 'failed'` → Error!
  - Timeout (60 seconds) → Error!

**Code snippet:**
```typescript
useEffect(() => {
  if (status === 'connecting' && accountId) {
    let pollInterval: NodeJS.Timeout;
    let pollCount = 0;
    const maxPolls = 60; // 60 seconds max

    const checkStatus = async () => {
      const response = await fetch('/api/pms/connection-status');
      const data = await response.json();
      
      setConnectionStatus(data);
      
      if (data.isConnected) {
        clearInterval(pollInterval);
        toast.success(`Connected to ${data.practiceName}`);
      } else if (data.status === 'failed') {
        clearInterval(pollInterval);
        toast.error(data.error);
      }
      
      pollCount++;
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        toast.error('Connection timeout');
      }
    };

    pollInterval = setInterval(checkStatus, 1000);
    checkStatus(); // Immediate first check

    return () => clearInterval(pollInterval);
  }
}, [status, accountId]);
```

---

### Backend OAuth Callback Changes

**Before (WRONG):**
```typescript
// Backend redirects with full details
return {
  redirect: `${APP_BASE_URL}/agent/setup/pms?status=success&practice=${practice.name}`
};
```
**Problem:** Frontend gets details immediately, but OAuth callback might not be complete yet.

**After (CORRECT):**
```typescript
// Backend redirects with connecting status
return {
  redirect: `${APP_BASE_URL}/agent/setup/pms?status=connecting`
};

// Frontend polls /api/pms/connection-status to get details
```
**Benefit:** Frontend knows to start polling, backend has time to complete processing.

---

## Database Schema

The `pms_integrations` table stores the connection status:

```sql
pms_integrations:
  id: uuid
  accountId: string               -- Links to user's account
  provider: 'SIKKA'
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR'
  metadata: {
    practiceName: string
    actualPmsType: string         -- "Dentrix", "Eaglesoft", etc.
    secretArn: string             -- AWS Secrets Manager ARN
  }
  lastError: string?              -- Error message if failed
  officeId: string
  requestKey: string
  refreshKey: string
  tokenExpiry: timestamp
```

**Status mapping:**
- `status='ACTIVE'` → `isConnected=true, status='connected'`
- `status='ERROR'` → `isConnected=false, status='failed'`
- `status='INACTIVE'` → `isConnected=false, status='pending'`
- No record → `isConnected=false, status='pending'`

---

## User Experience

### What User Sees

**Step 1: Initial Page**
```
┌─────────────────────────────────────┐
│ Connect Your Practice               │
│                                     │
│ [ Connect via Sikka ]               │
└─────────────────────────────────────┘
```

**Step 2: Redirected to Sikka**
```
┌─────────────────────────────────────┐
│ Sikka - Authorize Parlae            │
│                                     │
│ Practice: Happy Dental Clinic       │
│ [ Allow ]                           │
└─────────────────────────────────────┘
```

**Step 3: Redirected back to Parlae (Connecting)**
```
┌─────────────────────────────────────┐
│ Connect Your Practice               │
│                                     │
│ 🔄 Connecting to your practice...  │
│                                     │
│ [ Connecting... ]  (disabled)       │
└─────────────────────────────────────┘
```

**Step 4: Connection Complete (2-3 seconds later)**
```
┌─────────────────────────────────────┐
│ Connect Your Practice               │
│                                     │
│ ✅ Successfully connected to        │
│    Happy Dental Clinic (Dentrix)   │
│                                     │
│ [ Continue to Review → ]            │
└─────────────────────────────────────┘
```

---

## Benefits of This Approach

### ✅ Advantages

1. **Real-time status updates** - Frontend knows immediately when connection completes
2. **Better UX** - Shows loading state during OAuth callback processing
3. **Error handling** - Can show specific error messages from backend
4. **Timeout protection** - Stops polling after 60 seconds if something goes wrong
5. **No WebSocket needed** - Simple HTTP polling, works everywhere
6. **Scalable** - Backend can take time to process without frontend timing out

### ⚠️ Considerations

1. **Polling overhead** - Makes 60 requests max (but stops early on success)
2. **Not real-time** - 1 second delay between checks
3. **Client-side logic** - Frontend needs to handle polling

### 🔄 Alternative Approaches (Not Implemented)

**WebSocket / Server-Sent Events:**
- More real-time
- More complex infrastructure
- Requires persistent connections

**Long Polling:**
- Backend waits until status changes
- Single request, but ties up backend thread

**Redirect with Token:**
- Backend generates temporary token
- Frontend verifies token
- More complex, requires token storage

---

## Testing

### Manual Test Flow

1. **Start with clean state:**
   ```bash
   # Delete any existing integrations
   psql $DATABASE_URL -c "DELETE FROM pms_integrations WHERE provider='SIKKA';"
   ```

2. **Navigate to PMS setup:**
   ```
   http://localhost:3000/home/agent/setup/pms
   ```

3. **Click "Connect via Sikka":**
   - Should redirect to Sikka OAuth
   - URL should include state parameter

4. **Click "Allow" on Sikka:**
   - Redirects to backend callback
   - Backend processes and redirects to frontend with `?status=connecting`

5. **Frontend should:**
   - Show "Connecting..." message
   - Start polling every 1 second
   - Console should show poll requests

6. **After 2-3 seconds:**
   - Frontend receives `isConnected=true`
   - Shows success message with practice name
   - Stops polling
   - Enables "Continue" button

### Testing Error Cases

**Test timeout:**
```typescript
// In backend, add artificial delay
await new Promise(resolve => setTimeout(resolve, 65000)); // 65 seconds
```
Frontend should show timeout error after 60 seconds.

**Test OAuth failure:**
- Click "Deny" on Sikka
- Should redirect with `?error=access_denied`
- Should NOT start polling

**Test backend error:**
```typescript
// In backend, throw error during callback
throw new Error('Test error');
```
- Backend saves error to database
- Frontend polls and gets `status='failed'`
- Shows error message

---

## Monitoring

### Backend Logs

```
[PmsService] Processing Sikka OAuth callback for account abc123
[PmsService] Received request_key, expires in 86400 seconds
[PmsService] Found practice: Happy Dental Clinic (Dentrix)
[PmsService] Stored credentials in Secrets Manager: arn:aws:...
[PmsService] PMS integration saved for account abc123
```

### Frontend Console

```
Polling connection status... (attempt 1/60)
Status: { isConnected: false, status: 'connecting' }
Polling connection status... (attempt 2/60)
Status: { isConnected: false, status: 'connecting' }
Polling connection status... (attempt 3/60)
Status: { isConnected: true, status: 'connected', practiceName: 'Happy Dental Clinic' }
✅ Successfully connected to Happy Dental Clinic
Stopped polling (success)
```

---

## Security Considerations

### Rate Limiting

Current polling (60 requests over 60 seconds) is acceptable, but consider:

**Option 1: Exponential backoff**
```typescript
// Start: 1s, then 2s, then 4s, then 8s, etc.
const delay = Math.min(1000 * Math.pow(2, pollCount), 10000);
```

**Option 2: Backend rate limiting**
```typescript
// Limit to 100 requests per minute per user
@Throttle(100, 60)
@Get('connection-status')
```

### Authentication

Status endpoint requires authentication:
```typescript
@UseGuards(CognitoAuthGuard)
```

User can only check their own connection status (via JWT).

---

## Performance

### Backend Load

- **1 user connecting**: 60 requests over 60 seconds = 1 req/sec
- **100 users connecting**: 6000 requests over 60 seconds = 100 req/sec
- **Cached query**: Database query is fast (indexed on accountId)

### Database Query Optimization

```sql
-- Index on accountId for fast lookup
CREATE INDEX idx_pms_integrations_account_id ON pms_integrations(accountId);

-- Typical query:
SELECT * FROM pms_integrations 
WHERE accountId = 'abc123' AND provider = 'SIKKA'
LIMIT 1;

-- Query time: <1ms
```

---

## Summary

**Implementation:**
- ✅ Backend endpoint: `GET /api/pms/connection-status`
- ✅ Frontend polling: Every 1 second for max 60 seconds
- ✅ Database status: `pms_integrations.status`
- ✅ Error handling: Saves errors to database
- ✅ Timeout protection: Stops after 60 seconds

**User Experience:**
1. Click "Connect via Sikka"
2. Authorize on Sikka portal
3. See "Connecting..." message (2-3 seconds)
4. See "Successfully connected to [Practice Name]"
5. Click "Continue to Review"

**Ready for production!** 🚀
