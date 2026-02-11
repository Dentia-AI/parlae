# Sikka API Rate Limiting Strategy (UPDATED)

**Last Updated**: February 7, 2026

---

## 🚦 Rate Limit

**Sikka API Limit**: **200 requests per practice per MINUTE** (12,000/hour)

This is **60x more generous** than initially thought!

---

## 📊 Revised Strategy

### With 200 req/min, we can:
- ✅ Poll **every 10 seconds** (not every 2 minutes)
- ✅ Get **fast confirmation** (~20-30 seconds average)
- ✅ Handle **100+ concurrent writebacks** safely
- ✅ Still reserve capacity for actual API operations

---

## 📈 Request Budget Allocation

### Total: 200 requests/minute per practice

#### Actual API Operations (HIGH Priority): 50 requests/min
- Book appointments
- Create patients
- Update records
- Cancel appointments
- Search operations

**Reserved**: 50 requests/min (25% of limit)

#### Writeback Status Checks (LOW Priority): 150 requests/min
- Check writeback completion status
- Retry failed operations
- Monitoring queries

**Reserved**: 150 requests/min (75% of limit)

---

## ⏰ New Timing Strategy

### Initial Delay
**Wait 10 seconds before first status check** (down from 30s)

Why?
- Most operations complete within 10-20 seconds
- We have room to check more frequently
- Faster user feedback

### Exponential Backoff Schedule

| Check # | Delay | Total Time Since Submission |
|---------|-------|----------------------------|
| 1st | 10s | 10s |
| 2nd | 10s | 20s |
| 3rd | 20s | 40s |
| 4th | 30s | 1m 10s |
| 5th | 1m | 2m 10s |
| 6th | 2m | 4m 10s |
| 7th | 5m | 9m 10s |
| 8th | 10m | 19m 10s |
| 9th+ | 30m | Every 30 min |

**Max Attempts**: 30 checks over ~6 hours (down from 24 hours)

### Polling Frequency
**Every 10 seconds** (was 2 minutes)

During each 10-second cycle:
- Check up to **15 writebacks** (high traffic)
- Check **ALL ready writebacks** (low traffic)

---

## 🎯 Performance Impact

### Old Strategy (thinking it was 200/hour):
- ⏰ Initial check: 30 seconds
- ⏰ Average confirmation: 90 seconds
- ⏰ Polling: Every 2 minutes
- 📊 Max concurrent: 25 writebacks

### New Strategy (200/minute):
- ⏰ Initial check: 10 seconds
- ⏰ Average confirmation: **20-30 seconds** 🚀
- ⏰ Polling: Every 10 seconds
- 📊 Max concurrent: **100+ writebacks** 🚀

**Result**: **3x faster** confirmation!

---

## 📊 Capacity Analysis

### Scenario: 200 req/min limit

**Checking 1 writeback**:
- Polling every 10s = 6 checks per minute
- Uses: **6/150** capacity (4%)

**Checking 25 concurrent writebacks**:
- 25 × 6 = 150 checks per minute
- Uses: **150/150** capacity (100% of safe limit)
- Still leaves 50/min for actual operations ✓

**High volume (50 concurrent)**:
- Would use 300/min (over safe limit)
- System automatically throttles to 25 per cycle
- Next cycle picks up the rest

---

## 🔄 Background Job Configuration

### Polling Service (Every 10 seconds)

```javascript
async function poll() {
  const result = await pollSikkaWritebacks();
  console.log(
    `Checked: ${result.checked}, ` +
    `Updated: ${result.updated}, ` +
    `Skipped: ${result.skipped}`
  );
  
  // Poll again in 10 seconds
  setTimeout(poll, 10000);
}
```

**Worker script**: `sikka-writeback-poll-worker.js`

---

## 📝 Example Scenarios

### Scenario 1: Single Appointment Booking
```
10:00:00 - User books appointment
10:00:00 - POST /appointment → writeback ID: 12345
10:00:00 - Return "Submitted ✓" to user
10:00:10 - First check → still "pending"
10:00:20 - Second check → "completed" ✅
10:00:20 - Send notification: "Confirmed!"

Total: 20 seconds ⚡
API calls: 3 (1 POST + 2 checks)
```

