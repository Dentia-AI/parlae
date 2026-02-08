# Static Voice Previews - Quick Start

## Summary

Voice previews now use **static MP3 files** instead of API calls. This is:
- ✅ **Faster** - Instant playback
- ✅ **Cheaper** - No API costs
- ✅ **More reliable** - No network dependencies
- ✅ **Simpler** - No API keys needed

## Generate Audio Files (One-Time Setup)

### Step 1: Add API Keys to `.env.local`

```bash
# Add these to your .env.local file:
ELEVENLABS_API_KEY=sk_your_11labs_key_here
OPENAI_API_KEY=sk-proj-your_openai_key_here
```

Get keys from:
- 11Labs: https://elevenlabs.io/sign-up (free tier available)
- OpenAI: https://platform.openai.com/api-keys

### Step 2: Run Generation Script

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Make script executable
chmod +x scripts/generate-voice-previews.js

# Run generation
node scripts/generate-voice-previews.js
```

### Step 3: Verify Files Created

```bash
ls -lh apps/frontend/apps/web/public/audio/voices/

# Should see:
# rachel-11labs.mp3
# josh-11labs.mp3  
# bella-11labs.mp3
# antoni-11labs.mp3
# alloy-openai.mp3
# echo-openai.mp3
# nova-openai.mp3
```

### Step 4: Test in Browser

1. Go to: http://localhost:3000/home/receptionist/setup
2. Click "Preview Voice" on any voice
3. Should play instantly! 🎵

### Step 5: Commit Files

```bash
git add apps/frontend/apps/web/public/audio/voices/*.mp3
git add scripts/generate-voice-previews.js
git add scripts/README_VOICE_PREVIEWS.md
git commit -m "Add static voice preview audio files"
```

## File Sizes

Total size: ~500KB for 7 voices
- Each voice: ~50-100KB
- Acceptable for git repository

## What Changed

**Before:**
```typescript
// Called API every time
const response = await fetch('/api/vapi/voice-preview', {...});
const data = await response.json();
audioElement.src = data.audio; // Base64 encoded
```

**After:**
```typescript
// Plays static file
audioElement.src = '/audio/voices/rachel-11labs.mp3';
await audioElement.play();
```

## Optional: Delete API Endpoint

Once audio files are generated, you can delete:
- `apps/frontend/apps/web/app/api/vapi/voice-preview/route.ts` (no longer needed)

## Troubleshooting

### Script fails with API error

**Check API keys:**
```bash
grep ELEVENLABS_API_KEY .env.local
grep OPENAI_API_KEY .env.local
```

### Audio doesn't play

1. **Check file exists:**
   ```bash
   ls apps/frontend/apps/web/public/audio/voices/rachel-11labs.mp3
   ```

2. **Check browser console:**
   - Should show successful audio load
   - If 404, files weren't generated

3. **Check public directory:**
   - Files must be in `public/audio/voices/`
   - Not `src/audio/voices/`

### Regenerate specific voice

Edit `scripts/generate-voice-previews.js` and run again. It will overwrite existing files.

## Future: S3/CDN Hosting

For production at scale, you could:

1. **Upload to S3:**
   ```bash
   aws s3 cp apps/frontend/apps/web/public/audio/voices/ \
     s3://your-bucket/voice-previews/ --recursive
   ```

2. **Use CDN URLs:**
   ```typescript
   previewUrl: 'https://cdn.yoursite.com/voice-previews/rachel-11labs.mp3'
   ```

3. **Benefits:**
   - Faster global delivery
   - Reduces Next.js bundle size
   - Easier to update voices

But for MVP, committing to git is perfectly fine! 👍
