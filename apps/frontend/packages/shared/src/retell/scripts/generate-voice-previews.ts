#!/usr/bin/env npx tsx
/**
 * Generate custom voice preview audio files for Retell voices.
 *
 * Uses Retell's create-web-call API to get a LiveKit access token,
 * then connects via @livekit/rtc-node to capture the agent's TTS audio,
 * and converts it to MP3 via ffmpeg.
 *
 * Usage:
 *   RETELL_API_KEY=... npx tsx generate-voice-previews.ts
 *
 * Prerequisites:
 *   - ffmpeg installed (brew install ffmpeg)
 *   - RETELL_API_KEY environment variable set
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  Room,
  RoomEvent,
  RemoteTrack,
  TrackKind,
  AudioStream,
  dispose,
} from '@livekit/rtc-node';

const API_KEY = process.env.RETELL_API_KEY;
if (!API_KEY) {
  console.error('RETELL_API_KEY environment variable is required');
  process.exit(1);
}

const BASE_URL = 'https://api.retellai.com';
const LIVEKIT_URL = 'wss://retell-ai-4ihahnq7.livekit.cloud';

const OUTPUT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../../../apps/web/public/audio/voices/',
);

const PREVIEW_TEXT =
  "Hi there! Thank you for calling. I'm happy to help you with booking an appointment, answering your questions, or anything else you need today.";

interface VoiceTarget {
  name: string;
  voiceId: string;
  outputFile: string;
}

const VOICES: VoiceTarget[] = [
  { name: 'Chloe', voiceId: 'retell-Chloe', outputFile: 'retell-chloe.mp3' },
  { name: 'Victoria', voiceId: 'cartesia-Victoria', outputFile: 'retell-victoria.mp3' },
  { name: 'Max', voiceId: 'minimax-Max', outputFile: 'retell-max.mp3' },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retellApi<T = any>(method: string, apiPath: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE_URL}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null as T;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${apiPath} → ${res.status}: ${text.substring(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Convert Int16 PCM samples to a WAV file buffer.
 */
function createWavBuffer(samples: Int16Array, sampleRate: number): Buffer {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);

  const int16View = new Int16Array(buf.buffer, buf.byteOffset + 44, samples.length);
  int16View.set(samples);

  return buf;
}

async function generatePreview(voice: VoiceTarget): Promise<void> {
  console.log(`\n--- Generating preview for ${voice.name} (${voice.voiceId}) ---`);

  let llmId: string | null = null;
  let agentId: string | null = null;

  try {
    // 1. Create temporary LLM and agent
    console.log('  Creating temporary LLM...');
    const llm = await retellApi<{ llm_id: string }>('POST', '/create-retell-llm', {
      model: 'gpt-4.1-mini',
      general_prompt:
        'You are a friendly dental clinic receptionist. After your greeting, wait for the caller.',
      begin_message: PREVIEW_TEXT,
    });
    llmId = llm.llm_id;
    await sleep(500);

    console.log('  Creating temporary agent...');
    const agent = await retellApi<{ agent_id: string }>('POST', '/create-agent', {
      agent_name: `PREVIEW-${voice.name}`,
      response_engine: { type: 'retell-llm', llm_id: llmId },
      voice_id: voice.voiceId,
      language: 'en-US',
    });
    agentId = agent.agent_id;
    await sleep(500);

    // 2. Create web call
    console.log('  Creating web call...');
    const call = await retellApi<{ call_id: string; access_token: string }>(
      'POST',
      '/v2/create-web-call',
      { agent_id: agentId },
    );
    console.log(`  Call ID: ${call.call_id}`);

    // 3. Connect to LiveKit room and capture audio
    console.log('  Connecting to LiveKit room...');
    const room = new Room();
    const allSamples: Int16Array[] = [];
    let sampleRate = 48000;
    let hasAudio = false;

    await new Promise<void>(async (resolve, reject) => {
      const maxTimeout = setTimeout(() => {
        console.log('\n  Max recording time reached.');
        room.disconnect();
        resolve();
      }, 20000);

      let silenceTimer: ReturnType<typeof setTimeout>;
      const resetSilence = () => {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          console.log('\n  Agent finished speaking.');
          clearTimeout(maxTimeout);
          room.disconnect();
          resolve();
        }, 3000);
      };

      room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack) => {
        if (track.kind !== TrackKind.KIND_AUDIO) return;

        console.log('  Audio track subscribed, recording...');
        const audioStream = new AudioStream(track, sampleRate, 1);

        for await (const frame of audioStream) {
          const samples = new Int16Array(frame.data.buffer);
          allSamples.push(samples);
          hasAudio = true;
          resetSilence();

          const totalSamples = allSamples.reduce((s, a) => s + a.length, 0);
          const seconds = (totalSamples / sampleRate).toFixed(1);
          process.stdout.write(`\r  Recording: ${seconds}s`);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        clearTimeout(maxTimeout);
        clearTimeout(silenceTimer);
        resolve();
      });

      try {
        await room.connect(LIVEKIT_URL, call.access_token, {
          autoSubscribe: true,
        });
        console.log('  Connected to room. Waiting for agent audio...');
        resetSilence();
      } catch (err) {
        clearTimeout(maxTimeout);
        reject(err);
      }
    });

    if (!hasAudio || allSamples.length === 0) {
      console.log('  WARNING: No audio captured!');
      return;
    }

    // 4. Combine samples and save
    const totalLen = allSamples.reduce((s, a) => s + a.length, 0);
    const combined = new Int16Array(totalLen);
    let offset = 0;
    for (const chunk of allSamples) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    console.log(`\n  Captured ${(totalLen / sampleRate).toFixed(1)}s of audio.`);

    const wavBuf = createWavBuffer(combined, sampleRate);
    const tmpWav = path.join(OUTPUT_DIR, `_tmp_${voice.name.toLowerCase()}.wav`);
    const outputPath = path.join(OUTPUT_DIR, voice.outputFile);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(tmpWav, wavBuf);

    // Convert to MP3, limit to 10 seconds
    console.log('  Converting to MP3...');
    try {
      execSync(
        `ffmpeg -y -i "${tmpWav}" -codec:a libmp3lame -qscale:a 2 -t 10 "${outputPath}"`,
        { stdio: 'pipe' },
      );
      const size = (fs.statSync(outputPath).size / 1024).toFixed(1);
      console.log(`  Saved: ${voice.outputFile} (${size} KB)`);
    } finally {
      try {
        fs.unlinkSync(tmpWav);
      } catch {
        /* ignore */
      }
    }
  } finally {
    console.log('  Cleaning up...');
    if (agentId) {
      try {
        await retellApi('DELETE', `/delete-agent/${agentId}`);
      } catch {
        /* ignore */
      }
    }
    if (llmId) {
      try {
        await retellApi('DELETE', `/delete-retell-llm/${llmId}`);
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  console.log('=== Voice Preview Generator ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Greeting: "${PREVIEW_TEXT.substring(0, 60)}..."`);
  console.log(`Voices: ${VOICES.map((v) => v.name).join(', ')}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const voice of VOICES) {
    try {
      await generatePreview(voice);
    } catch (err) {
      console.error(
        `\n  ERROR: ${voice.name}: ${err instanceof Error ? err.message : err}`,
      );
    }
    await sleep(1000);
  }

  console.log('\n=== Done ===');
  await dispose();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
