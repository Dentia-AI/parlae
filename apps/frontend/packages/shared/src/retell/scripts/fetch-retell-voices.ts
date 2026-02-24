#!/usr/bin/env npx tsx
/**
 * One-time script to fetch Retell voice metadata and download preview audio files.
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx fetch-retell-voices.ts
 *
 * This script:
 *   1. Calls GET /list-voices to find the target voices
 *   2. Downloads preview audio files to public/audio/voices/
 *   3. Prints the voice data as a TypeScript constant for copy-paste into voices.ts
 */

const API_KEY = process.env.RETELL_API_KEY;
if (!API_KEY) {
  console.error('RETELL_API_KEY environment variable is required');
  process.exit(1);
}

const TARGET_VOICES = ['Chloe', 'Grace', 'Kate', 'Victoria', 'Brian', 'Joe', 'Max'];

const AUDIO_DIR = new URL(
  '../../../../../../../../apps/frontend/apps/web/public/audio/voices/',
  import.meta.url,
).pathname;

interface RetellVoice {
  voice_id: string;
  voice_name: string;
  provider: string;
  gender: string;
  accent?: string;
  age?: string;
  preview_audio_url?: string;
}

async function main() {
  console.log('Fetching Retell voices...');

  const res = await fetch('https://api.retellai.com/list-voices', {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    console.error(`Failed to fetch voices: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const voices: RetellVoice[] = await res.json();
  console.log(`Got ${voices.length} total voices`);

  const matched: RetellVoice[] = [];

  for (const name of TARGET_VOICES) {
    const voice = voices.find(
      (v) => v.voice_name.toLowerCase() === name.toLowerCase(),
    );
    if (voice) {
      matched.push(voice);
      console.log(`  Found: ${voice.voice_name} -> ${voice.voice_id} (${voice.provider}, ${voice.gender})`);
    } else {
      console.warn(`  NOT FOUND: ${name}`);
      const similar = voices
        .filter((v) => v.voice_name.toLowerCase().includes(name.toLowerCase()))
        .slice(0, 3);
      if (similar.length) {
        console.warn(`    Similar: ${similar.map((v) => `${v.voice_name} (${v.voice_id})`).join(', ')}`);
      }
    }
  }

  // Download preview audio
  const fs = await import('fs');
  const path = await import('path');

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  for (const voice of matched) {
    if (!voice.preview_audio_url) {
      console.warn(`  No preview URL for ${voice.voice_name}`);
      continue;
    }

    const filename = `retell-${voice.voice_name.toLowerCase()}.mp3`;
    const filepath = path.join(AUDIO_DIR, filename);

    if (fs.existsSync(filepath)) {
      console.log(`  Already exists: ${filename}`);
      continue;
    }

    console.log(`  Downloading: ${filename}...`);
    const audioRes = await fetch(voice.preview_audio_url);
    if (audioRes.ok) {
      const buffer = Buffer.from(await audioRes.arrayBuffer());
      fs.writeFileSync(filepath, buffer);
      console.log(`  Saved: ${filename} (${buffer.length} bytes)`);
    } else {
      console.warn(`  Failed to download: ${voice.preview_audio_url}`);
    }
  }

  // Print TypeScript constant
  console.log('\n// ---- Copy this into voices.ts ----\n');
  console.log('export const RETELL_AVAILABLE_VOICES = [');
  for (const voice of matched) {
    const slug = voice.voice_name.toLowerCase();
    console.log(`  {`);
    console.log(`    id: 'retell-${slug}',`);
    console.log(`    name: '${voice.voice_name}',`);
    console.log(`    subtitle: '',  // TODO: add subtitle`);
    console.log(`    provider: 'retell' as const,`);
    console.log(`    voiceId: '${voice.voice_id}',`);
    console.log(`    gender: '${voice.gender}',`);
    console.log(`    accent: '${voice.accent || 'American'}',`);
    console.log(`    description: '',  // TODO: add description`);
    console.log(`    previewUrl: '/audio/voices/retell-${slug}.mp3',`);
    console.log(`  },`);
  }
  console.log('];');
}

main().catch(console.error);