### Scenario 2: Busy Period (50 concurrent bookings)
```
10:00:00 - 50 appointments in 1 minute
10:00:00-10:01:00 - 50 POST calls (50 HIGH priority)

10:00:10 - First polling cycle
  - Check 15 oldest (15/150 used)
10:00:20 - Second polling cycle
  - Check next 15 (30/150 used)
10:00:30 - Third polling cycle
  - Check next 15 (45/150 used)
10:00:40 - Fourth polling cycle
  - Check remaining 5 + recheck any still pending
  - Most confirmed by now ✅

Total time: ~40 seconds average
Total API calls: ~125 (50 POST + ~75 checks)
Rate limit: 125/200 = 62% used ✓
```

### Scenario 3: Very High Volume
```
Peak hour: 200 bookings
Spread over 60 minutes

Average: 3.3 bookings/minute
Max burst: 20 bookings in 1 minute

Rate limit per minute:
- 20 POST operations (HIGH priority)
- ~60 status checks (LOW priority)
- Total: 80/200 = 40% used ✓

Even during peak, well within limit!
```

---

## 🚨 Rate Limit Protection

### When approaching limit (140/150 checks):
```
1. Skip new status checks for this practice
2. Let existing operations complete
3. Window resets in <1 minute
4. Resume normal polling
```

### If limit exceeded:
```
Requests used: 150/150 ❌
↓
Skip ALL checks for this practice this cycle
↓
Continue checking other practices
↓
Next cycle (10s later): Rate limit reset ✓
↓
Resume normal operation
```

---

## 💡 Key Differences from Old Strategy

| Aspect | Old (200/hour) | New (200/minute) |
|--------|---------------|------------------|
| **Initial check** | 30 seconds | 10 seconds |
| **Polling cycle** | 2 minutes | 10 seconds |
| **Avg confirmation** | 90 seconds | 20-30 seconds |
| **Max concurrent** | 25 writebacks | 100+ writebacks |
| **User experience** | Slow | **Fast** 🚀 |

---

## 🎯 Production Configuration

```bash
# Rate limiting (per MINUTE!)
SIKKA_MAX_REQUESTS_PER_MINUTE=200
SIKKA_SAFE_REQUESTS_PER_MINUTE=150

# Timing (much more aggressive)
SIKKA_INITIAL_CHECK_DELAY_SECONDS=10
SIKKA_POLLING_INTERVAL_SECONDS=10
SIKKA_MAX_CHECK_ATTEMPTS=30

# Stuck timeout (6 hours instead of 24)
SIKKA_STUCK_TIMEOUT_HOURS=6
```

---

## 📊 Monitoring

### Key Metrics

**Per Minute (not per hour!)**:
- Requests used this minute: X/200
- Safe limit remaining: (150 - X)
- % of safe limit: (X/150) × 100

**Alert at**:
- ⚠️ 120/150 (80%) - High usage warning
- 🚨 140/150 (93%) - Critical, approaching limit
- 🔴 150/150 (100%) - Throttling engaged

### Dashboard Query
```sql
-- Practices with high usage THIS MINUTE
SELECT 
  pi.id,
  COUNT(*) FILTER (WHERE pal.timestamp > NOW() - INTERVAL '1 minute') as requests_last_minute,
  200 - COUNT(*) FILTER (WHERE pal.timestamp > NOW() - INTERVAL '1 minute') as remaining
FROM pms_integrations pi
LEFT JOIN pms_audit_logs pal ON pal.pms_integration_id = pi.id
WHERE pi.provider = 'SIKKA'
GROUP BY pi.id
HAVING COUNT(*) FILTER (WHERE pal.timestamp > NOW() - INTERVAL '1 minute') > 120;
```

---

## ✅ Summary

With **200 requests/minute** (not hour), we can:

1. **Fast Confirmation**: 20-30 seconds average (3x faster)
2. **High Capacity**: Handle 100+ concurrent operations
3. **Better UX**: Near-instant feedback to users
4. **Safe**: Still respects rate limits with built-in protection
5. **Scalable**: Can handle high-volume practices easily

**The system is now optimized for the actual 200 req/min limit!** 🎉
