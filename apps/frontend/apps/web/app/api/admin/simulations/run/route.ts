import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { requireAdmin } from '~/lib/auth/is-admin';

const VAPI_API_KEY = process.env.VAPI_API_KEY || '';
const VAPI_BASE_URL = 'https://api.vapi.ai';

const VALID_SUITES = ['booking', 'tool', 'handoff', 'hipaa', 'emergency', 'appt', 'all'];

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'groq'];

interface ModelOverride {
  provider: string;
  model: string;
  temperature: number;
}

interface OriginalModel {
  assistantId: string;
  model: Record<string, unknown>;
}

async function vapiGet(endpoint: string): Promise<any> {
  const res = await fetch(`${VAPI_BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Vapi GET ${endpoint}: ${res.status}`);
  return res.json();
}

async function vapiPatch(endpoint: string, body: unknown): Promise<any> {
  const res = await fetch(`${VAPI_BASE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vapi PATCH ${endpoint}: ${res.status}`);
  return res.json();
}

async function applyModelOverride(
  squadId: string,
  override: ModelOverride,
): Promise<OriginalModel[]> {
  const squad = await vapiGet(`/squad/${squadId}`);
  const members = squad.members || [];
  const originals: OriginalModel[] = [];

  for (const member of members) {
    const assistantId = member.assistantId;
    if (!assistantId) continue;

    const assistant = await vapiGet(`/assistant/${assistantId}`);
    if (!assistant.model) continue;

    originals.push({ assistantId, model: { ...assistant.model } });

    await vapiPatch(`/assistant/${assistantId}`, {
      model: {
        ...assistant.model,
        provider: override.provider,
        model: override.model,
        temperature: override.temperature,
      },
    });
  }

  return originals;
}

async function restoreModels(originals: OriginalModel[]): Promise<void> {
  for (const { assistantId, model } of originals) {
    try {
      await vapiPatch(`/assistant/${assistantId}`, { model });
    } catch {
      // Best-effort restore
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!VAPI_API_KEY) {
    return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { suite, squadId, model } = body as {
    suite?: string;
    squadId?: string;
    model?: ModelOverride;
  };

  if (!suite || !VALID_SUITES.includes(suite)) {
    return NextResponse.json(
      { error: `Invalid suite. Must be one of: ${VALID_SUITES.join(', ')}` },
      { status: 400 },
    );
  }

  if (model) {
    if (!model.provider || !VALID_PROVIDERS.includes(model.provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!model.model || typeof model.model !== 'string') {
      return NextResponse.json({ error: 'model.model is required' }, { status: 400 });
    }
    if (model.temperature === undefined || model.temperature < 0 || model.temperature > 2) {
      return NextResponse.json({ error: 'temperature must be between 0 and 2' }, { status: 400 });
    }
  }

  const effectiveSquadId = squadId || process.env.VAPI_SQUAD_ID || '';
  if (!effectiveSquadId) {
    return NextResponse.json({ error: 'No squad ID provided and VAPI_SQUAD_ID not set' }, { status: 400 });
  }

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-results-'));

  const scriptPath = path.resolve(
    process.cwd(),
    '../../packages/shared/src/vapi/simulations/run-chat-tests.ts',
  );

  const encoder = new TextEncoder();
  let originalModels: OriginalModel[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      try {
        // Apply model override if requested
        if (model) {
          send('log', `Applying model override: ${model.provider}/${model.model} (temp=${model.temperature})...`);
          try {
            originalModels = await applyModelOverride(effectiveSquadId, model);
            send('log', `Model override applied to ${originalModels.length} assistant(s)`);
          } catch (err: any) {
            send('error', `Failed to apply model override: ${err.message}`);
            controller.close();
            return;
          }
        }

        send('log', `Starting suite: ${suite} | Squad: ${effectiveSquadId}`);
        send('log', '─'.repeat(60));

        const child = spawn('npx', ['tsx', scriptPath, suite], {
          env: {
            ...process.env,
            VAPI_API_KEY,
            VAPI_SQUAD_ID: effectiveSquadId,
            RESULTS_DIR: resultsDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let buffer = '';
        let errBuffer = '';

        child.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              send('log', line);
            }
          }
        });

        child.stderr.on('data', (chunk: Buffer) => {
          errBuffer += chunk.toString();
          const lines = errBuffer.split('\n');
          errBuffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              send('log', `[stderr] ${line}`);
            }
          }
        });

        child.on('close', async (code) => {
          // Flush remaining buffers
          if (buffer.trim()) send('log', buffer);
          if (errBuffer.trim()) send('log', `[stderr] ${errBuffer}`);

          send('log', '─'.repeat(60));
          send('log', `Process exited with code ${code}`);

          // Read results JSON
          try {
            const files = fs.readdirSync(resultsDir).filter((f: string) => f.startsWith('chat-results-'));
            if (files.length > 0) {
              const latestFile = path.join(resultsDir, files[files.length - 1]!);
              const resultsJson = fs.readFileSync(latestFile, 'utf-8');
              send('results', resultsJson);
            } else {
              send('log', 'No results file found');
            }
          } catch (err: any) {
            send('log', `Failed to read results: ${err.message}`);
          }

          // Restore models
          if (originalModels.length > 0) {
            send('log', 'Restoring original models...');
            await restoreModels(originalModels);
            send('log', 'Models restored');
          }

          // Cleanup temp dir
          try {
            fs.rmSync(resultsDir, { recursive: true, force: true });
          } catch {
            // ignore
          }

          send('done', '');
          controller.close();
        });

        child.on('error', (err) => {
          send('error', `Failed to spawn runner: ${err.message}`);
          controller.close();
        });
      } catch (err: any) {
        send('error', err.message);
        if (originalModels.length > 0) {
          await restoreModels(originalModels);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
