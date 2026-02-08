# Admin User Impersonation Fix

## Problem
The admin user impersonation feature was failing with a UUID validation error:
```
Error: [
  {
    "validation": "uuid",
    "code": "invalid_string",
    "message": "Invalid user id",
    "path": ["userId"]
  }
]
```

## Root Cause
The seed data was creating users with non-UUID string IDs:
- Test user: `'test-user-id'` 
- Admin user: `'admin-user-id'`

These are not valid UUIDs, but the impersonation action's Zod schema validation expected proper UUID format.

## Solution

### 1. Updated Seed Data (`packages/prisma/seed.ts`)
Changed user IDs to valid UUIDs:
- Test user: `550e8400-e29b-41d4-a716-446655440001`
- Admin user: `550e8400-e29b-41d4-a716-446655440002`

### 2. Updated Environment Configuration
Updated `.env.local` and `.env.example` to use the new admin user UUID:
```bash
ADMIN_USER_IDS=550e8400-e29b-41d4-a716-446655440002
```

### 3. Re-seeded Database
Ran the seed script to update existing users with proper UUID values:
```bash
cd packages/prisma && npm run seed
```

## Files Changed
1. `/packages/prisma/seed.ts` - Updated user IDs to valid UUIDs
2. `/.env.local` - Updated ADMIN_USER_IDS to new UUID
3. `/.env.example` - Added ADMIN_USER_IDS documentation with new UUID

## Testing
After restarting the dev server, the impersonation feature should now work:
1. Login as admin user (admin@example.com)
2. Navigate to `/admin`
3. Click "Impersonate" button on any user
4. Should successfully switch to that user's session

## Notes
- The admin check is done via environment variable `ADMIN_USER_IDS`
- Multiple admin IDs can be specified as comma-separated values
- The impersonation stores the original admin ID in a cookie for returning to admin
- Server restart is required after `.env.local` changes to pick up new values
