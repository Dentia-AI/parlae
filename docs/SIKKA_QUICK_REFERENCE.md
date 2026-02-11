# Sikka API - Quick Reference Card

**Last Updated**: February 7, 2026

---

## 🔐 Authentication

### Initial Setup (One Time):
```bash
App-Id: b0cac8c638d52c92f9c0312159fc4518
App-Key: 7beec2a9e62bd692eab2e0840b8bb2db
```

### Authorization Flow:
```
1. GET /authorized_practices
   Headers: App-Id, App-Key
   → office_id, secret_key

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

## 📊 Common Endpoints

### Appointments (READ):
```bash
GET /appointments?limit=50
GET /appointments/{id}
GET /appointments_available_slots?date=2026-02-15
```

### Patients (READ):
```bash
GET /patients/search?query=John
GET /patients/{id}
GET /patient_balance?patient_id=123
```

### Appointments (WRITE - Async):
```bash
POST /appointment          # Singular!
PATCH /appointments/{appointment_sr_no}
DELETE /appointments/{id}
```

### Patients (WRITE - Async):
```bash
POST /patient             # Singular!
PATCH /patient/{patient_id}
```

### Check Writeback Status:
```bash
GET /writebacks?id={writeback_id}
```

---

## 🔄 Response Format

### List Response:
```json
{
  "items": [...],
  "total_count": "87",
  "pagination": {
    "next": "https://...",
    "previous": ""
  }
}
```

### Writeback Response:
```json
{
  "id": "12345",
  "result": "pending",
  "api_name": "/appointment",
  "method": "POST"
}
```

### Writeback Status:
```json
{
  "items": [{
    "id": "12345",
    "result": "completed",  // or "failed"
    "error_message": null,
    "completed_time": "2026-02-07 15:30:00"
  }]
}
```

---

## 🛠️ Background Jobs

### Token Refresh (Every 23 hours):
```bash
node -e "require('./dist/pms/sikka-token-refresh.service').refreshAllSikkaTokens()"
```

### Writeback Polling (Every 10 seconds - rate-limited):
```bash
node dist/pms/sikka-writeback-poll-worker.js
```

### Low-Traffic Retry (2 AM daily):
```bash
node -e "require('./dist/pms/sikka-writeback.service').retrySikkaWritebacks()"
```

---

## 🚦 Rate Limiting

**Limit**: 200 API requests per practice per **MINUTE** (12,000/hour)

**Strategy**:
- 50 requests reserved for actual operations (bookings, updates)
- 150 requests for status checks
- 10-second initial delay before first check
- Exponential backoff: 10s, 10s, 20s, 30s, 1m, 2m, 5m, 10m, 30m
- Polling every 10 seconds
- Average confirmation: **20-30 seconds** 🚀

---

## 🧪 Testing Commands

### Test Authorization Flow:
```bash
node scripts/test-sikka-auth-flow.js
```

### Test Writeback Operations:
```bash
node scripts/test-sikka-writebacks.js
```

### Fetch Current State:
```bash
node scripts/fetch-sikka-current-state.js
```

---

## 💾 Database Queries

### Check Token Status:
```sql
SELECT id, office_id, token_expiry, 
       EXTRACT(EPOCH FROM (token_expiry - NOW())) / 3600 AS hours_remaining
FROM pms_integrations 
WHERE provider = 'SIKKA' AND status = 'ACTIVE';
```

### Check Pending Writebacks:
```sql
SELECT id, operation, result, check_count,
       NOW() - submitted_at AS pending_duration
FROM pms_writebacks 
WHERE result = 'pending';
```

### Writeback Stats:
```sql
SELECT 
  operation,
  COUNT(*) as total,
  SUM(CASE WHEN result = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - submitted_at))), 2) as avg_duration_sec
FROM pms_writebacks 
WHERE submitted_at > NOW() - INTERVAL '24 hours'
GROUP BY operation;
```

---

## 🚨 Common Issues

### 401 Unauthorized:
```
Cause: Token expired
Fix: Run token refresh job
```

### 400 Bad Request:
```
Cause: Invalid payload or endpoint
Fix: Check API docs for correct format
```

### Writeback Stuck in Pending:
```
Cause: SPU offline, PMS locked, or rate limit reached
Fix: Automatic retry with exponential backoff
Timeline: First check at 10s, then 10s, 20s, 30s, 1m... up to 6h
Average: Confirmed within 20-30 seconds
```

### Rate Limit Exceeded:
```
Cause: >150 status checks in 1 minute
Fix: Automatic - skips checks until next minute
Note: Actual API operations (bookings) use separate quota (50)
Recovery: <1 minute (window resets)
```

---

## 📞 Support

**Sikka API Support**: support@sikkasoft.com  
**API Docs**: https://apidocs.sikkasoft.com  
**Internal Docs**: /docs/SIKKA_*.md

---

## ⚡ Quick Start Checklist

- [ ] Set SIKKA_APP_ID and SIKKA_APP_KEY env vars
- [ ] Run `npx prisma migrate deploy`
- [ ] Run token refresh job to verify connection
- [ ] Start writeback polling service
- [ ] Test with `node scripts/test-sikka-auth-flow.js`
- [ ] Set up monitoring and alerts

---

**Rate Limit**: 200 req/**minute** per practice (12,000/hour)  
**Safe Limit**: 150 req/minute (reserves 50 for operations)  
**Tokens expire in**: 24 hours  
**Refresh interval**: Every 23 hours  
**Writeback polling**: Every 10 seconds 🚀  
**Initial check delay**: 10 seconds  
**Average confirmation**: 20-30 seconds ⚡  
**Max check attempts**: 30 over ~6 hours  
**Stuck timeout**: 6 hours
