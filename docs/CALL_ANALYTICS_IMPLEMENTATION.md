# Call Analytics Dashboard Implementation

## Overview
A comprehensive call analytics dashboard has been implemented with full support for tracking call metrics, outcomes, and preparing for outbound calling capabilities using Vapi + Twilio.

## What Was Built

### 1. Database Schema Updates ✅

#### New Enums
- **CallOutcome**: Tracks primary call outcomes (BOOKED, TRANSFERRED, INSURANCE_INQUIRY, PAYMENT_PLAN, etc.)
- **CallType**: Distinguishes call types (INBOUND, OUTBOUND_LEAD, OUTBOUND_DEBT, OUTBOUND_FOLLOWUP, etc.)
- **CallStatus**: Tracks call status (SCHEDULED, IN_PROGRESS, COMPLETED, MISSED, etc.)

#### Enhanced CallLog Model
Added 20+ new fields to track:
- **Analytics Fields**: outcome, insurance verification, payment plans, collections, transfers
- **Outbound Support**: vapiCallId, callType, campaignId, scheduledAt, callPurpose, followUpDate
- **Quality Metrics**: callQuality, customerSentiment, aiConfidence
- **Cost Tracking**: costCents (for Vapi + Twilio billing)

**Schema File**: `packages/prisma/schema.prisma`
**Migration**: `packages/prisma/migrations/20260211000000_add_call_analytics_and_outbound/migration.sql`

### 2. API Endpoints ✅

#### GET /api/analytics/calls
Returns aggregated metrics for the dashboard:
- Total calls
- Booking rate
- Average call time
- Insurance verification stats
- Payment plans (count + total amount)
- Collections (recovered amount + collection rate)
- Activity trend (calls per day)
- Call outcomes distribution

**Query Parameters:**
- `startDate` - ISO date string (default: 7 days ago)
- `endDate` - ISO date string (default: now)
- `agentId` - Filter by specific voice agent (optional)

#### GET /api/analytics/calls/recent
Returns recent call logs with full details:
- Contact information
- Call outcomes and status
- Duration and timestamps
- Associated metrics (insurance, appointments, payments)

**Query Parameters:**
- `limit` - Number of calls (default: 10)
- `offset` - Pagination offset (default: 0)
- `agentId` - Filter by agent (optional)

#### POST /api/outbound/schedule
Schedules an outbound call:

**Request Body:**
```json
{
  "voiceAgentId": "uuid",
  "phoneNumber": "+15551234567",
  "callType": "OUTBOUND_DEBT",
  "scheduledAt": "2024-02-15T10:00:00Z",
  "callPurpose": "Follow up on outstanding balance",
  "campaignId": "campaign-123",
  "contactName": "John Doe",
  "contactEmail": "john@example.com",
  "callNotes": "Previous balance: $500"
}
```

#### GET /api/outbound/schedule
Returns scheduled outbound calls with filters.

### 3. Dashboard UI ✅

#### Main Analytics Page
**Location**: `apps/frontend/apps/web/app/home/(user)/analytics/page.tsx`

Features:
- Date range selector (7, 30, 90 days)
- 8 metric cards showing key KPIs
- Activity trend chart
- Call outcomes distribution chart
- Recent calls list with details

#### Key Metrics Displayed

**Primary Metrics:**
- Total Calls (with trend)
- Booking Rate (percentage)
- Average Call Time (formatted as minutes:seconds)
- Activity (calls per day)

**Secondary Metrics:**
- Insurance Verified (count + rate)
- Payment Plans (total amount + count)
- Collections (recovered amount)
- Collection Rate (percentage with trend)

#### Components

**CallAnalyticsDashboard** (`_components/call-analytics-dashboard.tsx`)
Main dashboard component with state management and data fetching.

**ActivityChart** (`_components/activity-chart.tsx`)
Bar chart showing calls per day over time.

**CallOutcomesChart** (`_components/call-outcomes-chart.tsx`)
Horizontal bar chart showing distribution of call outcomes with color coding:
- 🟢 Booked (Green)
- 🔵 Transferred (Blue)
- 🟣 Insurance Inquiry (Purple)
- 🟡 Payment Plan (Amber)
- 🟠 Other (Orange)

**RecentCallsList** (`_components/recent-calls-list.tsx`)
List of recent calls with:
- Contact info
- Call outcome badges
- Duration
- Quick indicators (Insurance ✓, Appointment ✓)
- Call summary

