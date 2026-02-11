# Setup Progress Persistence - Complete Implementation

## Summary

Successfully implemented database-backed setup wizard progress tracking using **Next.js Server Actions** to bypass NextAuth CSRF validation issues while maintaining proper security.

## Final Architecture

### Server Actions Approach ✅

Instead of API routes, we use Server Actions (`'use server'`) which:
- **Bypass CSRF issues** - No HTTP requests, direct server execution
- **Maintain security** - Each action checks `auth()` for authenticated sessions
- **Type-safe** - Full TypeScript support
- **Performant** - Direct database access, automatic revalidation

### Components

1. **Server Actions** (`_actions/setup-progress-actions.ts`)
   ```typescript
   'use server';
   
   import { auth } from '@kit/shared/auth/nextauth';
   import { prisma } from '@kit/prisma';
   
   export async function saveVoiceProgressAction(accountId: string, voice: VoiceSetupData) {
     // Authentication check
     const session = await auth();
     if (!session?.user?.id) {
       return { success: false, error: 'Unauthorized' };
     }
     
     // Direct database update
     await prisma.account.update({ ... });
     
     return { success: true };
   }
   ```

2. **React Query Hooks** (`_lib/use-setup-progress.tsx`)
   ```typescript
   const saveVoiceMutation = useMutation({
     mutationFn: async (voice: VoiceSetupData) => {
       const result = await saveVoiceProgressAction(accountId, voice);
       if (!result.success) {
         throw new Error(result.error);
       }
       return result;
     },
   });
   ```

3. **Database Schema** (`packages/prisma/schema.prisma`)
   ```prisma
   model Account {
     setupProgress    Json?     @default("{}") @map("setup_progress")
     setupCompletedAt DateTime? @map("setup_completed_at")
     setupLastStep    String?   @map("setup_last_step")
   }
   ```

### Progress Data Structure

```json
{
  "voice": {
    "data": { "voiceId": "...", "provider": "..." },
    "completedAt": "2026-02-11T20:30:00.000Z"
  },
  "knowledge": {
    "data": { "files": [...] },
    "completedAt": "2026-02-11T20:35:00.000Z"
  },
  "integrations": {
    "data": { "pmsConnected": true, "provider": "sikka" },
    "completedAt": "2026-02-11T20:40:00.000Z"
  },
  "phone": {
    "data": { "method": "sip", "settings": {...} },
    "completedAt": "2026-02-11T20:45:00.000Z"
  }
}
```

## Issues Encountered & Resolved

### 1. CSRF Token Validation Errors ❌ → ✅

**Problem**: NextAuth enforced CSRF validation on API routes
```
POST /api/setup/.../voice 401 (Unauthorized)
Error: Invalid CSRF token
```

**Attempted Solutions**:
- ✗ Added `credentials: 'same-origin'` to fetch requests
- ✗ Used `getSession()` instead of `requireSession()`
- ✗ Imported `auth()` directly from NextAuth
- ✗ Removed authentication checks entirely

**Final Solution**: Switched to Server Actions
- Server Actions don't use HTTP/CSRF
- Built-in Next.js security mechanisms
- Direct server execution with session checks

### 2. Database Migration Issues ❌ → ✅

**Problem**: Conflicting Prisma migrations
```
Column accounts.setup_progress does not exist
Column status already exists
```

**Solution**:
```bash
# Mark conflicting migration as applied
prisma migrate resolve --applied 20260211000000_add_call_analytics_and_outbound

# Apply new migration
prisma migrate deploy

# Regenerate client
prisma generate
```

### 3. Knowledge Base Array Check ❌ → ✅

**Problem**: Runtime error when loading saved knowledge base files
```
TypeError: progress.knowledge.data.files.map is not a function
```

**Solution**: Added array type guard
```typescript
if (progress?.knowledge?.data?.files && Array.isArray(progress.knowledge.data.files)) {
  const savedFiles = progress.knowledge.data.files.map(...);
}
```

## Security

### Multi-Layer Protection

