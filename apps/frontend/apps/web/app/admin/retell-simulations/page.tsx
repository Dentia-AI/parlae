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

interface ModelResult {
  model: string;
  total: number;
  passed: number;
  failed: number;
  avgLatencyMs: number;
  scenarios: Array<{
    name: string;
    category: string;
    role: string;
    status: 'pass' | 'fail' | 'error';
    latencyMs?: number;
    failureReason?: string;
  }>;
}

interface ComparisonResult {
  timestamp: string;
  suite: string;
  models: ModelResult[];
}

const SUITES = [
  { value: 'all', label: 'All Scenarios' },
  { value: 'booking', label: 'Booking' },
  { value: 'booking-adversarial', label: 'Booking (Adversarial)' },
  { value: 'tools', label: 'Tool Verification' },
  { value: 'handoff', label: 'Handoff / Routing' },
  { value: 'hipaa', label: 'HIPAA Compliance' },
  { value: 'emergency', label: 'Emergency Triage' },
  { value: 'appointment-mgmt', label: 'Appointment Mgmt' },
  { value: 'insurance', label: 'Insurance & Billing' },
  { value: 'patient-records', label: 'Patient Records' },
];

const MODELS = [
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminRetellSimulationsPage() {
  const [suite, setSuite] = useState('all');
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-4.1']);
  const [keepAgents, setKeepAgents] = useState(false);

  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);

  const logRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model)
        ? prev.filter((m) => m !== model)
        : [...prev, model],
    );
  };

  const handleRun = useCallback(async () => {
    if (selectedModels.length === 0) return;

    setRunning(true);
    setLogs([]);
    setResults(null);
    setError(null);
    setConfigCollapsed(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: Record<string, unknown> = {
        suite,
        models: selectedModels,
      };
      if (keepAgents) body.keepAgents = true;

      const res = await fetch('/api/admin/retell-simulations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
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
              // Malformed
            }
          } else if (eventType === 'error') {
            setError(eventData);
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
  }, [suite, selectedModels, keepAgents]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="container max-w-6xl py-8 pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FlaskConical className="h-8 w-8" />
            Flow Simulations
          </h1>
          <p className="text-muted-foreground mt-2">
            Run batch tests against the conversation flow agent using
            Retell&apos;s native simulation API
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button
              onClick={handleRun}
              disabled={!suite || selectedModels.length === 0}
            >
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
                Select suite, models to compare, and optional agent role filter
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
            {/* Suite selection */}
            <div className="space-y-2">
              <Label>Test Suite</Label>
              <select
                value={suite}
                onChange={(e) => setSuite(e.target.value)}
                disabled={running}
                className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {SUITES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <Separator />

            {/* Model selection */}
            <div className="space-y-3">
              <Label>
                Models to Compare{' '}
                <span className="text-muted-foreground font-normal">
                  — deploys a conversation flow agent per model
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {MODELS.map((m) => {
                  const isSelected = selectedModels.includes(m.value);
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleModel(m.value)}
                      disabled={running}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted',
                        running && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {selectedModels.length === 0 && (
                <p className="text-xs text-destructive">
                  Select at least one model
                </p>
              )}
            </div>

            <Separator />

            {/* Options */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="keep-agents"
                checked={keepAgents}
                onChange={(e) => setKeepAgents(e.target.checked)}
                disabled={running}
                className="rounded"
              />
              <Label htmlFor="keep-agents" className="cursor-pointer">
                Keep test agents after run{' '}
                <span className="text-muted-foreground font-normal">
                  — useful for debugging; otherwise cleaned up automatically
                </span>
              </Label>
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
                <span className="text-muted-foreground">
                  Deploying test agents...
                </span>
              ) : (
                logs.map((line, i) => {
                  const isFail =
                    line.includes('FAIL') || line.includes('[stderr]');
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

      {/* Results */}
      {results && results.models && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Comparison Results — {results.suite} suite
            </CardTitle>
            <CardDescription>
              {results.models.length} model
              {results.models.length !== 1 ? 's' : ''} tested at{' '}
              {new Date(results.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {results.models.map((m) => {
                const passRate =
                  m.total > 0
                    ? ((m.passed / m.total) * 100).toFixed(1)
                    : '0.0';
                return (
                  <div
                    key={m.model}
                    className="rounded-lg border p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{m.model}</span>
                      <Badge
                        className={cn(
                          m.failed === 0
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                        )}
                      >
                        {passRate}%
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          {m.passed}
                        </div>
                        <div className="text-muted-foreground">Passed</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-destructive">
                          {m.failed}
                        </div>
                        <div className="text-muted-foreground">Failed</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{m.total}</div>
                        <div className="text-muted-foreground">Total</div>
                      </div>
                    </div>
                    {m.avgLatencyMs > 0 && (
                      <div className="text-xs text-muted-foreground text-center">
                        Avg latency: {(m.avgLatencyMs / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Per-model scenario tables */}
            {results.models.map((m) => (
              <div key={m.model} className="space-y-2">
                <h4 className="text-sm font-semibold">{m.model} — Scenarios</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-4 py-2 font-medium">
                          Scenario
                        </th>
                        <th className="text-left px-4 py-2 font-medium">
                          Role
                        </th>
                        <th className="text-left px-4 py-2 font-medium">
                          Category
                        </th>
                        <th className="text-left px-4 py-2 font-medium">
                          Status
                        </th>
                        <th className="text-right px-4 py-2 font-medium">
                          Latency
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.scenarios.map((s, i) => (
                        <tr
                          key={i}
                          className={cn(
                            'border-b last:border-0',
                            s.status === 'fail' && 'bg-destructive/5',
                            s.status === 'error' &&
                              'bg-yellow-50 dark:bg-yellow-900/10',
                          )}
                        >
                          <td className="px-4 py-2">
                            <div>{s.name}</div>
                            {s.failureReason && (
                              <div className="text-xs text-destructive mt-0.5 max-w-md truncate">
                                {s.failureReason}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {s.role}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-xs">
                              {s.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            {s.status === 'pass' && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Pass
                              </Badge>
                            )}
                            {s.status === 'fail' && (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                Fail
                              </Badge>
                            )}
                            {s.status === 'error' && (
                              <Badge variant="secondary">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Error
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {s.latencyMs
                              ? s.latencyMs < 1000
                                ? `${s.latencyMs}ms`
                                : `${(s.latencyMs / 1000).toFixed(1)}s`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
