# Sikka Writeback Flow with Rate Limiting

## Visual Timeline

```
User Books Appointment at 10:00:00 AM
│
├─ 10:00:00 - POST /appointment
│  └─ Response: { "id": "12345", "result": "pending" }
│  └─ API Calls Used: 1/200 (HIGH priority)
│  └─ User sees: "Appointment submitted ✓"
│
├─ 10:00:30 - [30s later] First status check SKIPPED
│  └─ Reason: Too early, wait 30s minimum
│
├─ 10:00:30 - First check eligible
│  └─ Rate limit check: 5/150 used ✓
│  └─ GET /writebacks?id=12345
│  └─ Response: { "result": "pending" }
│  └─ API Calls Used: 6/200 (LOW priority)
│  └─ Schedule next check: +1 minute
│
├─ 10:01:30 - [1m later] Second status check
│  └─ Rate limit check: 12/150 used ✓
│  └─ GET /writebacks?id=12345
│  └─ Response: { "result": "completed" } ✅
│  └─ API Calls Used: 13/200 (LOW priority)
│  └─ Update database: status = "completed"
│  └─ Send notification to user
│
└─ User receives: "Appointment confirmed for Feb 15 at 10:00 AM! ✓"

Total API Calls: 3 (1 booking + 2 status checks)
Total Time: 90 seconds
Result: SUCCESS
```

---

## High Traffic Scenario (10 concurrent bookings)

```
10:00:00 - 10 users book appointments simultaneously
│
├─ 10:00:00-10:00:10 - 10 × POST /appointment
│  └─ API Calls Used: 10/200 (HIGH priority)
│  └─ All users see: "Submitted ✓"
│
├─ 10:00:30 - All checks eligible (30s passed)
│  └─ Rate limit check: 15/150 used ✓
│  └─ HIGH TRAFFIC MODE: Check only 5 oldest
│  └─ GET /writebacks × 5
│  └─ API Calls Used: 20/200
│  └─ 3 completed, 2 still pending
│
├─ 10:01:30 - [1m later] Second round
│  └─ Rate limit check: 25/150 used ✓
│  └─ Check remaining 5 + 2 still pending
│  └─ GET /writebacks × 7
│  └─ API Calls Used: 27/200
│  └─ All completed ✅
│
└─ 10 notifications sent

Total API Calls: 27 (10 bookings + 17 status checks)
Total Time: 90 seconds
Rate Limit Used: 13.5% (well within limit)
Result: SUCCESS
```

---

## Rate Limit Protection Scenario

```
11:45:00 - Heavy usage throughout the hour
│
├─ API Calls Used: 145/150 (97% of safe limit)
│
├─ 11:45:00 - User books appointment
│  └─ HIGH priority request
│  └─ Uses full 200 limit (not 150)
│  └─ POST /appointment ✓
│  └─ API Calls Used: 146/200
│
├─ 11:45:30 - Status check eligible
│  └─ Rate limit check: 146/150 used ❌
│  └─ SKIP CHECK (would exceed safe limit)
│  └─ Log: "Rate limit protection - skipping check"
│
├─ 11:46:00 - Polling cycle
│  └─ Rate limit check: 148/150 used ❌
│  └─ SKIP ALL CHECKS for this practice
│
├─ 11:50:00 - Polling cycle
│  └─ Rate limit check: 149/150 used ❌
│  └─ SKIP ALL CHECKS
│
├─ 12:00:00 - New hour starts
│  └─ Rate limit resets: 0/150 ✓
│
├─ 12:00:00 - Polling cycle
│  └─ Rate limit check: 0/150 used ✓
│  └─ Check all pending writebacks
│  └─ GET /writebacks × 3
│  └─ All completed ✅
│
└─ Notifications sent (15 minutes delayed, but successful)

Result: Appointments booked successfully
Delay: 15 minutes for confirmation (acceptable)
Rate Limit: Never exceeded ✓
```

---

## Low Traffic Period Optimization

```
2:00 AM - Scheduled low-traffic retry job runs
│
├─ Check time: 2:00 AM ✓ (in low-traffic window)
│
├─ Find all pending writebacks
│  └─ 15 pending (some from yesterday)
│  └─ 3 failed (might have completed by now)
│
├─ Rate limit check: 0/200 used (fresh hour) ✓
│  └─ LOW TRAFFIC MODE: Check ALL
│
├─ 2:00:00 - Batch check all 18 writebacks
│  └─ GET /writebacks × 18
│  └─ API Calls Used: 18/200 (9%)
│  └─ Results:
│     - 12 completed ✅
│     - 3 still pending (SPU might be offline)
│     - 2 failed (PMS database locked)
│     - 1 not found (might have been manually cancelled)
│
├─ Update database
│  └─ 12 marked as "completed"
│  └─ 3 remain "pending" (will retry tomorrow)
│  └─ 2 remain "failed"
│
└─ Send 12 delayed notifications

Result: Caught up on delayed confirmations
Rate Limit Used: 9% (very safe)
Practice Impact: None (overnight hours)
```

---

## Exponential Backoff Visualization

