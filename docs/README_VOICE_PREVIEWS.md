# Voice Preview Audio Generation Script

This script generates voice preview audio files using 11Labs and OpenAI APIs.
Run this once to generate all preview files, then commit them to the repo.

## Prerequisites

1. Get API keys:
   - 11Labs: https://elevenlabs.io/sign-up
   - OpenAI: https://platform.openai.com/api-keys

2. Add to `.env.local`:
   ```bash
   ELEVENLABS_API_KEY=sk_your_key_here
   OPENAI_API_KEY=sk-proj-your_key_here
   ```

## Generate Audio Files

```bash
# Run the generation script
node scripts/generate-voice-previews.js

# Or with pnpm
pnpm generate-voice-previews
```

## Output

Audio files will be created in:
```
apps/frontend/apps/web/public/audio/voices/
├── rachel-11labs.mp3
├── josh-11labs.mp3
├── bella-11labs.mp3
├── antoni-11labs.mp3
├── alloy-openai.mp3
├── echo-openai.mp3
└── nova-openai.mp3
```

## Usage

After generating, the voice preview system will automatically use these files instead of making API calls.

## Re-generation

Only re-generate if:
- You want to change the preview text
- You add new voices
- You want to update the audio quality

## Committing

These audio files should be committed to git:
```bash
git add apps/frontend/apps/web/public/audio/voices/*.mp3
git commit -m "Add voice preview audio files"
```

File size: ~50-100KB per voice = ~500KB total (acceptable for git)
