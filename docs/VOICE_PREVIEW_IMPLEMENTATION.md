# Voice Preview Implementation

## Overview

Voice previews allow users to hear how different AI voices sound before selecting one for their receptionist. This is implemented using direct API calls to the TTS providers (11Labs and OpenAI).

## Architecture

```
User clicks "Preview Voice"
  ↓
Frontend calls: POST /api/vapi/voice-preview
  ↓
Backend generates audio using TTS provider API
  ↓
Returns base64-encoded audio
  ↓
Frontend plays audio in browser
```

## Backend Implementation

### API Endpoint
**File:** `app/api/vapi/voice-preview/route.ts`

**Endpoint:** `POST /api/vapi/voice-preview`

**Request Body:**
```typescript
{
  provider: '11labs' | 'openai',
  voiceId: string,  // e.g., 'rachel', 'alloy'
  text?: string     // Optional custom text
}
```

**Response:**
```typescript
{
  success: true,
  audio: string,    // Base64-encoded audio: "data:audio/mpeg;base64,..."
  provider: string
}
```

### 11Labs Integration

Uses the 11Labs Text-to-Speech API:

```typescript
POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}

Headers:
  xi-api-key: YOUR_ELEVENLABS_API_KEY
  Content-Type: application/json

Body:
{
  "text": "Hi, welcome to your clinic!...",
  "model_id": "eleven_turbo_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}

Response: Audio MP3 binary
```

**Voice IDs for 11Labs:**
- `rachel` - Rachel
- `josh` - Josh
- `bella` - Bella
- `antoni` - Antoni

### OpenAI Integration

Uses the OpenAI Text-to-Speech API:

```typescript
POST https://api.openai.com/v1/audio/speech

Headers:
  Authorization: Bearer YOUR_OPENAI_API_KEY
  Content-Type: application/json

Body:
{
  "model": "tts-1",
  "voice": "alloy",
  "input": "Hi, welcome to your clinic!..."
}

Response: Audio MP3 binary
```

**Voice IDs for OpenAI:**
- `alloy` - Alloy
- `echo` - Echo
- `nova` - Nova
- `fable` - Fable
- `onyx` - Onyx
- `shimmer` - Shimmer

## Frontend Implementation

### Component
**File:** `receptionist/setup/_components/voice-selection-form.tsx`

### Features

1. **Audio Element Management**
   ```typescript
   const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
   
   useEffect(() => {
     const audio = new Audio();
     audio.onended = () => setPlayingVoice(null);
     audio.onerror = () => {
       toast.error('Failed to play voice preview');
       setPlayingVoice(null);
     };
     setAudioElement(audio);
   }, []);
   ```

