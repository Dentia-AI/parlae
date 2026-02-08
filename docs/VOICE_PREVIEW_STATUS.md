# Voice Preview Feature - Current Status

## TL;DR

❌ **Voice audio previews are DISABLED** (by design)  
✅ **Voice descriptions work** (toast notifications)  
✅ **Voice selection works** (can complete setup)  
✅ **Actual receptionist will work perfectly** (Vapi handles TTS in production)  

## Why No Audio?

Voice previews require **TTS provider API keys** (11Labs or OpenAI), not Vapi keys.

**What you have:**
- ✅ `VAPI_API_KEY` - For Vapi platform
- ✅ `VAPI_PUBLIC_KEY` - For Vapi web calls  
- ❌ `ELEVENLABS_API_KEY` - Not in `.env.local`
- ❌ `OPENAI_API_KEY` - Not in `.env.local`

**Why separate keys?**
- Vapi doesn't provide a "voice preview" API
- Vapi handles TTS automatically during *actual calls*
- For *preview during setup*, we need direct TTS provider access
- This is a UX enhancement feature, not required for functionality

## Current Behavior

When user clicks "Preview Voice":

**What happens:**
```
1. Shows toast with voice description
2. Example: "Rachel: Warm and friendly female voice with American accent from 11labs will sound professional and natural when deployed."
3. No audio plays
4. User can still select voice and continue
```

**What doesn't happen:**
```
❌ No actual audio playback
❌ No API calls to 11Labs/OpenAI
❌ No audio element playing
```

## Is This a Problem?

**No, it's fine for MVP because:**

1. ✅ Users can read voice descriptions
2. ✅ Users can select voice based on description
3. ✅ **Voice WILL work in production** (Vapi handles it)
4. ✅ Setup wizard completes successfully
5. ✅ No functionality is blocked

**It's just a UX enhancement** - users would prefer to *hear* the voice, but descriptions work fine.

## How to Enable Audio Previews (Optional)

### Step 1: Get Free API Keys

**11Labs (recommended):**
- Go to [elevenlabs.io/sign-up](https://elevenlabs.io/sign-up)
- Sign up (no credit card required)
- Get API key from Profile → API Keys
- Free tier: 10,000 characters/month (≈33 previews)

**OpenAI:**
- Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Create API key
- New accounts get $5 free credit (≈1,100 previews)

### Step 2: Add to `.env.local`

```bash
# Add these lines to your .env.local file:
ELEVENLABS_API_KEY=sk_your_elevenlabs_key_here
OPENAI_API_KEY=sk-proj-your_openai_key_here
```

### Step 3: Uncomment Code

**File:** `apps/frontend/apps/web/app/home/(user)/receptionist/setup/_components/voice-selection-form.tsx`

**Find the `handlePlayPreview` function (around line 150):**

```typescript
// Currently looks like this (toast-only):
const handlePlayPreview = async (voiceId: string) => {
  // ... setup code ...
  
  // Show info message about preview
  toast.info(
    `${voice.name}: ${voice.description}...`
  );
  
  // Note: Real audio preview requires API keys
  // Uncomment below to enable:
  
  /*
  setPlayingVoice(voiceId);
  
  try {
    const response = await fetch('/api/vapi/voice-preview', {
      // ... API call code ...
    });
    // ... audio playback code ...
  } catch (error) {
    // ... error handling ...
  }
  */
};
```

**Change to:**

```typescript
const handlePlayPreview = async (voiceId: string) => {
  // ... setup code ...
  
  // Comment out the toast-only section:
  /*
  toast.info(
    `${voice.name}: ${voice.description}...`
  );
  */
  
  // Uncomment the API call section:
  setPlayingVoice(voiceId);
  
  try {
    const response = await fetch('/api/vapi/voice-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: voice.provider,
        voiceId: voice.voiceId,
        text: `Hi, welcome to ${businessName}! I'm ${voice.name}. How can I help you today?`,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate preview');
    }

    const data = await response.json();

    if (data.success && data.audio && audioElement) {
      audioElement.src = data.audio;
      await audioElement.play();
      toast.success(`Playing ${voice.name}`);
    }
  } catch (error) {
    console.error('Voice preview error:', error);
    toast.error('Failed to play voice preview. Make sure API keys are configured.');
    setPlayingVoice(null);
  }
};
```

### Step 4: Restart Server

```bash
# Stop current server (Ctrl+C)
./dev.sh
```

### Step 5: Test

1. Go to `http://localhost:3000/home/receptionist/setup`
2. Click "Preview Voice" on Rachel
3. Should hear audio!
4. Click "Preview Voice" on Alloy
5. Should hear different voice!

## Costs

**11Labs:**
- Free tier: 10,000 characters/month
- Each preview ≈ 300 characters
- 33 previews/month free
- After that: ~$0.003 per preview (very cheap)

**OpenAI:**
- $0.015 per 1,000 characters
- Each preview ≈ 300 characters
- ~$0.0045 per preview (also very cheap)

## Recommendation

**For MVP:** Leave it as-is
- Voice descriptions work fine
- No extra costs
- Less complexity
- Users can still complete setup

**For better UX:** Add 11Labs key
- Get free API key (5 minutes)
- Uncomment code (2 minutes)
- Users can hear actual voices
- Better confidence in selection

**Your call!** Both options work fine. The actual AI receptionist will work perfectly either way - this only affects the setup wizard UX. 🎤

## Summary

| Feature | Current Status | With API Keys |
|---------|---------------|---------------|
| Voice descriptions | ✅ Working | ✅ Working |
| Voice selection | ✅ Working | ✅ Working |
| Audio preview | ❌ Disabled | ✅ Working |
| Setup completion | ✅ Working | ✅ Working |
| Production calls | ✅ Working | ✅ Working |
| Extra cost | 💰 $0 | 💰 ~$0.003/preview |
| Setup time | ⏱️ 0 min | ⏱️ 7 min |

**Bottom line:** It's a nice-to-have, not a must-have. 👍
