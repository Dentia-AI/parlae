# Call Analytics & Outbound Calls Migration

## Overview
This migration adds comprehensive call analytics tracking and outbound call support to the CallLog model. It enables tracking of key metrics shown in the analytics dashboard and prepares the system for Vapi + Twilio outbound calling.

## Schema Changes

### New Enums

#### CallOutcome
Tracks the primary outcome of each call:
- `BOOKED` - Appointment was booked
- `TRANSFERRED` - Call was transferred to staff
- `INSURANCE_INQUIRY` - Insurance verification/inquiry
- `PAYMENT_PLAN` - Payment plan discussed/setup
- `INFORMATION` - General information provided
- `VOICEMAIL` - Voicemail left
- `NO_ANSWER` - No answer
- `BUSY` - Line was busy
- `FAILED` - Call failed
- `OTHER` - Other outcome

#### CallType
Distinguishes inbound from outbound calls and categorizes outbound calls:
- `INBOUND` - Incoming call
- `OUTBOUND_LEAD` - Outbound lead follow-up
- `OUTBOUND_DEBT` - Outbound debt collection
- `OUTBOUND_FOLLOWUP` - Outbound follow-up
- `OUTBOUND_CAMPAIGN` - Outbound campaign call
- `OUTBOUND_OTHER` - Other outbound call

#### CallStatus
Tracks the current status of a call:
- `SCHEDULED` - Scheduled for future
- `IN_PROGRESS` - Currently in progress
- `COMPLETED` - Successfully completed
- `MISSED` - Missed call
- `VOICEMAIL` - Went to voicemail
- `FAILED` - Failed to connect
- `CANCELLED` - Cancelled before completion

### New Fields on CallLog

#### Analytics & Tracking
- `outcome` (CallOutcome) - Primary call outcome for analytics
- `insuranceVerified` (Boolean) - Whether insurance was verified
- `insuranceProvider` (String) - Insurance provider name
- `paymentPlanDiscussed` (Boolean) - Whether payment plan was discussed
- `paymentPlanAmount` (Int) - Payment plan amount in cents
- `collectionAttempt` (Boolean) - Whether this was a collection attempt
- `collectionAmount` (Int) - Amount collected in cents
- `collectionSuccess` (Boolean) - Whether collection was successful
- `transferredToStaff` (Boolean) - Whether call was transferred
- `transferredTo` (String) - Staff member name/ID

#### Outbound Call Support
- `vapiCallId` (String) - Vapi call ID for tracking
- `callType` (CallType) - Type of call (replaces string direction)
- `campaignId` (String) - Link to outbound campaign
- `scheduledAt` (DateTime) - When call was scheduled
- `callPurpose` (String) - Purpose of call
- `callNotes` (String) - Notes about the call
- `followUpRequired` (Boolean) - Whether follow-up is needed
- `followUpDate` (DateTime) - When to follow up

#### Quality & Cost
- `callQuality` (Int) - 1-5 rating
- `customerSentiment` (String) - positive, neutral, negative
- `aiConfidence` (Float) - AI confidence score 0-1
- `costCents` (Int) - Total call cost in cents
- `updatedAt` (DateTime) - Last update timestamp

### New Indexes
- `callType` - For filtering by call type
- `outcome` - For analytics queries
- `status` - For filtering by status
- `campaignId` - For campaign tracking
- `scheduledAt` - For scheduling queries

## Migration Steps

### 1. Generate Prisma Migration
```bash
npx prisma migrate dev --name add_call_analytics_and_outbound_support
```

### 2. Apply Migration
The migration will:
1. Create new enum types
2. Add new columns to `call_logs` table
3. Set default values for existing records
4. Create new indexes

### 3. Data Migration (if needed)
For existing call logs, you may want to:
- Map old `direction` values to new `callType` enum
- Map old `status` strings to new `CallStatus` enum
- Set default `outcome` based on existing fields (e.g., if `appointmentSet` is true, set outcome to `BOOKED`)

## Analytics Queries

### Key Metrics

#### Total Calls
```sql
SELECT COUNT(*) FROM call_logs WHERE call_started_at >= NOW() - INTERVAL '7 days';
```

#### Booking Rate
```sql
SELECT 
  (COUNT(*) FILTER (WHERE outcome = 'booked')::float / COUNT(*)::float) * 100 as booking_rate
FROM call_logs 
WHERE call_started_at >= NOW() - INTERVAL '7 days';
```

#### Average Call Time
```sql
SELECT AVG(duration) FROM call_logs 
WHERE call_started_at >= NOW() - INTERVAL '7 days' AND duration IS NOT NULL;
```