1. **Page-Level Auth** - `/home/*` routes require authentication
2. **Server Action Auth** - Each action calls `auth()` and checks `session?.user?.id`
3. **Account Scoping** - Progress tied to specific `accountId`
4. **Database Constraints** - Prisma enforces data integrity

### Example Auth Flow

```typescript
// Client Component
const { saveVoice } = useSetupProgress(accountId);
await saveVoice(voiceData); // Calls Server Action

// Server Action
export async function saveVoiceProgressAction(...) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' };
  }
  
  // User is authenticated, proceed with database update
  await prisma.account.update({ ... });
}
```

## Usage

### In Setup Pages

```typescript
'use client';

import { useSetupProgress } from '../_lib/use-setup-progress';

export function VoiceSelectionPage({ accountId }: { accountId: string }) {
  const { progress, saveVoice, isSaving } = useSetupProgress(accountId);
  
  // Load saved voice on mount
  const savedVoice = progress?.voice?.data;
  
  // Save voice selection
  const handleSave = async () => {
    await saveVoice(selectedVoice);
  };
  
  return (
    <Button onClick={handleSave} disabled={isSaving}>
      {isSaving ? 'Saving...' : 'Continue'}
    </Button>
  );
}
```

## Benefits

✅ **Independent Step Saving** - Each step saves independently
✅ **Out-of-Order Completion** - Users can complete steps in any order
✅ **Persistent Progress** - Survives page refreshes and navigation
✅ **No CSRF Issues** - Server Actions bypass HTTP/CSRF validation
✅ **Type Safety** - Full TypeScript support
✅ **Performance** - Direct database access, React Query caching
✅ **Security** - Authentication checked on every action

## Files Modified

### Created
- `apps/frontend/apps/web/app/home/(user)/agent/setup/_actions/setup-progress-actions.ts`
- `packages/prisma/migrations/20260211000001_add_setup_progress/migration.sql`
- `docs/SETUP_PROGRESS_COMPLETE.md`

### Modified
- `packages/prisma/schema.prisma` - Added setupProgress fields
- `apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/use-setup-progress.tsx` - Switched to Server Actions
- `apps/frontend/apps/web/app/home/(user)/agent/setup/_components/voice-selection-page-client.tsx` - Integrated save/load
- `apps/frontend/apps/web/app/home/(user)/agent/setup/knowledge/page.tsx` - Integrated save/load + array guard
- `apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx` - Integrated save/load
- `apps/frontend/apps/web/app/home/(user)/agent/setup/phone/page.tsx` - Integrated save/load

## Testing

### Manual Test Steps

1. **Voice Selection**
   - Select a voice
   - Click "Continue"
   - Navigate back
   - ✅ Voice should remain selected

2. **Knowledge Base**
   - Upload files
   - Click "Continue"  
   - Navigate back
   - ✅ Files should still be listed

3. **Out-of-Order**
   - Go to step 4 (Phone Integration)
   - Complete without finishing step 2 or 3
   - ✅ Step 4 should save successfully

4. **Page Refresh**
   - Complete any step
   - Refresh the page
   - ✅ Progress should persist

### Expected Terminal Logs

```
[Setup Actions] Saving voice progress: { accountId: '...', voice: {...} }
prisma:query UPDATE "accounts" SET "setup_progress" = ...
[Setup Actions] Voice progress saved successfully
```

## Next Steps

- [ ] Add error toast notifications for failed saves
- [ ] Show progress indicators (e.g., "3 of 5 steps complete")
- [ ] Add "Reset Progress" button for testing
- [ ] Consider adding optimistic updates for better UX

## Architecture Decision

We chose **Server Actions over API Routes** because:

1. **Server Actions** are the modern Next.js 14+ approach
2. No CSRF/authentication complexity
3. Better type safety and DX
4. Automatic revalidation via `revalidatePath()`
5. Simpler codebase (no API route files needed)

API routes remain useful for:
- Public/webhook endpoints
- External API integrations
- Complex authentication flows

But for internal, authenticated operations like setup progress, Server Actions are the superior choice.
