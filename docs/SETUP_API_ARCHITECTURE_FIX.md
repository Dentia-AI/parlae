# Setup Progress API Architecture Fix

## Problem

The initial implementation tried to proxy setup progress requests from Next.js API routes to the NestJS backend. However, this approach had authentication challenges:

1. **NestJS Backend Uses Cognito JWT Tokens**: The `CognitoAuthGuard` expects raw Cognito JWT tokens
2. **NextAuth Session Structure**: The NextAuth session doesn't expose the raw Cognito token in a format that can be easily forwarded
3. **401 Unauthorized Errors**: The NestJS backend consistently rejected requests with 401 errors

## Solution

**Store setup progress directly in the Next.js database layer**, bypassing the NestJS backend entirely. This matches the architectural pattern used throughout the application where:
- **Next.js handles UI, authentication, and direct database operations**
- **NestJS handles business logic, external integrations, and complex workflows**

Setup wizard progress tracking is purely a database operation with no complex business logic, making it perfect for the Next.js layer.

## Implementation

### Created Dedicated API Routes

Each setup step now has its own Next.js API route that directly uses Prisma:

1. **`/api/setup/[accountId]/progress/route.ts`**
   - `GET`: Fetch current setup progress
   - `DELETE`: Clear all setup progress

2. **`/api/setup/[accountId]/voice/route.ts`**
   - `POST`: Save voice selection

3. **`/api/setup/[accountId]/knowledge/route.ts`**
   - `POST`: Save knowledge base files

4. **`/api/setup/[accountId]/integrations/route.ts`**
   - `POST`: Save PMS integration settings

5. **`/api/setup/[accountId]/phone/route.ts`**
   - `POST`: Save phone integration method

### Key Features

- ✅ **Direct Prisma access** - No proxy layer needed
- ✅ **Authentication via `requireSession()`** - Uses NextAuth session
- ✅ **JSON progress storage** - Flexible JSONB field in database
- ✅ **Atomic updates** - Each step independently persisted
- ✅ **Timestamp tracking** - `setupLastStep` and `completedAt` fields

### Database Schema

```prisma
model Account {
  // ... other fields
  setupProgress    Json?     @default("{}") @map("setup_progress")
  setupCompletedAt DateTime? @map("setup_completed_at")
  setupLastStep    String?   @map("setup_last_step")
}
```

### Progress Structure

```json
{
  "voice": {
    "data": { "voiceId": "...", "provider": "..." },
    "completedAt": "2026-02-11T20:10:00.000Z"
  },
  "knowledge": {
    "data": { "files": [...] },
    "completedAt": "2026-02-11T20:15:00.000Z"
  },
  "integrations": {
    "data": { "pmsConnected": true, "provider": "sikka" },
    "completedAt": "2026-02-11T20:20:00.000Z"
  },
  "phone": {
    "data": { "method": "sip", "settings": {...} },
    "completedAt": "2026-02-11T20:25:00.000Z"
  }
}
```

## Removed Files

- ❌ `/apps/backend/src/setup/*` - NestJS setup module no longer needed
- ❌ `/apps/frontend/apps/web/app/api/setup/[accountId]/[...path]/route.ts` - Catch-all proxy route removed

## Frontend Integration

The frontend `setup-api.ts` and `use-setup-progress.tsx` files remain unchanged - they still call the same API endpoints, but now those endpoints are served directly by Next.js instead of being proxied to NestJS.

## Benefits

1. **Simpler Architecture**: No proxy layer to debug
2. **Better Performance**: Direct database access, no HTTP round-trip to backend
3. **Easier Authentication**: Uses standard NextAuth session handling
4. **Consistent Pattern**: Matches how other features handle database operations
5. **Independent Deployment**: Setup progress works even if NestJS backend is down

## Testing

Try selecting a voice in the setup wizard - it should now save successfully without 401 errors.

```bash
# Monitor logs to verify success
tail -f ~/.cursor/projects/.../terminals/2.txt
```

Expected log output:
```
[Setup API] POST voice: Saving voice progress for account ca5ecdfd-...
✓ Setup progress saved successfully
```
