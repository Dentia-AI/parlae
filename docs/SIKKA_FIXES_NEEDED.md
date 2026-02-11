# Sikka API - What We Need to Fix

## Current Implementation Issues

### ❌ Issue 1: Missing Token Refresh Logic

**What we have:**
- Using static `Request-Key` that expires in 24 hours
- No automatic renewal
- Manual key rotation required

**What we need:**
1. Call `/authorized_practices` to get `office_id` and `secret_key`
2. Call `POST /request_key` with `grant_type: request_key` to get initial `request_key` + `refresh_key`
3. Store both keys in database
4. Automatically call `POST /request_key` with `grant_type: refresh_key` every 23 hours
5. Update stored keys with new ones

### ❌ Issue 2: Writeback Operations are Synchronous

**What we have:**
- `POST /appointments` returns immediately
- Assuming operation completed
- No status tracking

**What we need:**
- Submit writeback → Get `id`
- Poll `GET /writebacks?id={id}` to check status
- Wait for `result: "completed"` before confirming to user
- Handle `result: "failed"` errors

### ❌ Issue 3: Wrong Endpoints for Some Operations

**Current:**
```typescript
POST /appointments  // ❌ Wrong
PATCH /appointments/{id}  // ❌ Wrong
```

**Correct:**
```typescript
POST /appointment  // ✅ Correct (singular)
PATCH /appointments/{appointment_sr_no}  // ✅ Correct (with sr_no)
```

---

## Implementation Plan

### Phase 1: Authorization Flow ✅ TO DO

1. **Add new endpoint: `POST /v4/request_key`**
   - Accept `grant_type: request_key` or `refresh_key`
   - Store `refresh_key` in database
   
2. **Add new endpoint: `GET /v4/authorized_practices`**
   - Fetch on first setup
   - Store `office_id` and `secret_key`

3. **Implement token refresh service**
   ```typescript
   class SikkaTokenRefreshService {
     async refreshToken(pmsIntegrationId: string): Promise<void> {
       // Get current refresh_key from DB
       // POST /v4/request_key with grant_type: refresh_key
       // Update database with new request_key and refresh_key
       // Update tokenExpiry
     }
     
     async scheduleRefresh(): void {
       // Run every 23 hours
       // Refresh all active Sikka integrations
     }
   }
   ```

4. **Update database schema**
   ```prisma
   model PmsIntegration {
     requestKey      String?  // Current request_key
     refreshKey      String?  // Refresh token
     tokenExpiry     DateTime? // When request_key expires
     officeId        String?  // From authorized_practices
     secretKey       String?  // From authorized_practices
   }
   ```

### Phase 2: Writeback Status Tracking ✅ TO DO

1. **Add writeback status table**
   ```prisma
   model PmsWriteback {
     id              String   @id
     pmsIntegrationId String
     operation       String   // "book_appointment", "create_patient", etc.
     requestBody     Json
     result          String   // "pending", "completed", "failed"
     errorMessage    String?
     submittedAt     DateTime
     completedAt     DateTime?
     
     pmsIntegration  PmsIntegration @relation(...)
   }
   ```

