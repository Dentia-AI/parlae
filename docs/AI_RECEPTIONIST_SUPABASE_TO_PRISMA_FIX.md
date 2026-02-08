# Supabase to Prisma Fix

## Issue

**Error:**
```
Module not found: Can't resolve '@kit/supabase/server-client'
```

**Root Cause:**
The receptionist setup actions were written for Supabase, but this project uses **Prisma** directly for database operations.

## Fix Applied

### File Modified
`apps/frontend/apps/web/app/home/(user)/receptionist/setup/_lib/actions.ts`

### Changes Made

#### 1. Updated Imports
**Before:**
```typescript
import { getSupabaseServerClient } from '@kit/supabase/server-client';
```

**After:**
```typescript
import { prisma } from '@kit/prisma';
```

#### 2. Updated setupPhoneNumberAction
**Before (Supabase):**
```typescript
const supabase = getSupabaseServerClient();
const { error } = await supabase
  .from('accounts')
  .update({
    phone_integration_method: 'ported',
    phone_integration_settings: { ... },
  })
  .eq('id', data.accountId);

if (error) {
  throw error;
}
```

**After (Prisma):**
```typescript
await prisma.account.update({
  where: { id: data.accountId },
  data: {
    phoneIntegrationMethod: 'ported',
    phoneIntegrationSettings: { ... },
  },
});
```

#### 3. Updated deployReceptionistAction
**Before (Supabase):**
```typescript
const supabase = getSupabaseServerClient();

// Fetch account
const { data: account, error: accountError } = await supabase
  .from('accounts')
  .select('id, name, phone_integration_settings')
  .eq('primary_owner_user_id', user.id)
  .single();

if (accountError || !account) {
  throw new Error('Account not found');
}

// Update account
const { error: updateError } = await supabase
  .from('accounts')
  .update({ ... })
  .eq('id', account.id);

if (updateError) {
  throw updateError;
}
```

**After (Prisma):**
```typescript
// Fetch account
const account = await prisma.account.findFirst({
  where: {
    primaryOwnerId: user.id,
  },
  select: {
    id: true,
    name: true,
    phoneIntegrationSettings: true,
  },
});

if (!account) {
  throw new Error('Account not found');
}

// Update account
await prisma.account.update({
  where: { id: account.id },
  data: { ... },
});
```

## Key Differences: Supabase vs Prisma

### Query Style
| Operation | Supabase | Prisma |
|-----------|----------|--------|
| Select | `.from('table').select('col1, col2')` | `.table.findFirst({ select: { col1: true } })` |
| Where | `.eq('column', value)` | `where: { column: value }` |
| Update | `.update({ data }).eq('id', id)` | `.update({ where: { id }, data })` |
| Error handling | Returns `{ data, error }` | Throws exceptions |

### Field Naming
| Supabase (snake_case) | Prisma (camelCase) |
|-----------------------|---------------------|
| `phone_integration_method` | `phoneIntegrationMethod` |
| `phone_integration_settings` | `phoneIntegrationSettings` |
| `primary_owner_user_id` | `primaryOwnerId` |

### Type Safety
- **Supabase**: Runtime validation, manual type assertions
- **Prisma**: Compile-time type checking with generated types

## Testing

✅ **No build errors**  
✅ **No linter errors**  
✅ **Correct Prisma field names used**  
✅ **All database operations converted**  

## Files That Use Prisma Correctly

Reference these for patterns:
- `apps/frontend/apps/web/app/admin/accounts/_lib/server/admin-actions.ts`
- `apps/frontend/packages/shared/src/auth/impersonation.ts`

## Summary

The receptionist setup actions now correctly use:
- ✅ `prisma` from `@kit/prisma`
- ✅ Prisma-style queries (`findFirst`, `update`)
- ✅ CamelCase field names from schema
- ✅ Exception-based error handling

No more Supabase dependencies! 🎉