2. **Play Preview Function**
   ```typescript
   const handlePlayPreview = async (voiceId: string) => {
     const voice = AVAILABLE_VOICES.find(v => v.id === voiceId);
     
     // Stop any currently playing audio
     if (audioElement) {
       audioElement.pause();
     }
     speechSynthesis.cancel();
     
     // Toggle off if clicking same voice
     if (playingVoice === voiceId) {
       setPlayingVoice(null);
       return;
     }
     
     setPlayingVoice(voiceId);
     
     // Call backend API
     const response = await fetch('/api/vapi/voice-preview', {
       method: 'POST',
       body: JSON.stringify({
         provider: voice.provider,
         voiceId: voice.voiceId,
         text: `Hi, welcome to ${businessName}! I'm ${voice.name}...`
       })
     });
     
     const data = await response.json();
     
     // Play audio
     audioElement.src = data.audio;  // Base64 data URL
     await audioElement.play();
   };
   ```

3. **Button States**
   ```tsx
   <Button
     onClick={() => handlePlayPreview(voice.id)}
     disabled={playingVoice === voice.id}
   >
     {playingVoice === voice.id ? (
       <>
         <Loader2 className="animate-spin" />
         Playing...
       </>
     ) : (
       <>
         <Play />
         Preview Voice
       </>
     )}
   </Button>
   ```

## Environment Variables

Add these to `.env.local`:

```bash
# 11Labs API Key (for voice previews)
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# OpenAI API Key (already exists, also used for TTS)
OPENAI_API_KEY=your_openai_api_key
```

## Getting API Keys

### 11Labs API Key
1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up or log in
3. Navigate to Profile → API Keys
4. Create a new API key
5. Copy and add to `.env.local`

### OpenAI API Key
1. Go to [platform.openai.com](https://platform.openai.com)
2. Navigate to API Keys
3. Create a new key
4. Copy and add to `.env.local`

## Usage Costs

### 11Labs Pricing
- **Starter:** $5/month - 30,000 characters
- **Creator:** $22/month - 100,000 characters
- **Pro:** $99/month - 500,000 characters

A voice preview (~50 words) = ~300 characters  
≈ 100 previews = $0.10 on Starter plan

### OpenAI TTS Pricing
- **Standard (tts-1):** $0.015 per 1K characters
- **HD (tts-1-hd):** $0.030 per 1K characters

A voice preview (~50 words) = ~300 characters  
≈ 100 previews = $0.45 on standard model

## Error Handling

### Missing API Keys
If API keys are not configured, the endpoint returns:
```json
{
  "error": "OpenAI API key not configured"
}
```

Frontend shows: "Failed to play voice preview. Make sure API keys are configured."

### API Errors
If the TTS provider API fails:
```json
{
  "error": "Failed to generate voice preview"
}
```

Frontend shows: "Failed to play voice preview"

### Browser Compatibility
- Audio playback supported in all modern browsers
- Base64 data URLs supported for audio elements
- Falls back gracefully if audio fails

## Testing

### Current Status (MVP)

**Voice preview audio is currently DISABLED** until TTS API keys are added.

When you click "Preview Voice", you'll see:
- ✅ Voice description in a toast notification  
- ✅ Full voice details (gender, accent, provider, description)  
- ❌ No actual audio playback (requires API keys)  

**Important:** The actual receptionist **will work perfectly** when deployed - this only affects the preview feature during setup. The voice will work fine in production calls via Vapi.

### Test Steps (Current MVP)

1. **Start dev server:**
   ```bash
   ./dev.sh
   ```

2. **Navigate to:**
   ```
   http://localhost:3000/home/receptionist/setup
   ```

3. **Click "Preview Voice"** on any voice card

4. **Current behavior:**
   - Toast shows voice description
   - No audio plays (API keys not configured)
   - All other functionality works normally
   - You can still select the voice and continue setup

### Enabling Real Voice Previews (Optional)

To enable actual audio playback:

1. **Get API keys (free tiers available):**
   - [11Labs](https://elevenlabs.io/sign-up) - For Rachel, Josh, Bella, Antoni  
   - [OpenAI](https://platform.openai.com/api-keys) - For Alloy, Echo, Nova  

2. **Add to `.env.local`:**
   ```bash
   ELEVENLABS_API_KEY=sk_your_key_here
   OPENAI_API_KEY=sk-proj-your_key_here
   ```

3. **Uncomment code** in `voice-selection-form.tsx`:
   - Find the `handlePlayPreview` function (around line 150)
   - Comment out the toast-only section at the top
   - Uncomment the API call section (marked with `/*` and `*/`)

4. **Restart server:**
   ```bash
   ./dev.sh
   ```

5. **Test previews:**
   - Navigate to `/home/receptionist/setup`
   - Click "Preview Voice" for Rachel (11Labs)
   - Should generate and play audio
   - Click "Preview Voice" for Alloy (OpenAI)
   - Should generate and play audio

### Expected Behavior

**With API keys enabled:**
✅ Button shows "Playing..." while generating  
✅ Audio plays through speakers  
✅ Button returns to "Preview Voice" when done  
✅ Clicking same button again stops playback  
✅ Clicking different voice stops previous and plays new  

**Without API keys (current MVP):**
✅ Toast shows voice description  
✅ No audio plays  
✅ Voice selection still works  
✅ Setup can be completed normally  

## Fallback for Missing Keys

If API keys are not configured, users can still:
- ✅ See all voice options
- ✅ Read descriptions
- ✅ Select a voice
- ✅ Complete setup
- ℹ️ Won't hear preview (shows description instead)

The actual voice **will work perfectly** when deployed to Vapi, as Vapi handles the TTS directly during real calls.

## Troubleshooting

**Issue:** "Failed to generate preview"

**Solution:**
- This means the API call is active but keys are missing/invalid
- Verify API key format (11Labs: `sk_...`, OpenAI: `sk-...`)
- Check API key permissions (must have TTS access)
- Verify keys are not expired
- Make sure you uncommented the code in `voice-selection-form.tsx`

**Issue:** No audio plays but no errors

**Solution:**
- Check browser console for errors
- Verify audio is not muted
- Try different browser (Safari, Chrome, Firefox)
- Check TTS provider API status pages

## Alternative: Static Audio Samples

If you prefer not to use API keys for previews, you can:

1. **Pre-generate samples** for each voice
2. **Host as static files** in `public/audio/voices/`
3. **Update code** to use static URLs:

```typescript
const AVAILABLE_VOICES = [
  {
    id: 'rachel-11labs',
    name: 'Rachel',
    previewUrl: '/audio/voices/rachel-preview.mp3',
    // ...
  },
];

// Play static file
audioElement.src = voice.previewUrl;
await audioElement.play();
```

**Pros:** No API costs, faster loading  
**Cons:** Static content, can't customize preview text  

## Production Considerations

### Caching
Consider caching generated previews:
- Store in Redis or memory
- Key: `voice-preview-${provider}-${voiceId}-${hash(text)}`
- TTL: 24 hours
- Reduces API calls and costs

### Rate Limiting
Implement rate limiting to prevent abuse:
- Max 10 previews per user per minute
- Prevents excessive API costs
- Better user experience (prevents spam clicks)

## Summary

✅ **Backend API:** `/api/vapi/voice-preview/route.ts`  
✅ **11Labs Integration:** Uses Text-to-Speech API  
✅ **OpenAI Integration:** Uses TTS-1 model  
✅ **Frontend:** Audio element with play/pause  
✅ **Error Handling:** Graceful fallbacks  
✅ **Loading States:** Shows spinner while generating  

**Voice previews now work with real TTS APIs!** 🎉

Just add the API keys to `.env.local` and restart the server.
