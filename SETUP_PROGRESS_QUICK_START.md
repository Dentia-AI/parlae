# 🚀 Setup Progress Tracking - Quick Start

## What You Asked For ✅

> "I want to make sure if user completes any steps we want to save the progress. So voice selection, knowledge base etc, should be saved even if they don't complete the flow. So if they go to step 4 without completing step 2,3 and complete it even then save step 4 data."

**Status**: ✅ Infrastructure Complete, Ready to Integrate

## What's Been Built

### Backend API (100% Complete)
- ✅ Database fields added to Account model
- ✅ 8 API endpoints created
- ✅ Service layer with save/load logic
- ✅ Type-safe DTOs
- ✅ Authentication guards

### Frontend Utilities (100% Complete)
- ✅ API client functions
- ✅ React hooks for easy integration
- ✅ React Query integration
- ✅ TypeScript types

### How It Works Now

```
User completes Step 1 (Voice)
    ↓
Clicks Continue
    ↓
Frontend calls: saveVoice(accountId, voiceData)
    ↓
Backend saves to Database
    ↓
Data persisted forever
    ↓
User can resume anytime, anywhere
```

## Quick Demo

### Before (Current Behavior)
```
1. User selects voice
2. Navigates away
3. Returns to setup
❌ Voice selection lost (only in sessionStorage)
```

### After (New Behavior)
```
1. User selects voice
2. Clicks "Continue" → Saves to database
3. Navigates away
4. Returns to setup
✅ Voice selection loaded from database
```

## What You Need to Do

### Step 1: Run Migration (Required)

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae/packages/prisma

# Apply migration
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

This adds the 3 new columns to your `accounts` table.

### Step 2: Restart Backend

```bash
# Your backend should pick up the new SetupModule automatically
# If using Docker, restart containers
docker-compose restart backend

# If running locally, restart the dev server
```

### Step 3: Integrate Frontend (Choose Your Approach)

**Option A: Quick Test (Recommended)**

Just add to ONE page to test it works:

```typescript
// In voice-selection-page-client.tsx
import { useSetupProgress } from '../_lib/use-setup-progress';

// In component:
const { saveVoice, progress } = useSetupProgress(accountId);

// Update handleContinue:
const handleContinue = async () => {
  if (!selectedVoice) return;

  await saveVoice(selectedVoice); // ← Add this line
  
  // Rest of your existing code
  sessionStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
  router.push(`/home/agent/setup/knowledge`);
};
```

Test it:
1. Select a voice
2. Click Continue
3. Check database: `SELECT setup_progress FROM accounts WHERE id = 'your-id';`
4. Should see voice data saved!

**Option B: Full Integration**

See `SETUP_PROGRESS_IMPLEMENTATION_PLAN.md` for detailed code for ALL 5 steps.

## Files Ready to Use

### Backend (Already Integrated)
```
✅ apps/backend/src/setup/
   ✅ setup.module.ts
   ✅ setup.service.ts
   ✅ setup.controller.ts
   ✅ dto/setup-progress.dto.ts
   ✅ index.ts

✅ apps/backend/src/app.module.ts (SetupModule imported)
```

### Frontend (Ready to Import)
```
✅ apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/
   ✅ setup-api.ts
   ✅ use-setup-progress.tsx
```

### Database
```
✅ packages/prisma/schema.prisma (Account model updated)
✅ packages/prisma/migrations/20260211000001_add_setup_progress/
   ✅ migration.sql
```

## API Usage Examples

### Save Voice Selection

```typescript
import { saveVoiceProgress } from './_lib/setup-api';

await saveVoiceProgress(accountId, {
  voiceId: '123',
  name: 'Sarah',
  provider: 'elevenlabs',
  gender: 'female',
  accent: 'american',
  description: 'Professional and friendly',
});
```

### Save Knowledge Base

```typescript
import { saveKnowledgeProgress } from './_lib/setup-api';

await saveKnowledgeProgress(accountId, [
  { id: 'vapi-file-1', name: 'services.pdf', size: 12345 },
  { id: 'vapi-file-2', name: 'hours.pdf', size: 67890 },
]);
```

### Save Phone Integration

```typescript
import { savePhoneProgress } from './_lib/setup-api';

await savePhoneProgress(accountId, {
  method: 'sip',
  settings: { /* SIP trunk settings */ },
});
```

### Get Saved Progress

```typescript
import { getSetupProgress } from './_lib/setup-api';

const progress = await getSetupProgress(accountId);

if (progress.progress.voice) {
  // User has saved voice selection
  const savedVoice = progress.progress.voice.data;
}
```

## Using React Hook (Easiest Way)

```typescript
import { useSetupProgress } from './_lib/use-setup-progress';

function MySetupPage({ accountId }) {
  const {
    progress,      // All saved progress
    lastStep,      // Last step user completed
    saveVoice,     // Save voice function
    saveKnowledge, // Save knowledge function
    savePhone,     // Save phone function
    isSaving,      // Loading state
  } = useSetupProgress(accountId);

  // Load saved data
  useEffect(() => {
    if (progress.voice) {
      setSelectedVoice(progress.voice.data);
    }
  }, [progress]);

  // Save on continue
  const handleContinue = async () => {
    await saveVoice(selectedVoiceData);
    router.push('/next-step');
  };
}
```

## Testing Your Implementation

### 1. Test Save
```bash
# Complete voice selection
# Click Continue
# Check browser console - should see success
# Check database:
psql -d your_database -c "SELECT setup_progress FROM accounts WHERE id='your-account-id';"
```

### 2. Test Load
```bash
# Navigate away from setup
# Come back to setup
# Voice should be pre-selected
```

### 3. Test Out-of-Order
```bash
# Go to Step 4 (Phone) directly
# Complete it and save
# Go to Step 2 (Knowledge)
# Complete it and save
# Both should be in database independently
```

## Benefits of This Implementation

1. **User-Friendly**: Save anywhere, resume anywhere
2. **Flexible**: Complete steps in any order
3. **Reliable**: Database-backed, not just browser storage
4. **Type-Safe**: Full TypeScript support
5. **Scalable**: Easy to add more steps
6. **Testable**: Clear API boundaries

## What's Next?

After running the migration, you have two paths:

### Path A: Gradual Integration (Recommended)
1. Run migration ✅
2. Test backend API manually ✅
3. Integrate ONE step at a time
4. Test each step thoroughly
5. Move to next step

### Path B: Full Integration
1. Run migration ✅
2. Integrate all 5 steps at once
3. Test end-to-end
4. Fix any issues

## Documentation

- **Technical Details**: `docs/SETUP_PROGRESS_TRACKING.md`
- **Implementation Guide**: `SETUP_PROGRESS_IMPLEMENTATION_PLAN.md`
- **This File**: Quick start and overview

## Estimated Integration Time

- Migration: 5 minutes
- Backend restart: 2 minutes
- Test one step: 30 minutes
- Integrate all steps: 3-4 hours
- Full testing: 1-2 hours

**Total**: ~5-6 hours for complete integration

---

## Need Help?

All the code is ready. The hooks handle:
- ✅ API calls
- ✅ Error handling
- ✅ Loading states
- ✅ Caching
- ✅ Type safety

You just need to:
1. Import the hook
2. Call the save function
3. Load the progress

See the implementation plan for exact code to add to each page!
