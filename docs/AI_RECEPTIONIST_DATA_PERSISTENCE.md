# AI Receptionist Data Persistence & Recovery

## What We Store

All AI receptionist configuration is stored in the `accounts` table under `phoneIntegrationSettings` JSON field, associated with the clinic's `accountId`.

### Complete Data Structure

```json
{
  // Core Vapi IDs (for recreation)
  "vapiAssistantId": "assistant-xyz123",
  "vapiSquadId": "squad-abc456",
  "vapiPhoneId": "phone-def789",
  
  // Voice Configuration
  "voiceConfig": {
    "id": "rachel-11labs",
    "name": "Rachel",
    "provider": "11labs",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "gender": "female",
    "accent": "American",
    "description": "Warm and professional voice"
  },
  
  // Knowledge Base (NEW - Now Saved!)
  "knowledgeBaseFileIds": [
    "vapi-file-id-1",
    "vapi-file-id-2",
    "vapi-file-id-3"
  ],
  
  // Phone Integration
  "phoneNumber": "+15551234567",
  "businessName": "Example Clinic",
  
  // Timestamps
  "deployedAt": "2024-02-07T19:00:00Z"
}
```

### Database Schema

```prisma
model Account {
  id                       String  @id
  name                     String
  phoneIntegrationMethod   String? @default("none")
  phoneIntegrationSettings Json?   @default("{}")
  // ... other fields
}
```

## What Can Be Recreated

With the stored data, you can fully recreate:

