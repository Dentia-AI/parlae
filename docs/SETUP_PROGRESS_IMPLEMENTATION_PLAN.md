# Setup Progress Implementation Plan

## ✅ Phase 1: Database & Backend (COMPLETE)

### Database Schema
- ✅ Added `setupProgress` JSONB field to Account model
- ✅ Added `setupCompletedAt` DateTime field
- ✅ Added `setupLastStep` string field
- ✅ Created migration file

### Backend Module
- ✅ Created SetupService with methods for each step
- ✅ Created SetupController with REST endpoints
- ✅ Created DTOs for type safety
- ✅ Registered SetupModule in AppModule

### API Endpoints Created
- ✅ `GET /api/setup/:accountId/progress` - Get progress
- ✅ `POST /api/setup/:accountId/voice` - Save voice
- ✅ `POST /api/setup/:accountId/knowledge` - Save knowledge
- ✅ `POST /api/setup/:accountId/integrations` - Save integrations
- ✅ `POST /api/setup/:accountId/phone` - Save phone
- ✅ `POST /api/setup/:accountId/review/complete` - Mark review complete
- ✅ `POST /api/setup/:accountId/complete` - Mark setup complete
- ✅ `DELETE /api/setup/:accountId/progress` - Clear progress

## ⏳ Phase 2: Frontend Integration (TODO)

### API Client & Hooks
- ✅ Created `setup-api.ts` with fetch functions
- ✅ Created `use-setup-progress` hook
- ✅ Created `useSyncSetupProgress` hook
- ⏸️ Need to integrate into existing pages

### Update Setup Wizard Pages

#### 1. Voice Selection (`page.tsx` / `voice-selection-page-client.tsx`)

**Changes needed:**
```typescript
// Add at top of component
const { saveVoice, progress } = useSetupProgress(accountId);

// Load saved progress on mount
useEffect(() => {
  if (progress.voice) {
    setSelectedVoice(progress.voice.data);
  }
}, [progress]);

// Update handleContinue to save progress
const handleContinue = async () => {
  if (!selectedVoice) {
    toast.error(t('common:setup.voice.selectVoice'));
    return;
  }

  try {
    // Save to database
    await saveVoice(selectedVoice);
    
    // Keep in sessionStorage for backward compatibility
    sessionStorage.setItem('selectedVoice', JSON.stringify(selectedVoice));
    sessionStorage.setItem('accountId', accountId);
    sessionStorage.setItem('businessName', businessName);
    sessionStorage.setItem('accountEmail', accountEmail);
    
    router.push(`/home/agent/setup/knowledge`);
  } catch (error) {
    toast.error('Failed to save progress');
  }
};
```

#### 2. Knowledge Base (`knowledge/page.tsx`)

**Changes needed:**
```typescript
// Add at top
const { saveKnowledge, progress } = useSetupProgress(accountId);

// Load saved files on mount
useEffect(() => {
  if (progress.knowledge) {
    setFiles(progress.knowledge.data.files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      status: 'uploaded',
      vapiFileId: f.id,
    })));
  }
}, [progress]);

// Update handleContinue
const handleContinue = async () => {
  const uploadedFiles = files
    .filter(f => f.status === 'uploaded' && f.vapiFileId)
    .map(f => ({
      id: f.vapiFileId,
      name: f.name,
      size: f.size,
    }));

  try {
    // Save to database
    await saveKnowledge(uploadedFiles);
    
    // Keep in sessionStorage
    sessionStorage.setItem('knowledgeBaseFiles', JSON.stringify(uploadedFiles));
    
    if (uploadedFiles.length > 0) {
      toast.success(`${uploadedFiles.length} ${t('common:setup.knowledge.filesReady')}`);
    }
    
    router.push(`/home/agent/setup/integrations`);
  } catch (error) {
    toast.error('Failed to save progress');
  }
};
```

#### 3. Integrations (`integrations/page.tsx`)

**Changes needed:**
```typescript
// Add at top
const { saveIntegrations, progress } = useSetupProgress(accountId);

// Load saved integrations on mount
useEffect(() => {
  if (progress.integrations) {
    setPmsConnectionStatus('connected');
    // Load other integration data
  }
}, [progress]);

// Add save function when PMS is connected
const handlePmsConnected = async (pmsData) => {
  try {
    await saveIntegrations({
      pmsProvider: pmsData.provider,
      pmsConnectionId: pmsData.connectionId,
      pmsSettings: pmsData.settings,
    });
    toast.success('PMS integration saved!');
  } catch (error) {
    toast.error('Failed to save integration');
  }
};

// Update continue button
const handleContinue = async () => {
  // Integrations are optional, so just navigate
  router.push('/home/agent/setup/phone');
};
```