### 4. Navigation ✅

Added "Analytics" menu item to the main navigation:
- Location: Between "Home" and "Setup"
- Icon: BarChart3 (chart icon)
- Path: `/home/analytics`

**Updated File**: `apps/frontend/apps/web/config/personal-account-navigation.config.tsx`

## Database Migration

### Running the Migration

```bash
# Generate the migration (if not already created)
npx prisma migrate dev --name add_call_analytics_and_outbound_support

# Or apply existing migration
npx prisma migrate deploy
```

### What the Migration Does

1. Creates three new enum types
2. Adds 20+ new columns to `call_logs` table
3. Creates 6 new indexes for performance
4. Migrates existing data:
   - Maps `appointmentSet=true` to `outcome='BOOKED'`
   - Maps `leadCaptured=true` (without appointment) to `outcome='INFORMATION'`
   - Sets default values for all new fields

## Outbound Call Support (Ready for Implementation)

### Architecture

The schema and API endpoints are ready to support outbound calling workflows:

1. **Scheduling**: Create call records with `status='SCHEDULED'`
2. **Initiating**: Use Vapi API to place call, store `vapiCallId`
3. **Tracking**: Update status to `IN_PROGRESS` when call starts
4. **Completion**: Process webhook, update outcome and metrics

### Example Workflow

```typescript
// 1. Schedule a debt collection call
const scheduledCall = await fetch('/api/outbound/schedule', {
  method: 'POST',
  body: JSON.stringify({
    voiceAgentId: 'agent-123',
    phoneNumber: '+15551234567',
    callType: 'OUTBOUND_DEBT',
    scheduledAt: new Date('2024-02-15T10:00:00Z'),
    callPurpose: 'Outstanding balance of $500',
    contactName: 'John Doe',
  }),
});

// 2. When it's time, initiate call via Vapi
const vapiCall = await vapi.calls.create({
  phoneNumber: '+15551234567',
  assistantId: 'assistant-123',
  // ... other config
});

// 3. Update call log with Vapi ID
await prisma.callLog.update({
  where: { id: scheduledCall.id },
  data: {
    vapiCallId: vapiCall.id,
    status: 'IN_PROGRESS',
  },
});

// 4. Process completion webhook
await prisma.callLog.update({
  where: { vapiCallId: vapiCall.id },
  data: {
    status: 'COMPLETED',
    outcome: 'PAYMENT_PLAN',
    callEndedAt: new Date(),
    duration: 180,
    collectionAttempt: true,
    collectionSuccess: true,
    collectionAmount: 50000, // $500.00
    costCents: 120, // $1.20 for the call
  },
});
```

### Call Types Supported

- **OUTBOUND_LEAD**: Lead follow-up calls
- **OUTBOUND_DEBT**: Debt collection calls
- **OUTBOUND_FOLLOWUP**: Post-appointment follow-ups
- **OUTBOUND_CAMPAIGN**: Campaign-based calls
- **OUTBOUND_OTHER**: Other outbound purposes

## Key Features

### 1. Real-Time Analytics
- Metrics update in real-time as calls are completed
- Date range filtering (7, 30, 90 days)
- Trend indicators showing growth/decline

### 2. Comprehensive Tracking
Every call can track:
- Basic info (phone, contact, duration)
- Outcomes (booked, transferred, information, etc.)
- Insurance verification (yes/no + provider name)
- Payment plans (discussed + amount)
- Collections (attempt + amount + success)
- Quality metrics (rating, sentiment, AI confidence)
- Costs (Vapi + Twilio combined)

### 3. Future-Ready
Schema supports:
- Scheduled outbound calls
- Campaign tracking
- Follow-up reminders
- Call notes and purpose
- Cost tracking for ROI analysis

## Testing

### Create Test Data

