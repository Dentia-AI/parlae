# Vapi Squad "Deleted Assistants" Fix

## Problem

When creating a squad with **inline assistant definitions**, the Vapi dashboard showed the assistants as "deleted" with the error:
```
"This assistant has been deleted. Please remove this member from the squad."
```

## Root Cause

Vapi's squad API expects **assistant IDs** (references to existing assistants), not inline assistant configurations. When you pass an inline config, Vapi may create temporary assistants that get cleaned up or marked as deleted.

## Solution

**Create assistants FIRST, then reference them by ID in the squad:**

### Before (Broken) ❌
```typescript
const squad = await vapiService.createSquad({
  name: 'Test Squad',
  members: [
    {
      assistant: {  // ❌ Inline config
        name: 'Receptionist',
        voice: {...},
        model: {...}
      }
    }
  ]
});
```

### After (Fixed) ✅
```typescript
// Step 1: Create assistants individually
const receptionist = await vapiService.createAssistant({
  name: 'Receptionist',
  voice: {...},
  model: {...}
});

const booking = await vapiService.createAssistant({
  name: 'Booking Agent',
  voice: {...},
  model: {...}
});

// Step 2: Create squad with assistant IDs
const squad = await vapiService.createSquad({
  name: 'Test Squad',
  members: [
    {
      assistant: receptionist.id,  // ✅ Reference by ID
      assistantDestinations: [...]
    },
    {
      assistant: booking.id  // ✅ Reference by ID
    }
  ]
});
```

## Files Changed

### 1. Setup Action
**File:** `apps/frontend/apps/web/app/admin/setup-vapi/actions.ts`

**Changes:**
- Now creates **2 individual assistants** first:
  - `Parlae Receptionist`
  - `Parlae Booking Agent`
- Then creates the squad with **assistant IDs** (not inline configs)
- Updated cleanup to delete both assistants and squad on failure
- Added assistant details to success response

### 2. UI Page
**File:** `apps/frontend/apps/web/app/admin/setup-vapi/page.tsx`

**Changes:**
- Added "Assistants in Squad" section
- Shows clickable links to each assistant in Vapi dashboard
- Better organization with border separators

## Expected Flow

```
1. Create Receptionist Assistant ✅
   → Returns assistant ID: abc-123

2. Create Booking Assistant ✅
   → Returns assistant ID: def-456

3. Create Squad with [abc-123, def-456] ✅
   → Squad now has valid assistant references

4. Link Phone Number to Squad ✅
   → Calls route to the squad

5. Success! 🎉
   → All resources visible in Vapi dashboard
   → No "deleted" errors
```

## Cleanup Strategy

If any step fails, we now properly clean up ALL resources:

```typescript
if (squadCreationFails) {
  await deleteAssistant(receptionist.id);
  await deleteAssistant(booking.id);
  // Squad not created yet, nothing to delete
}

if (phoneImportFails) {
  await deleteSquad(squad.id);
  await deleteAssistant(receptionist.id);
  await deleteAssistant(booking.id);
  
  // Only release phone if newly purchased
  if (isNewPurchase) {
    await releaseNumber(phone.sid);
  }
}
```

## Testing the Fix

### 1. Refresh the Page
```
http://localhost:3000/admin/setup-vapi
```

### 2. Click "Setup Test Squad"
Expected logs:
```
[Setup Test Agent] Creating assistants in Vapi
[Vapi] Creating assistant: Parlae Receptionist
[Vapi] Successfully created assistant: abc-123
[Vapi] Creating assistant: Parlae Booking Agent
[Vapi] Successfully created assistant: def-456
[Setup Test Agent] Creating squad with assistants
[Vapi] Creating squad
[Vapi] Successfully created squad: xyz-789
[Setup Test Agent] Linking phone to squad
[Vapi] Successfully imported phone number
[Setup Test Agent] Setup complete
```

### 3. Verify in Vapi Dashboard

**Squads Tab:** https://dashboard.vapi.ai/squads
- ✅ See "Parlae Test Squad"
- ✅ Click to view details
- ✅ Both assistants show as ACTIVE (not deleted)

**Assistants Tab:** https://dashboard.vapi.ai/assistants
- ✅ See "Parlae Receptionist"
- ✅ See "Parlae Booking Agent"
- ✅ Both are active and clickable

**Phone Numbers Tab:** https://dashboard.vapi.ai/phone-numbers
- ✅ Your phone number is linked to the squad
- ✅ Click to see squad configuration

### 4. Make a Test Call

```
1. Call the phone number
2. Say: "Hi, I'd like to book an appointment"
3. Receptionist should transfer you
4. Booking Agent asks for your details
5. Full conversation is recorded
```

## Why This Matters

1. **Persistent Assistants**: Created assistants stay in your Vapi account and can be reused
2. **Better Organization**: See all your assistants in one place
3. **Debugging**: Easier to test individual assistants before adding to squads
4. **Flexibility**: Can update assistants without recreating the squad
5. **Correct Architecture**: Matches Vapi's recommended best practices

## Cost Implications

**Before (inline configs):**
- Unknown cleanup behavior
- Potential orphaned resources

**After (explicit creation):**
- 2 Assistants: FREE to create
- 1 Squad: FREE to create
- 1 Phone Number: ~$1.00/month
- Calls: ~$0.01-0.05/minute

Total: Same cost, but cleaner architecture! 🎉

## Related Documentation

- [VAPI_ARCHITECTURE.md](./VAPI_ARCHITECTURE.md) - Multi-tenant architecture
- [VAPI_SQUAD_UPGRADE.md](./VAPI_SQUAD_UPGRADE.md) - Squad creation guide
- [VAPI_TESTING_GUIDE.md](./VAPI_TESTING_GUIDE.md) - Comprehensive testing
- [Vapi Squads Docs](https://docs.vapi.ai/squads) - Official documentation
