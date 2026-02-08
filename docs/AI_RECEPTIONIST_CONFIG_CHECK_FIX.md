# Receptionist Configuration Check Fix

## Problem

The receptionist dashboard was showing instead of redirecting to setup, even though the receptionist wasn't fully configured.

## Root Cause

The check for `hasReceptionist` was too simple:

```typescript
// ❌ Too simple - only checks method
const hasReceptionist = account?.phoneIntegrationMethod && 
                        account.phoneIntegrationMethod !== 'none';
```

This returned `true` if `phone_integration_method = 'ported'`, even if:
- No Vapi assistant was created
- No squad was configured
- No phone number was provisioned
- Setup was never completed

### What Happened

When testing the old phone setup step, the database was updated with:
```sql
phone_integration_method = 'ported'
phone_integration_settings = '{"areaCode": "514", "businessName": "test"}'
```

But the setup was never completed, so there was no:
- `vapiAssistantId`
- `vapiSquadId`
- `vapiPhoneId`
- `phoneNumber`

## Fix Applied

### 1. ✅ Reset Database for Current User
```sql
UPDATE accounts 
SET phone_integration_method = 'none', 
    phone_integration_settings = '{}' 
WHERE id = 'ca5ecdfd-78ac-4b20-a9ff-ddfa40cbea96';
```

### 2. ✅ Improved Configuration Check Logic

Both pages now check for a **complete** configuration:

```typescript
// ✅ Better - checks for complete configuration
const phoneIntegrationSettings = account?.phoneIntegrationSettings as any;
const hasReceptionist = account?.phoneIntegrationMethod && 
                        account.phoneIntegrationMethod !== 'none' &&
                        phoneIntegrationSettings?.vapiSquadId;  // ← Key check!
```

### Why Check `vapiSquadId`?

The `vapiSquadId` is only set when the **complete deployment** happens (in the Review page). This means:

✅ Assistant was created  
✅ Squad was created  
✅ Phone was imported to Vapi  
✅ Setup was fully completed  

If `vapiSquadId` doesn't exist, the setup was incomplete or never finished.

## Files Modified

1. **Dashboard** (`receptionist/page.tsx`)
   - Updated check to require `vapiSquadId`
   - Redirects to setup if not fully configured

2. **Setup Page** (`receptionist/setup/page.tsx`)
   - Updated check to require `vapiSquadId`
   - Redirects to dashboard only if fully configured

## How It Works Now

### Scenario 1: No Configuration
```
Method: 'none'
Settings: {}
Result: → Redirect to /receptionist/setup ✅
```

### Scenario 2: Partial Configuration (Old Bug)
```
Method: 'ported'
Settings: { businessName: "test", areaCode: "514" }
Result: → Redirect to /receptionist/setup ✅  (was showing dashboard ❌)
```

### Scenario 3: Complete Configuration
```
Method: 'ported'
Settings: {
  businessName: "test",
  vapiAssistantId: "asst_xxx",
  vapiSquadId: "squad_xxx",  ← Key field!
  vapiPhoneId: "phone_xxx",
  phoneNumber: "+15555551234"
}
Result: → Show dashboard ✅
```

## Configuration States

| State | Method | Has `vapiSquadId`? | Behavior |
|-------|--------|-------------------|----------|
| **Not Started** | `'none'` | No | → Setup |
| **Incomplete** | `'ported'` | No | → Setup |
| **Complete** | `'ported'` | Yes | → Dashboard |

## Testing

### Test 1: Fresh User (No Config)
1. Click "AI Receptionist" in menu
2. **Expected:** Redirects to `/home/receptionist/setup`
3. **Expected:** Shows voice selection wizard
4. ✅ **Result:** Works correctly

### Test 2: Partial Config (The Bug)
1. Database has `method = 'ported'` but no `vapiSquadId`
2. Click "AI Receptionist"
3. **Before:** Showed dashboard ❌
4. **After:** Redirects to setup ✅

### Test 3: Complete Config
1. Complete the full setup wizard
2. Database has `vapiSquadId`
3. Click "AI Receptionist"
4. **Expected:** Shows dashboard
5. ✅ **Result:** Works correctly

## Prevention

To prevent this issue in the future, the deployment action (`deployReceptionistAction`) should be atomic:

```typescript
// Either all fields are set, or none are
await prisma.account.update({
  data: {
    phoneIntegrationMethod: 'ported',
    phoneIntegrationSettings: {
      businessName,
      areaCode,
      phoneNumber,          // ← Required
      vapiAssistantId,      // ← Required
      vapiSquadId,          // ← Required (used for check)
      vapiPhoneId,          // ← Required
      voiceConfig,
    },
  },
});
```

If the deployment fails, the method should remain `'none'`.

## Debugging Commands

### Check Account Configuration
```sql
SELECT 
  name,
  phone_integration_method,
  phone_integration_settings->'vapiSquadId' as has_squad,
  jsonb_pretty(phone_integration_settings) as settings
FROM accounts 
WHERE id = '<account_id>';
```

### Reset Configuration
```sql
UPDATE accounts 
SET phone_integration_method = 'none',
    phone_integration_settings = '{}'
WHERE id = '<account_id>';
```

### View All Configured Accounts
```sql
SELECT 
  name,
  phone_integration_method,
  phone_integration_settings->'vapiSquadId' as squad_id
FROM accounts 
WHERE phone_integration_method != 'none';
```

## Summary

✅ **Fixed:** Database reset for current user  
✅ **Improved:** Configuration check now requires `vapiSquadId`  
✅ **Result:** Incomplete setups redirect to wizard, not dashboard  
✅ **Prevention:** Only fully deployed configs show dashboard  

The receptionist setup should now work correctly! 🎉
