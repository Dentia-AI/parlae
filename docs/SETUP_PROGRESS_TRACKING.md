# Setup Progress Tracking Implementation

## Overview

The setup wizard now automatically saves progress to the database as users complete each step. Users can:
- Complete steps in any order
- Save progress without finishing the entire wizard
- Resume where they left off
- Not lose data when navigating away

## Architecture

### Database Schema

**New fields added to `Account` model:**

```prisma
setupProgress     Json?      @default("{}") // Stores progress for each step
setupCompletedAt  DateTime?  // When full setup was completed
setupLastStep     String?    // Last step user was on
```

**Progress Structure:**

```typescript
{
  voice?: {
    data: VoiceSetupData;
    completedAt: string;
  };
  knowledge?: {
    data: { files: KnowledgeBaseFile[] };
    completedAt: string;
  };
  integrations?: {
    data: { pmsProvider, pmsConnectionId, pmsSettings };
    completedAt: string;
  };
  phone?: {
    data: { method, settings };
    completedAt: string;
  };
  review?: {
    paymentCompleted: boolean;
    completedAt: string;
  };
}
```

### Backend API

**Endpoints:**

```
GET    /api/setup/:accountId/progress              # Get current progress
POST   /api/setup/:accountId/voice                 # Save voice selection
POST   /api/setup/:accountId/knowledge             # Save knowledge base
POST   /api/setup/:accountId/integrations          # Save integrations
POST   /api/setup/:accountId/phone                 # Save phone integration
POST   /api/setup/:accountId/review/complete       # Mark review complete
POST   /api/setup/:accountId/complete              # Mark setup complete
DELETE /api/setup/:accountId/progress              # Clear progress (testing)
```

**Files:**
- `/apps/backend/src/setup/setup.service.ts` - Business logic
- `/apps/backend/src/setup/setup.controller.ts` - API endpoints
- `/apps/backend/src/setup/dto/setup-progress.dto.ts` - DTOs
- `/apps/backend/src/setup/setup.module.ts` - Module configuration

### Frontend Integration

**Hooks:**

```typescript
// Main hook for managing setup progress
const {
  progress,           // Current progress data
  lastStep,           // Last completed step
  completedAt,        // When setup was completed
  isLoading,          // Loading state
  saveVoice,          // Save voice progress
  saveKnowledge,      // Save knowledge progress
  saveIntegrations,   // Save integrations progress
  savePhone,          // Save phone progress
  markReviewComplete, // Mark review complete
  markSetupComplete,  // Mark entire setup complete
  isSaving,           // Saving state
} = useSetupProgress(accountId);

// Auto-sync hook (loads DB progress to sessionStorage)
const { synced, isLoading } = useSyncSetupProgress(accountId);
```

**Files:**
- `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/setup-api.ts` - API client
- `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/use-setup-progress.tsx` - React hooks

## Implementation Examples

### Voice Selection (Step 1)

```typescript
import { useSetupProgress } from './_lib/use-setup-progress';

function VoiceSelectionPage({ accountId }) {
  const { saveVoice, progress } = useSetupProgress(accountId);
  
  // Load previously saved voice
  useEffect(() => {
    if (progress.voice) {
      setSelectedVoice(progress.voice.data);
    }
  }, [progress]);

  const handleContinue = async () => {
    if (!selectedVoice) return;

    // Save to database
    try {
      await saveVoice(selectedVoice);
      toast.success('Progress saved!');
      
      // Also keep in sessionStorage for immediate use
      sessionStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
      
      router.push('/home/agent/setup/knowledge');
    } catch (error) {
      toast.error('Failed to save progress');
    }
  };

  return (
    // ... UI
  );
}
```

### Knowledge Base (Step 2)

```typescript
function KnowledgeBasePage({ accountId }) {
  const { saveKnowledge, progress } = useSetupProgress(accountId);
  const [files, setFiles] = useState([]);

  // Load previously saved files
  useEffect(() => {
    if (progress.knowledge) {
      setFiles(progress.knowledge.data.files);
    }
  }, [progress]);

  const handleContinue = async () => {
    // Get successfully uploaded files
    const uploadedFiles = files
      .filter(f => f.status === 'uploaded' && f.vapiFileId)
      .map(f => ({
        id: f.vapiFileId,
        name: f.name,
        size: f.size,
      }));

    // Save to database
    try {
      await saveKnowledge(uploadedFiles);
      toast.success('Progress saved!');
      
      // Keep in sessionStorage
      sessionStorage.setItem('knowledgeBaseFiles', JSON.stringify(uploadedFiles));
      
      router.push('/home/agent/setup/integrations');
    } catch (error) {
      toast.error('Failed to save progress');
    }
  };
}
```