#### Insurance Verified
```sql
SELECT COUNT(*) FROM call_logs 
WHERE insurance_verified = true AND call_started_at >= NOW() - INTERVAL '7 days';
```

#### Payment Plans
```sql
SELECT SUM(payment_plan_amount) FROM call_logs 
WHERE payment_plan_discussed = true AND call_started_at >= NOW() - INTERVAL '7 days';
```

#### Collections
```sql
SELECT 
  SUM(collection_amount) as total_collected,
  (COUNT(*) FILTER (WHERE collection_success = true)::float / COUNT(*)::float) * 100 as collection_rate
FROM call_logs 
WHERE collection_attempt = true AND call_started_at >= NOW() - INTERVAL '7 days';
```

#### Call Outcomes Distribution
```sql
SELECT 
  outcome,
  COUNT(*) as count,
  (COUNT(*)::float / SUM(COUNT(*)) OVER ()) * 100 as percentage
FROM call_logs 
WHERE call_started_at >= NOW() - INTERVAL '7 days'
GROUP BY outcome
ORDER BY count DESC;
```

## Outbound Call Workflow

### Scheduling an Outbound Call
```typescript
const call = await prisma.callLog.create({
  data: {
    voiceAgentId: 'agent-id',
    phoneNumber: '+15551234567',
    callType: 'OUTBOUND_DEBT',
    status: 'SCHEDULED',
    scheduledAt: new Date('2024-02-15T10:00:00Z'),
    callPurpose: 'Follow up on outstanding balance',
    campaignId: 'campaign-123',
  }
});
```

### Initiating Outbound Call via Vapi
```typescript
// When it's time to make the call
const vapiResponse = await vapi.calls.create({
  phoneNumber: call.phoneNumber,
  assistantId: 'assistant-id',
  // ... other Vapi config
});

// Update call log
await prisma.callLog.update({
  where: { id: call.id },
  data: {
    vapiCallId: vapiResponse.id,
    status: 'IN_PROGRESS',
    callStartedAt: new Date(),
  }
});
```

### Processing Call Results
```typescript
// After call completes (via webhook)
await prisma.callLog.update({
  where: { vapiCallId: vapiCallId },
  data: {
    status: 'COMPLETED',
    outcome: 'PAYMENT_PLAN',
    duration: durationInSeconds,
    callEndedAt: new Date(),
    paymentPlanDiscussed: true,
    paymentPlanAmount: 50000, // $500.00
    transcript: fullTranscript,
    summary: aiGeneratedSummary,
    costCents: 150, // $1.50
  }
});
```

## API Endpoints to Create

### GET /api/analytics/calls
- Returns aggregated call metrics for dashboard
- Query params: `startDate`, `endDate`, `agentId`

### GET /api/analytics/calls/recent
- Returns recent calls with full details
- Query params: `limit`, `offset`, `agentId`

### GET /api/analytics/calls/outcomes
- Returns call outcome distribution
- Query params: `startDate`, `endDate`, `agentId`

### POST /api/outbound/schedule
- Schedules an outbound call
- Body: `{ phoneNumber, callType, scheduledAt, purpose, campaignId }`

### GET /api/outbound/scheduled
- Returns scheduled outbound calls
- Query params: `startDate`, `endDate`

## Testing

### Test Data Creation
```typescript
// Create test call logs with various outcomes
const outcomes = ['BOOKED', 'TRANSFERRED', 'INSURANCE_INQUIRY', 'OTHER'];
for (let i = 0; i < 100; i++) {
  await prisma.callLog.create({
    data: {
      voiceAgentId: 'test-agent',
      phoneNumber: `+1555${String(i).padStart(7, '0')}`,
      callType: 'INBOUND',
      status: 'COMPLETED',
      outcome: outcomes[i % outcomes.length],
      duration: Math.floor(Math.random() * 300) + 30,
      callStartedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      callEndedAt: new Date(),
      insuranceVerified: Math.random() > 0.5,
      appointmentSet: outcomes[i % outcomes.length] === 'BOOKED',
    }
  });
}
```

## Rollback Plan

If issues arise:
```bash
npx prisma migrate resolve --rolled-back add_call_analytics_and_outbound_support
```

Then restore from database backup if data corruption occurs.

## Post-Migration Tasks

1. ✅ Update TypeScript types (auto-generated by Prisma)
2. ✅ Create analytics API endpoints
3. ✅ Build analytics dashboard UI
4. ✅ Set up Vapi webhook handlers for outbound calls
5. ✅ Create outbound call scheduling system
6. ✅ Add monitoring for call costs
7. ✅ Update documentation for team