#### 4. Phone Integration (`phone/page.tsx`)

**Changes needed:**
```typescript
// Add at top
const { savePhone, progress } = useSetupProgress(accountId);

// Load saved phone method on mount
useEffect(() => {
  if (progress.phone) {
    setSelectedMethod(progress.phone.data.method);
    setTempSelectedMethod(progress.phone.data.method);
    sessionStorage.setItem('phoneIntegrationMethod', progress.phone.data.method);
  }
}, [progress]);

// Update handleComplete
const handleComplete = async () => {
  try {
    // Save to database
    await savePhone({
      method: selectedMethod,
      settings: {} // Add actual settings if any
    });
    
    toast.success('Phone integration saved!');
    router.push('/home/agent/setup/review');
  } catch (error) {
    toast.error('Failed to save phone integration');
  }
};
```

#### 5. Review & Launch (`review/page.tsx`)

**Changes needed:**
```typescript
// Add at top
const { markSetupComplete, progress } = useSetupProgress(accountId);

// Load all saved data on mount
useEffect(() => {
  if (progress.voice) {
    setConfig(prev => ({ ...prev, voice: progress.voice.data }));
  }
  if (progress.knowledge) {
    setConfig(prev => ({ ...prev, files: progress.knowledge.data.files }));
  }
}, [progress]);

// Update handleDeploy
const handleDeploy = async () => {
  if (!config.voice) {
    toast.error(t('common:setup.review.voiceMissing'));
    return;
  }

  startTransition(async () => {
    try {
      const result = await deployReceptionistAction({
        voice: config.voice,
        files: config.files || [],
      });

      if (result.success) {
        // Mark setup as complete
        await markSetupComplete();
        
        setDeployed(true);
        setPhoneNumber(result.phoneNumber || 'Provisioned');
        toast.success(t('common:setup.review.deploySuccess'));
        
        // Clear session storage
        sessionStorage.removeItem('selectedVoice');
        sessionStorage.removeItem('knowledgeBaseFiles');
        sessionStorage.removeItem('accountId');
        sessionStorage.removeItem('businessName');
      } else {
        toast.error(result.error || t('common:setup.review.deployError'));
      }
    } catch (error) {
      toast.error(t('common:setup.review.deployErrorGeneric'));
      console.error(error);
    }
  });
};
```

## ⏳ Phase 3: Testing & Validation (TODO)

### Unit Tests
- ⏸️ Test SetupService methods
- ⏸️ Test API endpoints
- ⏸️ Test React hooks

### Integration Tests
- ⏸️ Test save/load flow
- ⏸️ Test resume functionality
- ⏸️ Test out-of-order completion

### E2E Tests
- ⏸️ Complete wizard flow
- ⏸️ Partial completion and resume
- ⏸️ Multi-device testing

## 📋 Checklist for Completion

### Backend
- [x] Database schema updated
- [x] Migration created
- [x] Service created
- [x] Controller created
- [x] Module registered
- [ ] Run migration in development
- [ ] Test API endpoints
- [ ] Add authentication checks

### Frontend
- [x] API client created
- [x] Hooks created
- [ ] Integrate into voice selection page
- [ ] Integrate into knowledge base page
- [ ] Integrate into integrations page
- [ ] Integrate into phone integration page
- [ ] Integrate into review page
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add success notifications

### Documentation
- [x] Technical documentation
- [x] Implementation plan
- [ ] User guide
- [ ] API documentation

### Deployment
- [ ] Run migration in staging
- [ ] Test in staging environment
- [ ] Run migration in production
- [ ] Monitor for errors

## Next Steps

1. **Run Migration** (Development)
   ```bash
   cd packages/prisma
   npx prisma migrate dev
   ```

2. **Test Backend APIs** (Postman/Insomnia)
   - Test each endpoint with sample data
   - Verify data saves correctly
   - Check error handling

3. **Integrate Frontend** (Update each page)
   - Start with voice selection
   - Then knowledge base
   - Then integrations
   - Then phone
   - Finally review

4. **Test Full Flow**
   - Complete all steps
   - Navigate away mid-flow
   - Resume and verify data loads
   - Complete from different steps

5. **Deploy**
   - Test in staging
   - Run production migration
   - Monitor logs

## Estimated Time

- **Backend Integration**: ✅ Complete (2 hours)
- **Frontend Updates**: ⏸️ Pending (3-4 hours)
- **Testing**: ⏸️ Pending (2 hours)
- **Documentation**: ✅ Complete (1 hour)
- **Total**: ~8 hours (5 hours remaining)

## Notes

- Current implementation uses sessionStorage for immediate state
- New system saves to database for persistence
- Both will work together during transition
- Can gradually remove sessionStorage dependencies
- React Query handles caching and refetching automatically