```typescript
// Create diverse test calls
const outcomes = ['BOOKED', 'TRANSFERRED', 'INSURANCE_INQUIRY', 'PAYMENT_PLAN', 'OTHER'];

for (let i = 0; i < 100; i++) {
  await prisma.callLog.create({
    data: {
      voiceAgentId: 'test-agent-id',
      phoneNumber: `+1555${String(i).padStart(7, '0')}`,
      callType: 'INBOUND',
      status: 'COMPLETED',
      outcome: outcomes[i % outcomes.length],
      duration: Math.floor(Math.random() * 300) + 30,
      callStartedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      callEndedAt: new Date(),
      insuranceVerified: Math.random() > 0.5,
      appointmentSet: outcomes[i % outcomes.length] === 'BOOKED',
      contactName: `Test Contact ${i}`,
      paymentPlanDiscussed: Math.random() > 0.7,
      paymentPlanAmount: Math.random() > 0.7 ? Math.floor(Math.random() * 100000) : null,
      collectionAttempt: Math.random() > 0.8,
      collectionAmount: Math.random() > 0.8 ? Math.floor(Math.random() * 50000) : null,
      collectionSuccess: Math.random() > 0.5,
    },
  });
}
```

### Test API Endpoints

```bash
# Get analytics for last 7 days
curl http://localhost:3000/api/analytics/calls

# Get recent calls
curl http://localhost:3000/api/analytics/calls/recent?limit=5

# Schedule an outbound call
curl -X POST http://localhost:3000/api/outbound/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "voiceAgentId": "agent-123",
    "phoneNumber": "+15551234567",
    "callType": "OUTBOUND_LEAD",
    "scheduledAt": "2024-02-15T10:00:00Z",
    "callPurpose": "Follow up on inquiry"
  }'
```

## Next Steps for Outbound Calling

To fully implement outbound calling, you'll need to:

1. **Set up Vapi webhook handler** to receive call completion events
2. **Create a scheduler** to process scheduled calls (cron job or similar)
3. **Implement Vapi call initiation** when scheduled time arrives
4. **Add campaign management UI** to create and track campaigns
5. **Build outbound call queue** with priority and retry logic
6. **Add cost tracking integration** with Vapi and Twilio billing APIs
7. **Create outbound call dashboard** separate from analytics

## Files Changed/Created

### Schema
- `packages/prisma/schema.prisma` - Updated CallLog model + new enums
- `packages/prisma/migrations/20260211000000_add_call_analytics_and_outbound/migration.sql`

### API Routes
- `apps/frontend/apps/web/app/api/analytics/calls/route.ts` - Main analytics endpoint
- `apps/frontend/apps/web/app/api/analytics/calls/recent/route.ts` - Recent calls endpoint
- `apps/frontend/apps/web/app/api/outbound/schedule/route.ts` - Outbound scheduling endpoint

### Dashboard Pages
- `apps/frontend/apps/web/app/home/(user)/analytics/page.tsx` - Main analytics page
- `apps/frontend/apps/web/app/home/(user)/analytics/loading.tsx` - Loading state

### Dashboard Components
- `apps/frontend/apps/web/app/home/(user)/analytics/_components/call-analytics-dashboard.tsx`
- `apps/frontend/apps/web/app/home/(user)/analytics/_components/activity-chart.tsx`
- `apps/frontend/apps/web/app/home/(user)/analytics/_components/call-outcomes-chart.tsx`
- `apps/frontend/apps/web/app/home/(user)/analytics/_components/recent-calls-list.tsx`
- `apps/frontend/apps/web/app/home/(user)/analytics/_components/call-metrics-cards.tsx`

### Configuration
- `apps/frontend/apps/web/config/personal-account-navigation.config.tsx` - Added Analytics menu item

### Documentation
- `docs/CALL_ANALYTICS_MIGRATION.md` - Migration guide and SQL queries
- `docs/CALL_ANALYTICS_IMPLEMENTATION.md` - This file

## Performance Considerations

- **Indexes**: Added indexes on frequently queried fields (callType, outcome, status, scheduledAt)
- **Pagination**: Recent calls endpoint supports limit/offset pagination
- **Caching**: Consider adding Redis caching for analytics aggregations
- **Query optimization**: Use Prisma aggregations for efficient metric calculations

## Security

- All endpoints require authentication via Supabase
- User can only access data for their own voice agents
- Phone numbers are stored but can be masked in UI if needed
- Consider encrypting PII fields (contactName, contactEmail) at rest

## Monitoring

Track these metrics in production:
- API response times for analytics endpoints
- Database query performance
- Call completion rate vs scheduled calls
- Cost per call (Vapi + Twilio)
- Outcome distribution trends

## Support

For questions or issues:
1. Check the migration documentation in `docs/CALL_ANALYTICS_MIGRATION.md`
2. Review API endpoint responses for debugging
3. Use Prisma Studio to inspect database records: `npx prisma studio`
