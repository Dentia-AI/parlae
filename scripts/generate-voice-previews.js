#!/usr/bin/env node

/**
 * Generate voice preview audio files for all available voices
 * Run this once to create static audio files that can be used for previews
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Voice configurations
const VOICES = [
  {
    id: 'rachel-11labs',
    name: 'Rachel',
    provider: '11labs',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    text: 'Hi, welcome to your clinic! I\'m Rachel, your AI receptionist. How can I help you today?',
  },
  {
    id: 'josh-11labs',
    name: 'Josh',
    provider: '11labs',
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',
    text: 'Hi, welcome to your clinic! I\'m Josh, your AI receptionist. How can I help you today?',
  },
  {
    id: 'bella-11labs',
    name: 'Bella',
    provider: '11labs',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    text: 'Hi, welcome to your clinic! I\'m Bella, your AI receptionist. How can I help you today?',
  },
  {
    id: 'antoni-11labs',
    name: 'Antoni',
    provider: '11labs',
    voiceId: 'ErXwobaYiN019PkySvjV',
    text: 'Hi, welcome to your clinic! I\'m Antoni, your AI receptionist. How can I help you today?',
  },
  {
    id: 'alloy-openai',
    name: 'Alloy',
    provider: 'openai',
    voiceId: 'alloy',
    text: 'Hi, welcome to your clinic! I\'m Alloy, your AI receptionist. How can I help you today?',
  },
  {
    id: 'echo-openai',
    name: 'Echo',
    provider: 'openai',
    voiceId: 'echo',
    text: 'Hi, welcome to your clinic! I\'m Echo, your AI receptionist. How can I help you today?',
  },
  {
    id: 'nova-openai',
    name: 'Nova',
    provider: 'openai',
    voiceId: 'nova',
    text: 'Hi, welcome to your clinic! I\'m Nova, your AI receptionist. How can I help you today?',
  },
];

const OUTPUT_DIR = path.join(__dirname, '../apps/frontend/apps/web/public/audio/voices');

async function generate11LabsAudio(voiceId, text, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not found in environment');
  }

  console.log(`Generating 11Labs audio for voice ${voiceId}...`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`11Labs API error: ${error}`);
  }

  const audioBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  console.log(`✓ Saved ${outputPath}`);
}

async function generateOpenAIAudio(voiceId, text, outputPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  console.log(`Generating OpenAI audio for voice ${voiceId}...`);

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: voiceId,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const audioBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  console.log(`✓ Saved ${outputPath}`);
}

async function generateAllPreviews() {
  console.log('🎤 Voice Preview Generator\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}\n`);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const voice of VOICES) {
    try {
      const outputPath = path.join(OUTPUT_DIR, `${voice.id}.mp3`);

      if (voice.provider === '11labs') {
        await generate11LabsAudio(voice.voiceId, voice.text, outputPath);
      } else if (voice.provider === 'openai') {
        await generateOpenAIAudio(voice.voiceId, voice.text, outputPath);
      }

      successCount++;
    } catch (error) {
      console.error(`✗ Failed to generate ${voice.name}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n✅ Complete! Generated ${successCount} previews, ${errorCount} errors`);
  
  if (errorCount === 0) {
    console.log('\nNext steps:');
    console.log('1. Test the previews in your app');
    console.log('2. Commit the audio files: git add apps/frontend/apps/web/public/audio/voices/*.mp3');
    console.log('3. Remove the voice preview API endpoint (no longer needed)');
  }
}

// Run
generateAllPreviews().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
