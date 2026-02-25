'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Badge } from '@kit/ui/badge';
import { Separator } from '@kit/ui/separator';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  FlaskConical,
  Play,
  Square,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioResult {
  name: string;
  category: string;
  targetAssistant: string;
  status: 'pass' | 'fail' | 'error';
  durationMs: number;
  costUsd: number;
  failureReason?: string;
}

interface RunResults {
  label: string;
  timestamp: string;
  squadId: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    totalCostUsd: number;
  };
  results: ScenarioResult[];
}

interface SquadOption {
  id: string;
  name: string;
  accountName: string;
}

const SUITES = [
  { value: 'all', label: 'All Scenarios', count: 45 },
  { value: 'booking', label: 'Booking', count: 15 },
  { value: 'tool', label: 'Tool Verification', count: 6 },
  { value: 'hipaa', label: 'HIPAA', count: 9 },
  { value: 'emergency', label: 'Emergency', count: 5 },
  { value: 'appt', label: 'Appointment Mgmt', count: 7 },
  { value: 'handoff', label: 'Handoff', count: 3 },
];

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
  { value: 'groq', label: 'Groq' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSimulationsPage() {
  // Config state
  const [suite, setSuite] = useState('all');
  const [squadId, setSquadId] = useState('');
  const [squads, setSquads] = useState<SquadOption[]>([]);
  const [enableModelOverride, setEnableModelOverride] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [modelName, setModelName] = useState('gpt-4o');
  const [temperature, setTemperature] = useState(0.3);

  // Run state
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<RunResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);

  const logRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch squads for the dropdown
  useEffect(() => {
    fetch('/api/admin/squads')
      .then((res) => res.json())
      .then((data) => {
        const options: SquadOption[] = (data.squads || []).map((s: any) => ({
          id: s.id,
          name: s.name || 'Unnamed',
          accountName: s.account?.accountName || 'No account',
        }));
        setSquads(options);
      })
      .catch(() => {
        // Squads will just need manual ID entry
      });
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setLogs([]);
    setResults(null);
    setError(null);
    setConfigCollapsed(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: Record<string, unknown> = { suite };
      if (squadId) body.squadId = squadId;
      if (enableModelOverride) {
        body.model = { provider, model: modelName, temperature };
      }

      const res = await fetch('/api/admin/simulations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(err.error || `HTTP ${res.status}`);
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response stream');
        setRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const raw of events) {
          const lines = raw.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            else if (line.startsWith('data: ')) eventData = line.slice(6);
          }

          if (eventType === 'log') {
            setLogs((prev) => [...prev, eventData]);
          } else if (eventType === 'results') {
            try {
              setResults(JSON.parse(eventData));
            } catch {
              // Malformed results
            }
          } else if (eventType === 'error') {
            setError(eventData);
          } else if (eventType === 'done') {
            // Stream complete
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [suite, squadId, enableModelOverride, provider, modelName, temperature]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const passRate = results
    ? ((results.summary.passed / results.summary.total) * 100).toFixed(1)
    : null;

  return (
    <div className="container max-w-6xl py-8 pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FlaskConical className="h-8 w-8" />
            Vapi Simulations
          </h1>
          <p className="text-muted-foreground mt-2">
            Run deterministic chat tests against your Vapi squad
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleRun} disabled={!suite}>
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>
          )}
        </div>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setConfigCollapsed(!configCollapsed)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Configuration</CardTitle>
              <CardDescription>
                Select suite, squad, and optional model overrides
              </CardDescription>
            </div>
            {configCollapsed ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {!configCollapsed && (
          <CardContent className="space-y-6">
            {/* Suite + Squad row */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Test Suite</Label>
                <Select value={suite} onValueChange={setSuite} disabled={running}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select suite" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUITES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label} ({s.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Squad ID{' '}
                  <span className="text-muted-foreground font-normal">
                    (optional — defaults to env var)
                  </span>
                </Label>
                {squads.length > 0 ? (
                  <Select
                    value={squadId || '__default__'}
                    onValueChange={(v) => setSquadId(v === '__default__' ? '' : v)}
                    disabled={running}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Use default (env var)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Use default (env var)</SelectItem>
                      {squads.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.accountName} — {s.id.slice(0, 12)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Leave empty to use VAPI_SQUAD_ID env var"
                    value={squadId}
                    onChange={(e) => setSquadId(e.target.value)}
                    disabled={running}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Model override */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enable-model"
                  checked={enableModelOverride}
                  onChange={(e) => setEnableModelOverride(e.target.checked)}
                  disabled={running}
                  className="rounded"
                />
                <Label htmlFor="enable-model" className="cursor-pointer">
                  Override AI Model{' '}
                  <span className="text-muted-foreground font-normal">
                    — temporarily change model for this run, restored after
                  </span>
                </Label>
              </div>

              {enableModelOverride && (
                <div className="grid md:grid-cols-3 gap-4 pl-6">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={provider}
                      onValueChange={setProvider}
                      disabled={running}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Model Name</Label>
                    <Input
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="gpt-4o"
                      disabled={running}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temperature: {temperature.toFixed(1)}</Label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      disabled={running}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0 (deterministic)</span>
                      <span>2 (creative)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Live Output */}
      {(logs.length > 0 || running) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              Live Output
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              ref={logRef}
              className={cn(
                'bg-muted/50 border rounded-lg p-4 text-sm font-mono',
                'max-h-96 overflow-y-auto whitespace-pre-wrap break-words',
              )}
            >
              {logs.length === 0 && running ? (
                <span className="text-muted-foreground">Starting...</span>
              ) : (
                logs.map((line, i) => {
                  const isFail = line.includes('FAIL') || line.includes('[stderr]');
                  const isPass = line.includes('PASS');
                  return (
                    <div
                      key={i}
                      className={cn(
                        isFail && 'text-destructive',
                        isPass && 'text-green-600 dark:text-green-400',
                      )}
                    >
                      {line}
                    </div>
                  );
                })
              )}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Results: {results.summary.passed}/{results.summary.total} passed (
                {passRate}%)
              </CardTitle>
              <div className="flex items-center gap-3 text-sm">
                <Badge
                  variant="default"
                  className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {results.summary.passed} passed
                </Badge>
                {results.summary.failed > 0 && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    {results.summary.failed} failed
                  </Badge>
                )}
                {results.summary.errors > 0 && (
                  <Badge variant="secondary">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {results.summary.errors} errors
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  Cost: ${results.summary.totalCostUsd.toFixed(3)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-4 py-2 font-medium">Scenario</th>
                    <th className="text-left px-4 py-2 font-medium">Assistant</th>
                    <th className="text-left px-4 py-2 font-medium">Category</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Duration</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-b last:border-0',
                        r.status === 'fail' && 'bg-destructive/5',
                        r.status === 'error' && 'bg-yellow-50 dark:bg-yellow-900/10',
                      )}
                    >
                      <td className="px-4 py-2">
                        <div>{r.name}</div>
                        {r.failureReason && (
                          <div className="text-xs text-destructive mt-0.5 max-w-md truncate">
                            {r.failureReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {r.targetAssistant}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-xs">
                          {r.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {r.status === 'pass' && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Pass
                          </Badge>
                        )}
                        {r.status === 'fail' && (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Fail
                          </Badge>
                        )}
                        {r.status === 'error' && (
                          <Badge variant="secondary">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {r.durationMs < 1000
                          ? `${r.durationMs}ms`
                          : `${(r.durationMs / 1000).toFixed(1)}s`}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        ${r.costUsd.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
