# Access Control & UI Reorganization

## Summary

Implemented access control for advanced setup and reorganized the UI with improved naming and data flow.

**URL Change:** All routes changed from `/home/receptionist/*` to `/home/setup/*`

## Changes Made

### 1. Database Schema Update ✅

**File:** `packages/prisma/schema.prisma`

Added new field to `Account` model:

```prisma
advancedSetupEnabled Boolean @default(false) @map("advanced_setup_enabled")
```

**Migration:** `migrations/20260204000000_add_advanced_setup_access/migration.sql`

```sql
ALTER TABLE "accounts" ADD COLUMN "advanced_setup_enabled" BOOLEAN NOT NULL DEFAULT false;
```

---

### 2. Advanced Setup Access Control ✅

**File:** `app/home/(user)/receptionist/advanced/page.tsx`

**Server Component** that checks access permission:

```typescript
const account = await prisma.account.findUnique({
  where: { id: workspace.workspace.id },
  select: {
    id: true,
    advancedSetupEnabled: true,
  },
});

const hasAccess = account?.advancedSetupEnabled ?? false;
```

**Locked State UI** (shown when `advancedSetupEnabled = false`):
- 🔒 Lock icon with amber color scheme
- Clear message: "Access Required"
- Professional explanation about why settings are locked
- Contact admin instruction with Mail icon
- Note that standard setup is sufficient for most users

**Access Granted State** (shown when `advancedSetupEnabled = true`):
- Full advanced setup interface with all 6 configuration tabs
- Save/Reset functionality
- Danger zone for destructive actions

---

### 3. Advanced Setup Content Component ✅

**File:** `app/home/(user)/receptionist/advanced/_components/advanced-setup-content.tsx`

**Client component** with full Vapi configuration:

**6 Tabs:**
1. **Assistant** - First message, end call function
2. **Voice** - Provider, ID, stability, similarity
3. **Model** - Provider, model name, system prompt, temperature, max tokens
4. **Recording** - Call recording toggle, post-call analysis
5. **Webhooks** - Server URL, server secret
6. **Advanced** - HIPAA mode, background sound, danger zone

---

### 4. Renamed "AI Receptionist" to "AI Agents" ✅

**Files Updated:**
- `config/personal-account-navigation.config.tsx`
- `app/home/(user)/receptionist/page.tsx`

**Navigation Structure:**
```
Setup (top-level)
├─ AI Agents (main setup wizard)
└─ Advanced Setup (restricted, 🔒 by default)
```

**Page Changes:**
- Title: "AI Receptionist" → "AI Agents"
- Description: "phone receptionist" → "phone agents"
- Button: "Settings" → "Phone Settings"

---

### 5. Moved Call Logs to Dashboard ✅

**File:** `app/home/(user)/page.tsx`

**Added to main dashboard:**

```typescript
// New AI Agent Activity Section
<div className="space-y-4">
  <h2>AI Agent Activity</h2>
  <Badge>Live</Badge>
  
  // Stats: Calls Today, Avg Duration, Appointments, Success Rate
  <StatCard label="Calls Today" value={0} />
  <StatCard label="Avg. Duration" value="0:00" />
  <StatCard label="Appointments Booked" value={0} />
  <StatCard label="Success Rate" value="--" />
  
  // Recent Calls Card
  <Card>
    <CardTitle>Recent Calls</CardTitle>
    <CardContent>No calls yet...</CardContent>
  </Card>
</div>
```

**Removed from AI Agents page:**
- ~~4 stat cards (Calls Today, Avg Duration, Appointments, Success Rate)~~
- ~~Recent Calls card~~

**Replaced with:**
- Quick Actions cards (Reconfigure Agent, Phone Settings)
- Simplified stats (3 cards: Active Agents, Calls Today, Success Rate)

---

## User Flows

### Standard User (No Advanced Access)

```
Login → Dashboard (see call logs)
  ↓
Setup → AI Agents (configure voice, knowledge base, phone)
  ↓
Setup → Advanced Setup
  ↓
🔒 LOCKED: "Contact administrator for access"
```

### Admin Grants Access

```sql
UPDATE accounts
SET advanced_setup_enabled = true
WHERE id = 'user-account-id';
```

### Power User (With Advanced Access)

```
Login → Dashboard (see call logs)
  ↓
Setup → AI Agents (configure voice, knowledge base, phone)
  ↓
Setup → Advanced Setup
  ↓
✅ UNLOCKED: Full Vapi configuration interface
  ├─ Assistant settings
  ├─ Voice fine-tuning
  ├─ Model configuration
  ├─ Recording & analysis
  ├─ Webhook integration
  └─ HIPAA & advanced features
```