### ✅ **Assistant**
```typescript
const assistant = await vapiService.createAssistant({
  name: `${businessName} - Receptionist`,
  voice: {
    provider: voiceConfig.provider,
    voiceId: voiceConfig.voiceId,
  },
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: generateSystemPrompt(businessName, voiceConfig.name),
    knowledgeBase: {
      provider: 'canonical',
      topK: 5,
      fileIds: knowledgeBaseFileIds, // ← Files persisted!
    },
  },
  firstMessage: `Hi, welcome to ${businessName}! I'm ${voiceConfig.name}...`,
});
```

### ✅ **Squad**
```typescript
const squad = await vapiService.createSquad({
  name: `${businessName} Squad`,
  members: [{
    assistantId: assistant.id,
    assistantDestinations: [],
  }],
});
```

### ✅ **Phone Number**
```typescript
const vapiPhone = await vapiService.importPhoneNumber(
  phoneNumber,
  twilioAccountSid,
  twilioAuthToken,
  squad.id,
  true
);
```

## Recovery Scenarios

### Scenario 1: Vapi Resources Deleted

If someone accidentally deletes the assistant/squad in Vapi:

```typescript
async function recreateReceptionist(accountId: string) {
  // 1. Load saved config from database
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { phoneIntegrationSettings: true, name: true },
  });
  
  const config = account.phoneIntegrationSettings as any;
  
  // 2. Recreate assistant (with same voice & knowledge base!)
  const assistant = await vapiService.createAssistant({
    name: `${config.businessName} - Receptionist`,
    voice: {
      provider: config.voiceConfig.provider,
      voiceId: config.voiceConfig.voiceId,
    },
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: generateSystemPrompt(config),
      knowledgeBase: {
        provider: 'canonical',
        topK: 5,
        fileIds: config.knowledgeBaseFileIds, // ← Files still exist in Vapi!
      },
    },
    firstMessage: config.voiceConfig.firstMessage,
  });
  
  // 3. Recreate squad
  const squad = await vapiService.createSquad({
    name: `${config.businessName} Squad`,
    members: [{ assistantId: assistant.id }],
  });
  
  // 4. Update phone number to point to new squad
  await vapiService.updatePhoneNumber(
    config.vapiPhoneId,
    squad.id,
    true
  );
  
  // 5. Update database with new IDs
  await prisma.account.update({
    where: { id: accountId },
    data: {
      phoneIntegrationSettings: {
        ...config,
        vapiAssistantId: assistant.id,
        vapiSquadId: squad.id,
        recoveredAt: new Date().toISOString(),
      },
    },
  });
  
  return { success: true, assistant, squad };
}
```

### Scenario 2: Knowledge Base Files Deleted

Files in Vapi are persistent until explicitly deleted. If they're lost:

1. **Files still uploaded?** Use saved `knowledgeBaseFileIds` to re-attach
2. **Files deleted?** User must re-upload from their local copies
3. **Consider:** Store original file names for user reference

```json
{
  "knowledgeBaseFiles": [
    {
      "vapiFileId": "file-123",
      "originalName": "business-hours.pdf",
      "uploadedAt": "2024-02-07"
    }
  ]
}
```

### Scenario 3: Account Migration

Moving clinic to new account:

```typescript
async function migrateReceptionist(
  sourceAccountId: string,
  targetAccountId: string
) {
  // 1. Get source config
  const sourceConfig = await getAccountConfig(sourceAccountId);
  
  // 2. Recreate everything in target account
  const result = await recreateReceptionist(targetAccountId, sourceConfig);
  
  // 3. Optionally delete old resources
  await vapiService.deleteAssistant(sourceConfig.vapiAssistantId);
  await vapiService.deleteSquad(sourceConfig.vapiSquadId);
  
  return result;
}
```

## What's NOT Automatically Recoverable

### ⚠️ **Call History**
- Stored in Vapi, not in our database
- Must be exported from Vapi before deletion
- Consider: Periodic backup of call logs

### ⚠️ **Call Recordings**
- Stored in Vapi's storage
- Must be backed up separately
- Consider: Sync to own S3 bucket

### ⚠️ **Analytics Data**
- Not currently tracked
- Consider: Store call metrics in database

## Enhancements for Full Recovery

### 1. Store Complete Assistant Config

```json
{
  "assistantConfig": {
    "voice": {...},
    "model": {
      "provider": "openai",
      "model": "gpt-4o",
      "systemPrompt": "full prompt here",
      "temperature": 0.7,
      "maxTokens": 500
    },
    "firstMessage": "...",
    "recordingEnabled": true,
    "endCallFunctionEnabled": true
  }
}
```

### 2. Store Knowledge Base Metadata

```json
{
  "knowledgeBase": {
    "files": [
      {
        "vapiFileId": "file-123",
        "originalName": "hours.pdf",
        "size": 12345,
        "mimeType": "application/pdf",
        "uploadedAt": "2024-02-07",
        "checksum": "md5hash"
      }
    ],
    "topK": 5,
    "provider": "canonical"
  }
}
```

### 3. Backup Call Logs

```typescript
// Periodic job
async function backupCallLogs(accountId: string) {
  const config = await getAccountConfig(accountId);
  const calls = await vapiService.listCalls({
    assistantId: config.vapiAssistantId,
  });
  
  // Store in database
  await prisma.callLog.createMany({
    data: calls.map(call => ({
      accountId,
      vapiCallId: call.id,
      from: call.customer.number,
      to: call.phoneNumber.number,
      duration: call.duration,
      cost: call.cost,
      transcript: call.transcript,
      recordingUrl: call.recordingUrl,
      createdAt: call.createdAt,
    })),
  });
}
```

## Current Status

✅ **Saved:**
- Vapi Assistant ID
- Vapi Squad ID  
- Vapi Phone ID
- Voice Configuration (provider, ID, name, etc.)
- **Knowledge Base File IDs** (NEW!)
- Phone Number
- Business Name
- Deployment timestamp

❌ **Not Saved:**
- Call history
- Call recordings
- Analytics/metrics
- System prompt (can regenerate)
- Full assistant config (can regenerate)

## Recommendation

**For MVP:** Current setup is sufficient. You can recreate the assistant/squad/phone with the same voice and knowledge base.

**For Production:** Add:
1. Call log backup (daily cron job)
2. Recording backup to S3
3. Analytics table for metrics
4. File metadata for better UX

## Testing Recovery

```typescript
// Test script
async function testRecovery() {
  const accountId = 'test-account-123';
  
  // 1. Save current state
  const originalConfig = await getAccountConfig(accountId);
  
  // 2. Delete Vapi resources
  await vapiService.deleteAssistant(originalConfig.vapiAssistantId);
  await vapiService.deleteSquad(originalConfig.vapiSquadId);
  
  // 3. Recreate
  const recovered = await recreateReceptionist(accountId);
  
  // 4. Verify
  assert(recovered.assistant.voice.voiceId === originalConfig.voiceConfig.voiceId);
  assert(recovered.assistant.model.knowledgeBase.fileIds.length === originalConfig.knowledgeBaseFileIds.length);
  
  console.log('✅ Recovery successful!');
}
```

## Summary

🟢 **Knowledge base files ARE NOW persisted** (fixed!)  
🟢 **Voice config IS persisted**  
🟢 **All Vapi IDs ARE persisted**  
🟢 **Phone integration IS persisted**  
🟢 **Can recreate assistant/squad from saved data**  
🟡 **Call history NOT persisted** (future enhancement)  
🟡 **Recordings NOT backed up** (future enhancement)  

**Bottom line:** You can fully recreate the AI receptionist with the same voice and knowledge base! 🎉
