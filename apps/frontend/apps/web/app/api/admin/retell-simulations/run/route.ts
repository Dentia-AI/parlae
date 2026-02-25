import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { requireAdmin } from '~/lib/auth/is-admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RETELL_API_KEY = process.env.RETELL_API_KEY || '';

const VALID_SUITES = [
  'booking',
  'booking-adversarial',
  'tools',
  'handoff',
  'hipaa',
  'emergency',
  'appointment-mgmt',
  'insurance',
  'patient-records',
  'all',
];

const VALID_MODELS = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-5.2',
  'gpt-5-mini',
  'gemini-3.0-flash',
  'claude-3.5-sonnet',
  'claude-sonnet-4',
];

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 },
    );
  }

  if (!RETELL_API_KEY) {
    return NextResponse.json(
      { error: 'RETELL_API_KEY not configured' },
      { status: 500 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { suite, models, agentRole, keepAgents } = body as {
    suite?: string;
    models?: string[];
    agentRole?: string;
    keepAgents?: boolean;
  };

  if (!suite || !VALID_SUITES.includes(suite)) {
    return NextResponse.json(
      {
        error: `Invalid suite. Must be one of: ${VALID_SUITES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  const selectedModels = models && models.length > 0 ? models : ['gpt-4.1'];

  const scriptPath = path.resolve(
    process.cwd(),
    '../../packages/shared/src/retell/tests/run-retell-sim.ts',
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
        );
      };

      try {
        send(
          'log',
          `Starting Retell simulation: suite=${suite} models=${selectedModels.join(',')}`,
        );
        send('log', '\u2500'.repeat(60));

        const args = ['tsx', scriptPath, '--suite', suite, '--models', selectedModels.join(',')];

        if (agentRole) {
          args.push('--agent-role', agentRole);
        }
        if (keepAgents) {
          args.push('--keep');
        }

        const child = spawn('npx', args, {
          env: {
            ...process.env,
            RETELL_API_KEY,
            RETELL_WEBHOOK_SECRET:
              process.env.RETELL_WEBHOOK_SECRET || 'test-secret',
            BACKEND_URL:
              process.env.NEXT_PUBLIC_BACKEND_URL ||
              process.env.BACKEND_API_URL ||
              'https://httpbin.org/post',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let buffer = '';
        let errBuffer = '';
        let resultJson = '';

        child.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              // Check if this is the JSON comparison output
              if (line.trim().startsWith('{') && line.includes('"models"')) {
                resultJson = line.trim();
              }
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

        child.on('close', (code) => {
          if (buffer.trim()) send('log', buffer);
          if (errBuffer.trim()) send('log', `[stderr] ${errBuffer}`);

          send('log', '\u2500'.repeat(60));
          send('log', `Process exited with code ${code}`);

          // Try to find the latest comparison JSON file
          const testsDir = path.resolve(
            process.cwd(),
            '../../packages/shared/src/retell/tests',
          );
          try {
            const files = fs
              .readdirSync(testsDir)
              .filter((f: string) => f.startsWith('retell-sim-comparison-'))
              .sort();
            if (files.length > 0) {
              const latestFile = path.join(testsDir, files[files.length - 1]!);
              const json = fs.readFileSync(latestFile, 'utf-8');
              send('results', json);
            }
          } catch {
            // Results may have been sent inline
            if (resultJson) {
              send('results', resultJson);
            }
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