---

## Access Control Logic

**Database Flag:**
```typescript
advancedSetupEnabled: Boolean @default(false)
```

**Server-Side Check:**
```typescript
const hasAccess = account?.advancedSetupEnabled ?? false;

if (!hasAccess) {
  return <LockedStateUI />;
}

return <AdvancedSetupContent />;
```

**Admin Action Required:**
Admins must manually enable access via:
1. Database update (SQL query)
2. Future admin panel (to be implemented)
3. Impersonation + self-enable (for testing)

---

## UI Changes Summary

| Location | Before | After |
|----------|--------|-------|
| Navigation Menu | "AI Receptionist" | "AI Agents" (under "Setup") |
| Navigation Submenu | "Advanced Setup" | "Advanced Setup" (🔒 locked by default) |
| Dashboard | No call stats | "AI Agent Activity" section with call stats |
| AI Agents Page | Call stats + Recent calls | Quick actions + simplified stats |
| Advanced Setup | Always accessible | Access-controlled with lock screen |

---

## Messages & Copy

### Lock Screen Message

**Heading:** "Access Required"

**Body:**
> Advanced setup is restricted and only available in exceptional cases. The default configuration is optimized for most use cases and typically does not require modification.

**Alert Box:**
> If you believe you need access to advanced settings, please contact your administrator. They can review your request and enable access if appropriate.

**Note:**
> **Note:** Standard setup options available in the main wizard are sufficient for the majority of configurations.

---

## Migration Steps

### 1. Run Database Migration

```bash
cd packages/prisma
npx prisma migrate dev --name add_advanced_setup_access
npx prisma generate
```

### 2. Restart Dev Server

```bash
# The server must be restarted to pick up the new Prisma client
npm run dev
```

### 3. Test Access Control

**Without Access:**
```bash
# Navigate to /home/receptionist/advanced
# Should see lock screen
```

**Grant Access (for testing):**
```sql
UPDATE accounts
SET advanced_setup_enabled = true
WHERE primary_owner_user_id = '<your-user-id>';
```

**With Access:**
```bash
# Navigate to /home/receptionist/advanced
# Should see full advanced setup UI
```

---

## Future Enhancements

### Admin Panel for Access Management
```
Admin → User Management → [User] → Permissions
  ├─ Advanced Setup Access: [ ] Enabled
  └─ Reason: [Text field for justification]
```

### Access Request System
```
User → Advanced Setup (locked)
  ↓
"Request Access" button
  ↓
Admin receives notification
  ↓
Admin approves/denies with reason
```

### Audit Log
```typescript
interface AdvancedSetupAccessLog {
  accountId: string;
  grantedBy: string;
  grantedAt: DateTime;
  reason: string;
  revokedBy?: string;
  revokedAt?: DateTime;
}
```

---

## Testing Checklist

- [ ] Navigate to dashboard, verify "AI Agent Activity" section appears
- [ ] Navigate to "Setup → AI Agents", verify page title is "AI Agents"
- [ ] Navigate to "Setup → Advanced Setup", verify lock screen appears
- [ ] Run migration, verify `advanced_setup_enabled` column exists
- [ ] Grant access via SQL, refresh page, verify full UI appears
- [ ] Test all 6 tabs in advanced setup
- [ ] Verify Save/Reset buttons work
- [ ] Revoke access, verify lock screen returns

---

## Files Changed

### New Files
- `packages/prisma/migrations/20260204000000_add_advanced_setup_access/migration.sql`
- `app/home/(user)/receptionist/advanced/_components/advanced-setup-content.tsx`
- `docs/ACCESS_CONTROL_IMPLEMENTATION.md` (this file)

### Modified Files
- `packages/prisma/schema.prisma`
- `app/home/(user)/receptionist/advanced/page.tsx`
- `app/home/(user)/receptionist/page.tsx`
- `app/home/(user)/page.tsx`
- `config/personal-account-navigation.config.tsx`

---

## Summary

✅ **Advanced Setup:** Locked by default, requires admin approval  
✅ **Access Control:** Database flag + server-side check  
✅ **Professional UI:** Lock screen with clear messaging  
✅ **Call Logs:** Moved to main dashboard  
✅ **Renaming:** "AI Receptionist" → "AI Agents"  
✅ **Navigation:** Reorganized with "Setup" parent menu