### Phone Integration (Step 4)

```typescript
function PhoneIntegrationPage({ accountId }) {
  const { savePhone, progress } = useSetupProgress(accountId);
  
  // Load previously saved method
  useEffect(() => {
    if (progress.phone) {
      setSelectedMethod(progress.phone.data.method);
      setSettings(progress.phone.data.settings);
    }
  }, [progress]);

  const handleComplete = async () => {
    // Save to database
    try {
      await savePhone({
        method: selectedMethod,
        settings: methodSettings,
      });
      toast.success('Phone integration saved!');
      
      router.push('/home/agent/setup/review');
    } catch (error) {
      toast.error('Failed to save progress');
    }
  };
}
```

### Review & Deploy (Step 5)

```typescript
function ReviewPage({ accountId }) {
  const {
    saveVoice,
    saveKnowledge,
    savePhone,
    markSetupComplete,
    progress,
  } = useSetupProgress(accountId);

  const handleDeploy = async () => {
    try {
      // Deploy receptionist (existing logic)
      const result = await deployReceptionistAction({
        voice: config.voice,
        files: config.files || [],
      });

      if (result.success) {
        // Mark setup as complete
        await markSetupComplete();
        
        setDeployed(true);
        toast.success('AI Receptionist deployed successfully!');
        
        // Clear session storage
        sessionStorage.clear();
      }
    } catch (error) {
      toast.error('Deployment failed');
    }
  };
}
```

## Benefits

### ✅ User Experience
- **No Lost Progress**: Data saved to database, not just browser
- **Resume Anywhere**: Pick up where you left off
- **Flexible Order**: Complete steps in any order
- **Auto-Save**: Progress saved automatically
- **Device Independent**: Resume on different devices

### ✅ Technical
- **Database Persistence**: All progress in PostgreSQL
- **Type Safety**: Full TypeScript support
- **React Query Integration**: Automatic caching and refetching
- **Validation**: DTOs validate data on backend
- **Audit Trail**: Track completion timestamps

## Migration

**Run migration:**

```bash
cd packages/prisma
npx prisma migrate deploy
```

**Or manually apply:**

```sql
ALTER TABLE "accounts" 
ADD COLUMN "setup_progress" JSONB DEFAULT '{}',
ADD COLUMN "setup_completed_at" TIMESTAMP(3),
ADD COLUMN "setup_last_step" TEXT;
```

## Testing

### Test Progress Saving

```typescript
// 1. Complete voice selection
await saveVoice(accountId, voiceData);

// 2. Verify saved
const progress = await getSetupProgress(accountId);
expect(progress.progress.voice).toBeDefined();

// 3. Navigate away and back
// Progress should be loaded automatically

// 4. Complete more steps out of order
await savePhone(accountId, phoneData); // Skip knowledge & integrations
const updated = await getSetupProgress(accountId);
expect(updated.progress.phone).toBeDefined();
```

### Test Resume Functionality

```typescript
// 1. Start setup on device A
await saveVoice(accountId, voiceData);

// 2. Open on device B
const { progress } = useSetupProgress(accountId);
// Should load voice data from database

// 3. Continue from device B
await saveKnowledge(accountId, files);
```

### Clear Progress (Testing)

```bash
# API endpoint to clear all progress
DELETE /api/setup/:accountId/progress
```

## Future Enhancements

1. **Step Validation**: Enforce step dependencies if needed
2. **Progress Indicators**: Show % complete on dashboard
3. **Draft Assistants**: Create draft assistant during setup
4. **Versioning**: Track setup changes over time
5. **Undo/Redo**: Allow reverting to previous states

## Troubleshooting

### Progress Not Loading

```typescript
// Check if hook is called correctly
const { progress, isLoading } = useSetupProgress(accountId);

if (isLoading) {
  return <Loading />;
}

// Verify accountId is correct
console.log('Account ID:', accountId);
```

### Progress Not Saving

```typescript
// Check for errors
try {
  await saveVoice(voiceData);
} catch (error) {
  console.error('Save failed:', error);
  // Check network tab for API errors
}
```

### SessionStorage vs Database Mismatch

```typescript
// Use sync hook to ensure consistency
const { synced } = useSyncSetupProgress(accountId);

if (!synced) {
  return <Loading />;
}

// Now sessionStorage is synced with database
```

## API Reference

See individual files for detailed API documentation:
- Backend: `/apps/backend/src/setup/`
- Frontend: `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/`

## Summary

The setup progress tracking system provides a robust, user-friendly way to manage the setup wizard flow. Users can now confidently navigate through the wizard knowing their progress is automatically saved and can be resumed at any time.
