# PMS Integration - Updated Design (Provider-Agnostic)

## ✅ Changes Made

### 1. **Removed Provider Selection from User Interface**
- Users no longer see "Sikka" or "Kolla" options
- Provider selection happens behind the scenes (currently defaults to Sikka)
- System is designed to be flexible and support multiple providers

### 2. **Simplified Wizard Flow**
Reduced from 4 steps to 3 steps:

**Step 1: Credentials**
- Application ID
- Secret Key  
- Practice ID (optional)

**Step 2: Configuration**
- Default appointment duration
- Timezone
- Feature toggles (online booking, SMS/email reminders)

**Step 3: Test Connection**
- Validates credentials
- Shows available features
- Confirms integration

### 3. **Integrated into Setup Flow**
- Added PMS integration as a prominent option in the Integrations page
- Shows as "Practice Management Integration" with feature badges
- Flows naturally: Integrations → Connect PMS → Continue to Phone Setup

### 4. **Fixed Import Error**
- Removed dependency on `@kit/supabase/server-client`
- Used existing `loadUserWorkspace()` helper instead
- Follows project conventions

## 🏗️ Architecture Benefits

### Extensible Design
The backend is designed to support multiple PMS providers:

```typescript
// Backend automatically selects provider
// Can add logic to:
// 1. Auto-detect provider from credentials
// 2. Use config to specify provider per account
// 3. Try multiple providers in fallback chain

const pmsService = createPmsService(
  provider, // 'SIKKA', 'KOLLA', 'DENTRIX', etc.
  accountId,
  credentials,
  config
);
```

### Provider-Specific Logic (Internal)
```typescript
// In API route
export async function POST(request: NextRequest) {
  const { credentials, config } = await request.json();
  
  // Auto-detect or configure provider
  const provider = detectProvider(credentials) || 'SIKKA';
  
  const response = await fetch('/api/pms/setup', {
    method: 'POST',
    body: JSON.stringify({
      provider, // Internal only
      credentials,
      config,
    }),
  });
}
```

### Adding New Providers
To add a new provider (e.g., Kolla):

1. **Create service implementation**:
```typescript
// apps/frontend/packages/shared/src/pms/kolla.service.ts
export class KollaPmsService extends BasePmsService {
  // Implement all methods
}
```

2. **Update factory**:
```typescript
// apps/frontend/packages/shared/src/pms/index.ts
export function createPmsService(provider, accountId, credentials, config) {
  switch (provider) {
    case 'SIKKA':
      return new SikkaPmsService(accountId, credentials, config);
    case 'KOLLA':
      return new KollaPmsService(accountId, credentials, config); // ✅ New
    // ...
  }
}
```

3. **No UI changes needed!** Users still just enter credentials.

## 📋 User Experience

### From User's Perspective:

1. **Navigate to Integrations page** during setup
2. **See "Practice Management Integration"** option with feature badges
3. **Click "Connect PMS"**
4. **Enter API credentials** (no mention of Sikka/Kolla)
5. **Configure settings** (duration, reminders, etc.)
6. **Test connection**
7. **Continue to next step**

Users never know whether they're using Sikka, Kolla, or any other provider - it just works!

## 🎯 Integration Points

### From Integrations Page:
```
/home/agent/setup/integrations
  ↓ [Connect PMS button]
/home/agent/setup/pms
  ↓ [Complete setup]
/home/agent/setup/phone
```

### Setup Flow:
```
1. Voice Selection       [Step 0]
2. Knowledge Base        [Step 1]
3. Integrations          [Step 2] ← PMS option here
   └─ PMS Setup         [Step 2] ← 3-step wizard
4. Phone Integration     [Step 3]
5. Review & Launch       [Step 4]
```

## 🔧 Technical Implementation

### Files Modified:

1. **`apps/frontend/apps/web/app/home/(user)/agent/setup/pms/page.tsx`**
   - Fixed import errors
   - Uses `loadUserWorkspace()` instead of Supabase client
   - Simplified to 3-step flow

2. **`apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx`**
   - Removed provider selection step
   - Simplified to 3 steps
   - Provider defaults to SIKKA internally
   - Extensible for future providers

3. **`apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx`**
   - Added real PMS integration option
   - Shows feature badges
   - Prominent "Connect PMS" button
   - Moved "Coming Soon" integrations to separate section

### Backend (No Changes Needed):
- API already supports multiple providers
- Factory pattern allows easy provider addition
- All routes are provider-agnostic

## 🚀 Future Provider Addition

When you want to add Kolla (or any other provider):

### 1. Implement Service
```typescript
// kolla.service.ts
export class KollaPmsService extends BasePmsService {
  async testConnection() { /* Kolla-specific */ }
  async bookAppointment(data) { /* Kolla-specific */ }
  // ... implement all methods
}
```

### 2. Update Factory
```typescript
case 'KOLLA':
  return new KollaPmsService(accountId, credentials as KollaCredentials, config);
```

### 3. Optional: Add Auto-Detection
```typescript
function detectProvider(credentials: any): PmsProvider {
  if (credentials.applicationId && credentials.secretKey) {
    return 'SIKKA';
  }
  if (credentials.apiKey && credentials.apiKey.startsWith('kc.')) {
    return 'KOLLA';
  }
  throw new Error('Unable to detect provider from credentials');
}
```

### 4. That's It!
No UI changes needed - the wizard stays the same!

## 📝 Credential Formats

### Sikka Format (Current):
```typescript
{
  applicationId: string,
  secretKey: string,
  practiceId?: string
}
```

### Kolla Format (Future):
```typescript
{
  apiKey: string // Format: kc.xxxxx
}
```

### Generic Format (Extensible):
```typescript
{
  [key: string]: string | number | boolean | undefined
}
```

## 🎨 UI Improvements

### Before:
- ❌ Exposed provider names (Sikka, Kolla)
- ❌ 4-step wizard
- ❌ Users had to choose provider
- ❌ Not integrated into setup flow

### After:
- ✅ Provider-agnostic terminology
- ✅ 3-step wizard (simpler)
- ✅ System handles provider selection
- ✅ Fully integrated into setup flow
- ✅ Clear feature badges
- ✅ Professional appearance

## 🔐 Security

- Credentials are still encrypted with AES-256
- HIPAA audit logging unchanged
- Provider type stored in database but not exposed to user
- Flexible enough to support different security requirements per provider

---

**Summary**: The PMS integration is now provider-agnostic from the user's perspective, while maintaining full flexibility to support multiple providers behind the scenes. Users simply enter their API credentials and the system handles the rest!