```
Writeback Submitted: 10:00:00
│
├─ Check #1: 10:00:30 (+30s)   ──┐
│                                 │ Quick checks for fast ops
├─ Check #2: 10:01:30 (+1m)    ──┘
│
├─ Check #3: 10:03:30 (+2m)    ──┐
│                                 │ Moderate delay
├─ Check #4: 10:08:30 (+5m)    ──┘
│
├─ Check #5: 10:18:30 (+10m)   ──┐
│                                 │ Longer delay for stuck ops
├─ Check #6: 10:33:30 (+15m)   ──┘
│
├─ Check #7: 11:03:30 (+30m)   ──┐
│                                 │ Very long delay
├─ Check #8: 12:03:30 (+1h)    ──┘
│
├─ Check #9: 13:03:30 (+1h)
├─ Check #10: 14:03:30 (+1h)
│  ...
└─ Check #20: 24:03:30 (give up after 24h)

Total Checks: 20 max
Total API Calls: 20 per writeback (worst case)
Average Completion: Check #2 (within 90 seconds)
```

---

## API Call Budget Allocation

```
200 API Calls per Hour per Practice
│
├─ HIGH Priority (50 calls) - ACTUAL OPERATIONS
│  ├─ Book appointments (POST /appointment)
│  ├─ Create patients (POST /patient)
│  ├─ Update records (PATCH /appointments/...)
│  ├─ Cancel appointments (DELETE /appointments/...)
│  ├─ Search patients (GET /patients/search)
│  └─ Get availability (GET /appointments_available_slots)
│
└─ LOW Priority (150 calls) - STATUS CHECKS
   ├─ Check writeback status (GET /writebacks)
   ├─ Verify token status (GET /request_key_info)
   ├─ Monitor writebacks (GET /writebacks?startdate=...)
   └─ Retry failed operations

Typical Usage per Hour:
├─ 10-20 bookings/updates = 10-20 HIGH priority calls
├─ 30-60 status checks = 30-60 LOW priority calls
└─ Total: 40-80 calls (20-40% of limit) ✓
```

---

## Decision Tree

```
Should we check writeback status now?
│
├─ Has 30 seconds passed since submission?
│  ├─ NO → SKIP (too early)
│  └─ YES → Continue
│
├─ Has appropriate delay passed since last check?
│  │  (Based on check count: 30s, 1m, 2m, 5m...)
│  ├─ NO → SKIP (too soon)
│  └─ YES → Continue
│
├─ Have we exceeded max attempts (20)?
│  ├─ YES → SKIP (give up, mark as failed)
│  └─ NO → Continue
│
├─ Is practice below rate limit?
│  ├─ NO → SKIP (protect rate limit)
│  └─ YES → Continue
│
├─ Is this high traffic time (6am-midnight)?
│  ├─ YES → Limit to 5 checks per cycle
│  └─ NO → Check all eligible
│
└─ ✓ CHECK WRITEBACK STATUS
```

---

## Real-World Example: Busy Dental Practice

**Practice Profile**:
- 200 patients per day
- 20 staff members
- 8 AM - 6 PM operation
- 6 dentists

**Typical Day**:

```
8:00 AM - Practice opens
├─ Rate limit resets (new hour)
├─ Morning rush: 15 appointments booked (8:00-8:30)
└─ API Calls: 15 POST + ~30 status checks = 45 total (22%)

9:00 AM - Steady booking
├─ Rate limit resets
├─ 10 appointments booked
└─ API Calls: 10 POST + ~20 status checks = 30 total (15%)

10:00 AM - Peak time
├─ Rate limit resets
├─ 25 appointments booked (busiest hour)
├─ Some status checks delayed (rate limit protection)
└─ API Calls: 25 POST + ~50 status checks = 75 total (37%)

12:00 PM - Lunch lull
├─ Rate limit resets
├─ 5 appointments booked
├─ Catch up on delayed checks from 10 AM
└─ API Calls: 5 POST + ~80 status checks = 85 total (42%)

2:00 AM (next day) - Low traffic cleanup
├─ Retry any failed operations
├─ Confirm any stuck writebacks
└─ API Calls: ~10 checks = 10 total (5%)

Daily Summary:
├─ Total bookings: 80-100
├─ Peak usage: 85/200 calls (42%)
├─ Never exceeded limit ✓
├─ All appointments confirmed within 15 minutes ✓
```

---

## Key Metrics Dashboard

```
┌─────────────────────────────────────────────────────┐
│ Sikka API Rate Limit Dashboard                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Practice: Main Dental Clinic (D36225)              │
│ Current Hour: 10:00 AM - 11:00 AM                  │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ API Calls Used:  87 / 200  (43%)           │   │
│ │ ████████████████████░░░░░░░░░░░░░░░░░░░░   │   │
│ │                                             │   │
│ │ HIGH Priority:   12 / 50   (24%)           │   │
│ │ LOW Priority:    75 / 150  (50%)           │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Writebacks:                                         │
│   Pending:    3  (oldest: 2 minutes)               │
│   Completed:  45 (avg time: 65 seconds)            │
│   Failed:     1  (will retry at 2 AM)              │
│                                                     │
│ Status: ✓ HEALTHY                                  │
└─────────────────────────────────────────────────────┘
```