2. **Update writeback operations**
   ```typescript
   async bookAppointment(data: AppointmentCreateInput): Promise<PmsApiResponse<Appointment>> {
     // 1. Submit writeback
     const response = await this.client.post('/appointment', payload);
     const writebackId = response.data.id;
     
     // 2. Store in database
     await prisma.pmsWriteback.create({
       data: {
         id: writebackId,
         operation: 'book_appointment',
         result: 'pending',
         requestBody: payload
       }
     });
     
     // 3. Poll status
     const status = await this.pollWritebackStatus(writebackId);
     
     // 4. Return result
     if (status.result === 'completed') {
       return this.createSuccessResponse({ id: writebackId, ...data });
     } else {
       return this.createErrorResponse('WRITEBACK_FAILED', status.error_message);
     }
   }
   
   private async pollWritebackStatus(id: string, maxAttempts = 10): Promise<WritebackStatus> {
     for (let i = 0; i < maxAttempts; i++) {
       const response = await axios.get(
         `https://api.sikkasoft.com/v4/writebacks?id=${id}`,
         {
           headers: {
             'App-Id': this.appId,
             'App-Key': this.appKey
           }
         }
       );
       
       const status = response.data.items[0];
       
       if (status.result !== 'pending') {
         // Update database
         await prisma.pmsWriteback.update({
           where: { id },
           data: {
             result: status.result,
             errorMessage: status.error_message,
             completedAt: new Date()
           }
         });
         
         return status;
       }
       
       // Wait 2 seconds before next poll
       await new Promise(resolve => setTimeout(resolve, 2000));
     }
     
     throw new Error('Writeback timeout');
   }
   ```

### Phase 3: Fix Endpoint URLs ✅ TO DO

| Current (Wrong) | Correct | Notes |
|----------------|---------|-------|
| `POST /appointments` | `POST /appointment` | Singular |
| `POST /patients` | `POST /patient` | Singular |
| `PATCH /appointments/{id}` | `PATCH /appointments/{appointment_sr_no}` | Param name |
| `PATCH /patients/{id}` | `PATCH /patient/{patient_id}` | Param name |

---

## Testing Plan

### Test 1: Authorization Flow

```bash
# 1. Get authorized practices
curl https://api.sikkasoft.com/v4/authorized_practices \
  -H "Request-Key: 70a2c702705ad41c395f8bd639fa7f85"

# Expected: office_id, secret_key in response

# 2. Generate request_key
curl -X POST https://api.sikkasoft.com/v4/request_key \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "request_key",
    "office_id": "D36225",
    "secret_key": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
    "app_id": "b0cac8c638d52c92f9c0312159fc4518",
    "app_key": "7beec2a9e62bd692eab2e0840b8bb2db"
  }'

# Expected: request_key, refresh_key, expires_in

# 3. Refresh token
curl -X POST https://api.sikkasoft.com/v4/request_key \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_key",
    "refresh_key": "yyyy-yyyy-yyyy",
    "app_id": "b0cac8c638d52c92f9c0312159fc4518",
    "app_key": "7beec2a9e62bd692eab2e0840b8bb2db"
  }'

# Expected: new request_key, new refresh_key
```

### Test 2: Writeback Operations

```bash
# 1. Book appointment
curl -X POST https://api.sikkasoft.com/v4/appointment \
  -H "Request-Key: ..." \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: { "id": "12345678", "result": "pending" }

# 2. Check status
curl https://api.sikkasoft.com/v4/writebacks?id=12345678 \
  -H "App-Id: ..." \
  -H "App-Key: ..."

# Expected: { "result": "pending" | "completed" | "failed" }
```

---

## Priority Order

1. **HIGH**: Authorization flow (without this, keys expire every 24h)
2. **HIGH**: Fix endpoint URLs (currently wrong)
3. **MEDIUM**: Writeback status tracking (for reliability)
4. **LOW**: Background job for token refresh
5. **LOW**: Writeback status dashboard

---

## Next Steps

1. ✅ Complete documentation reviewed
2. ⏳ Update `SikkaPmsService` with token refresh
3. ⏳ Add writeback status tracking
4. ⏳ Fix endpoint URLs
5. ⏳ Test end-to-end with real Sikka API
6. ⏳ Deploy to production

---

## Questions to Answer

1. **How often should we poll writeback status?**
   - Recommendation: Every 2 seconds, max 10 attempts (20 seconds total)

2. **What if writeback times out?**
   - Return error to user
   - Keep polling in background
   - Notify when completed/failed

3. **Should we auto-retry failed writebacks?**
   - No - user should manually retry
   - Log failure reason for debugging

4. **How to handle expired refresh_key?**
   - User must re-authorize via Sikka marketplace
   - Send notification to user
   - Disable PMS integration until re-authorized
