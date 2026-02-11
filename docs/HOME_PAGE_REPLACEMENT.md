# Home Page Replacement with Call Analytics Dashboard

## Overview
The home page has been replaced with the full call analytics dashboard. All outdated financial and advertising code has been removed.

## Changes Made

### 1. Home Page (`/home/(user)/page.tsx`)
**Before:**
- Financial overview (payments, ad spend, balance)
- Ad statistics (ads created, campaigns, uploads, storage)
- Placeholder AI agent metrics

**After:**
- Full call analytics dashboard
- Real-time metrics from actual call data
- Mock data in development when no calls exist

### 2. Code Removed
All references to:
- `totalSpendCents` / `totalPaymentsCents` / `netBalanceCents`
- `totalAds` / `activeCampaigns` / `totalFiles` / `storageUsedBytes`
- Financial overview card
- Ad statistics cards
- `formatBytes()` utility function

### 3. API Fixes
Fixed import errors in analytics API routes:
- Changed from `new PrismaClient()` to `import { prisma } from '@kit/prisma'`
- This uses the singleton pattern to prevent multiple Prisma instances
- Ensures connection pooling and proper cleanup

### 4. Mock Data for Development
Added mock data generators for local development:

#### Analytics Endpoint Mock Data
When no calls exist and `NODE_ENV === 'development'`:
- Generates realistic call activity over date range (10-40 calls/day)
- Mock metrics matching the dashboard design:
  - 78% booking rate
  - 1m 42s avg call time
  - 65% insurance verification rate
  - $47,200 in payment plans
  - $32,800 collections recovered
  - 89% collection rate

#### Recent Calls Mock Data
Generates 10 realistic call records with:
- Diverse patient names and phone numbers
- Various call outcomes (booked, transferred, insurance, payment, etc.)
- Realistic call summaries
- Random durations (30-270 seconds)
- Timestamps spread over last 7 days

## File Structure

```
app/home/(user)/
├── page.tsx                           # NEW: Clean dashboard page
├── analytics/
│   ├── page.tsx                       # Analytics page (also accessible at /home/analytics)
│   ├── loading.tsx
│   └── _components/
│       ├── call-analytics-dashboard.tsx
│       ├── activity-chart.tsx
│       ├── call-outcomes-chart.tsx
│       ├── recent-calls-list.tsx
│       └── call-metrics-cards.tsx
└── _components/
    └── home-page-header.tsx

app/api/
├── analytics/
│   └── calls/
│       ├── route.ts                   # FIXED: Proper Prisma import + mock data
│       └── recent/
│           └── route.ts               # FIXED: Proper Prisma import + mock data
└── outbound/
    └── schedule/
        └── route.ts                   # FIXED: Proper Prisma import
```

## Navigation

The dashboard is now accessible from two routes:
1. **`/home`** - Main home page (NEW)
2. **`/home/analytics`** - Analytics page (also shows same dashboard)

Both routes show the identical call analytics dashboard.

## Development vs Production

### Development Mode (`NODE_ENV === 'development'`)
- If no calls exist in database, automatically shows mock data
- Mock data is realistic and matches dashboard design
- Helps with UI development and testing without real data

### Production Mode
- Only shows real data from database
- No mock data fallback
- If no calls, shows empty states

## Testing

### View Mock Data
1. Start development server: `./dev.sh`
2. Navigate to `http://localhost:3000/home`
3. Should see dashboard with mock data if no real calls exist

### Add Real Data
To test with real data, use the test script from docs:

```typescript
// Run in Prisma Studio or create a script
const outcomes = ['BOOKED', 'TRANSFERRED', 'INSURANCE_INQUIRY', 'PAYMENT_PLAN'];

for (let i = 0; i < 50; i++) {
  await prisma.callLog.create({
    data: {
      voiceAgentId: 'your-agent-id',
      phoneNumber: `+1555${String(i).padStart(7, '0')}`,
      callType: 'INBOUND',
      status: 'COMPLETED',
      outcome: outcomes[i % outcomes.length],
      duration: Math.floor(Math.random() * 300) + 30,
      callStartedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      callEndedAt: new Date(),
      contactName: `Test Contact ${i}`,
      insuranceVerified: Math.random() > 0.5,
      appointmentSet: outcomes[i % outcomes.length] === 'BOOKED',
    },
  });
}
```

## Migration Status

Before using with real data, run the migration:

```bash
npx prisma migrate dev
```

This will:
1. Create new enum types (CallOutcome, CallType, CallStatus)
2. Add new fields to call_logs table
3. Create performance indexes

## Benefits

1. **Cleaner Codebase**: Removed irrelevant financial/ad code
2. **Single Source of Truth**: One dashboard for call metrics
3. **Better Developer Experience**: Mock data makes local development easier
4. **Production Ready**: Real data automatically used when available
5. **Performance**: Proper Prisma singleton pattern prevents connection issues

## Future Enhancements

The dashboard is ready for:
- Real-time updates via WebSocket
- Advanced filtering (by agent, date range, outcome)
- Export to CSV/PDF
- Comparison views (current vs previous period)
- Goal tracking and alerts
- Outbound call campaign management

## Removed Code Reference

If you need to restore any removed functionality:
- Check git history for previous version of `/home/(user)/page.tsx`
- Financial overview was using `loadUserWorkspace()` stats
- Storage/file metrics were from workspace stats

The analytics dashboard is a complete replacement focused on call center operations rather than marketing/advertising metrics.
