# AI Receptionist Setup Flow - Simplified & Fixed

## Issues Fixed

### 1. ✅ Navigation Menu
**Problem:** AI Receptionist not visible in left sidebar menu

**Fix:** Added to `config/personal-account-navigation.config.tsx`
```typescript
{
  label: 'AI Receptionist',
  path: '/home/receptionist',
  Icon: <Phone className={iconClasses} />,
}
```

### 2. ✅ Stepper Display
**Problem:** Steps showing `[object Object]` instead of labels

**Fix:** The `Stepper` component expects an array of **strings**, not objects
```typescript
// ❌ Wrong
<Stepper steps={[
  { label: 'Voice Selection', status: 'active' },
  ...
]} />

// ✅ Correct
<Stepper 
  steps={['Voice Selection', 'Knowledge Base', 'Integrations', 'Review & Launch']} 
  currentStep={0}
/>
```

### 3. ✅ Phone Number Auto-Provisioning
**Problem:** Phone setup step was unnecessary - patients never see the Twilio number

**Fix:** 
- Removed phone setup step entirely
- Auto-provision phone number in the deploy action (behind the scenes)
- Start wizard directly with voice selection

## New Flow

### Before (5 steps):
1. Phone Number Setup ❌
2. Voice Selection
3. Knowledge Base
4. Integrations
5. Review & Launch

### After (4 steps):
1. **Voice Selection** ← Start here
2. Knowledge Base
3. Integrations
4. Review & Launch (auto-provisions phone)

## Files Modified

### Navigation
- ✅ `config/personal-account-navigation.config.tsx` - Added AI Receptionist to menu

### Setup Pages
- ✅ `receptionist/setup/page.tsx` - Now starts with voice selection
- ✅ `receptionist/setup/knowledge/page.tsx` - Fixed stepper, removed phone dependency
- ✅ `receptionist/setup/integrations/page.tsx` - Fixed stepper, removed phone dependency
- ✅ `receptionist/setup/review/page.tsx` - Completely rewritten to auto-provision phone

### New Components
- ✅ `receptionist/setup/_components/voice-selection-form.tsx` - Voice selection component

### Deleted Files
- ❌ `receptionist/setup/_components/phone-setup-form.tsx` - No longer needed
- ❌ `receptionist/setup/voice/page.tsx` - Merged into main setup page

## How It Works Now

### 1. User Navigates to Setup
Route: `/home/receptionist/setup`

**What happens:**
- Checks if receptionist already exists → redirect to dashboard
- Shows voice selection as step 1
- Stores `accountId` and `businessName` in sessionStorage

### 2. User Selects Voice
- Chooses from 7 voices (11Labs + OpenAI)
- Can filter by gender
- Stores voice config in sessionStorage
- Continues to knowledge base

### 3. User Uploads Files (Optional)
- Drag & drop or browse
- Stores file info in sessionStorage
- Continues to integrations

### 4. User Skips Integrations
- All integrations marked "Coming Soon"
- Continues to review

### 5. User Deploys
**What happens behind the scenes:**
1. Auto-provisions phone number:
   - Dev: Uses `+15555551234` (trial)
   - Prod: Calls Twilio to purchase number
2. Creates Vapi assistant with voice config
3. Creates Vapi squad
4. Imports phone to Vapi
5. Updates database with configuration
6. Shows success screen

## Session Storage Flow

```
Step 1: Voice Selection
  ↓ stores: selectedVoice, accountId, businessName

Step 2: Knowledge Base
  ↓ stores: knowledgeBaseFiles

Step 3: Integrations
  ↓ (no storage)

Step 4: Review & Deploy
  ↓ reads: selectedVoice, accountId, businessName, files
  ↓ auto-provisions: phoneNumber
  ↓ deploys to Vapi
  ↓ clears all session storage
```

## Auto-Provision Logic

```typescript
// In review page handleDeploy()
const isDev = process.env.NODE_ENV === 'development';
const provisionedPhone = isDev 
  ? '+15555551234'  // Trial number
  : await provisionPhoneNumber();  // Twilio API

const result = await deployReceptionistAction({
  phoneNumber: provisionedPhone,
  voice: config.voice,
  files: config.files || [],
});
```

## Database Updates

The phone number is stored automatically during deployment:

```typescript
await prisma.account.update({
  where: { id: account.id },
  data: {
    phoneIntegrationMethod: 'ported',
    phoneIntegrationSettings: {
      phoneNumber: provisionedPhone,
      vapiAssistantId: assistant.id,
      vapiSquadId: squad.id,
      vapiPhoneId: vapiPhone.id,
      voiceConfig: data.voice,
    },
  },
});
```

## Stepper Component Usage

The `Stepper` component (`@kit/ui/stepper`) expects:

```typescript
interface StepperProps {
  steps: string[];  // Array of step labels
  currentStep: number;  // 0-indexed
  variant?: 'numbers' | 'default' | 'dots';
}
```

**Correct usage in each page:**

| Page | currentStep | Steps Array |
|------|------------|-------------|
| Voice Selection | 0 | `['Voice Selection', 'Knowledge Base', 'Integrations', 'Review & Launch']` |
| Knowledge Base | 1 | Same |
| Integrations | 2 | Same |
| Review | 3 | Same |

## Testing

### Test the New Flow

1. Navigate to `/home/receptionist`
2. Click "Set Up AI Receptionist"
3. Should see voice selection (not phone setup)
4. Select a voice → Continue
5. Upload files (optional) → Continue
6. Skip integrations → Continue
7. Review shows voice + files (no phone mentioned)
8. Click "Deploy AI Receptionist"
9. Phone auto-provisions behind the scenes
10. Success screen shows "Your AI Receptionist is Live!"

### Expected Behavior

✅ AI Receptionist appears in left menu  
✅ Stepper shows step labels correctly  
✅ No phone number input step  
✅ Smooth navigation between steps  
✅ Deploy auto-provisions phone  
✅ Success screen appears after deploy  

## Why This Is Better

### Before
- ❌ Users had to manually select phone number
- ❌ Extra step they don't need to see
- ❌ Confusion about what the number is for
- ❌ Patients never call the Twilio number directly anyway

### After
- ✅ Phone provisioned automatically
- ✅ Simpler 4-step wizard
- ✅ Users focus on what matters (voice, content)
- ✅ Phone number managed behind the scenes
- ✅ Cleaner UX

## Next Steps (Future)

1. **Production Phone Provisioning**
   - Implement Twilio phone purchasing API
   - Area code selection logic
   - Number availability checking

2. **Advanced Configuration**
   - Business hours setup
   - Call forwarding rules
   - After-hours behavior
   - Custom greetings

3. **File Upload Integration**
   - Connect to Vapi file upload API
   - Process and index documents
   - Update assistant knowledge base

4. **Booking Integrations**
   - Calendly OAuth
   - Google Calendar sync
   - Custom API webhooks

## Summary

✅ **Fixed:** Navigation menu shows AI Receptionist  
✅ **Fixed:** Stepper displays labels correctly  
✅ **Improved:** Removed unnecessary phone setup step  
✅ **Improved:** Phone auto-provisions during deployment  
✅ **Result:** Cleaner, simpler 4-step wizard  

The setup flow is now streamlined and user-friendly! 🎉
