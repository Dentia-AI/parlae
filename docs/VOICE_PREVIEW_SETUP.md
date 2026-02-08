# Voice Preview Options & Setup

## Current Issue

Voice previews require direct access to TTS provider APIs (11Labs or OpenAI), which need separate API keys from Vapi.

**You have:**
- ✅ `VAPI_API_KEY` - For Vapi platform
- ✅ `VAPI_PUBLIC_KEY` - For Vapi web calls
- ❌ `ELEVENLABS_API_KEY` - Not configured
- ❌ `OPENAI_API_KEY` - Not configured

**The problem:** Vapi doesn't provide a "voice preview" API endpoint. Vapi handles TTS during actual calls, but for standalone previews we need direct TTS provider access.

## Solution Options

### Option 1: Add TTS Provider API Keys (Recommended)

This gives you real, dynamic voice previews.

#### Step 1: Get 11Labs API Key
1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up (free tier available)
3. Navigate to Profile → API Keys
4. Create new API key
5. Copy the key

#### Step 2: Get OpenAI API Key
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create new API key
3. Copy the key

#### Step 3: Add to `.env.local`
```bash
# Add these lines:
ELEVENLABS_API_KEY=sk_your_elevenlabs_key_here
OPENAI_API_KEY=sk-your_openai_key_here
```

#### Step 4: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
./dev.sh
```

**Cost:** ~$0.001 per preview (very cheap)

---

### Option 2: Use Static Audio Samples (Free)

Pre-generate voice samples and host as static files.

#### Implementation

1. **Generate samples once** using TTS APIs
2. **Save as MP3 files** in `public/audio/voices/`
3. **Update voice configuration** to use static URLs

Let me implement this option for you:

```typescript
// Update AVAILABLE_VOICES with static preview URLs
const AVAILABLE_VOICES = [
  {
    id: 'rachel-11labs',
    name: 'Rachel',
    provider: '11labs',
    voiceId: 'rachel',
    previewUrl: '/audio/voices/rachel-preview.mp3',
    // ...
  },
  // ... other voices
];

// Update handlePlayPreview to use static files
const handlePlayPreview = async (voiceId: string) => {
  const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
  if (!voice?.previewUrl) return;
  
  if (audioElement) {
    audioElement.src = voice.previewUrl;
    await audioElement.play();
  }
};
```

**Pros:**
- ✅ No API keys needed
- ✅ No API costs
- ✅ Faster loading
- ✅ Always available

**Cons:**
- ❌ Static content (can't customize with business name)
- ❌ Need to generate samples manually
- ❌ Need to host audio files

---

### Option 3: Use Browser Speech Synthesis (Fallback)

Use the browser's built-in text-to-speech (won't sound like the actual voices but gives an idea).

#### Implementation

```typescript
const handlePlayPreview = (voiceId: string) => {
  const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
  if (!voice) return;

  const utterance = new SpeechSynthesisUtterance(
    `Hi, welcome to ${businessName}! I'm ${voice.name}.`
  );
  
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  speechSynthesis.speak(utterance);
  toast.info(`This is a browser preview. Actual ${voice.name} voice will sound more professional.`);
};
```

**Pros:**
- ✅ No API keys needed
- ✅ No cost
- ✅ Instant playback

**Cons:**
- ❌ Doesn't sound like actual voice
- ❌ Generic robot voice
- ❌ Not representative of production quality

---

## Recommended: Option 1 (Real TTS APIs)

For the best user experience, I recommend **Option 1** - adding the TTS provider API keys.

### Quick Setup

**1. Add to `.env.local`:**
```bash
# 11Labs (for Rachel, Josh, Bella, Antoni)
ELEVENLABS_API_KEY=sk_your_key_here

# OpenAI (for Alloy, Echo, Nova) 
OPENAI_API_KEY=sk-proj-your_key_here
```

**2. Restart server:**
```bash
./dev.sh
```

**3. Test:**
- Go to `/home/receptionist/setup`
- Click "Preview Voice" on any voice
- Should hear actual voice sample

### Free Tier Limits

**11Labs Free Tier:**
- 10,000 characters/month
- ≈ 33 voice previews/month
- No credit card required

**OpenAI:**
- $5 free credit for new accounts
- ~1,100 previews with free credit

---

## Current Implementation Status

✅ **Backend API ready:** `/api/vapi/voice-preview/route.ts`  
✅ **Frontend player ready:** Audio element with play/pause  
✅ **Error handling ready:** Graceful fallbacks  
⏳ **Waiting for:** API keys to be added  

---

## Alternative: Skip Voice Preview for MVP

If you want to skip voice preview for now:

**Quick Fix:**
```typescript
// In voice-selection-form.tsx
const handlePlayPreview = (voiceId: string) => {
  toast.info('Voice previews available after adding TTS API keys. All voices are professional and natural-sounding.');
};
```

Users can still:
- ✅ See voice descriptions
- ✅ Read about voice characteristics
- ✅ Select a voice
- ✅ Deploy successfully
- ❌ Can't hear preview (but voice **will work** when deployed)

---

## Summary

The voice preview requires **TTS provider API keys** (11Labs or OpenAI), not Vapi keys.

**Quick Start (5 minutes):**
1. Get 11Labs free API key: [elevenlabs.io/sign-up](https://elevenlabs.io/sign-up)
2. Get OpenAI API key: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Add both to `.env.local`
4. Restart `./dev.sh`
5. Test voice previews!

**Or skip it for MVP** and add later. The actual receptionist will work fine with Vapi - voice preview is just a nice-to-have UX feature. 🎤
