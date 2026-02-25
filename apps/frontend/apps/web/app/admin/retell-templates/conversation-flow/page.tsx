'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Badge } from '@kit/ui/badge';
import { Alert, AlertDescription } from '@kit/ui/alert';
import {
  Play,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';

interface FlowDeployResult {
  agentId: string;
  conversationFlowId: string;
  version: string;
}

export default function ConversationFlowPage() {
  const [accountId, setAccountId] = useState('');
  const [voiceId, setVoiceId] = useState('retell-Chloe');
  const [isDeploying, setIsDeploying] = useState(false);
  const [isTearingDown, setIsTearingDown] = useState(false);
  const [result, setResult] = useState<FlowDeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleDeploy() {
    if (!accountId.trim()) {
      setError('Account ID is required');
      return;
    }

    setIsDeploying(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/retell-deploy-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim(), voiceId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Deploy failed (${res.status})`);
      }

      setResult({
        agentId: data.agentId,
        conversationFlowId: data.conversationFlowId,
        version: data.version,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleTeardown() {
    if (!accountId.trim()) {
      setError('Account ID is required for teardown');
      return;
    }

    setIsTearingDown(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/retell-deploy-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim(), teardownOnly: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Teardown failed (${res.status})`);
      }

      setResult(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Teardown failed');
    } finally {
      setIsTearingDown(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Conversation Flow
          <Badge variant="outline" className="ml-3 text-xs align-middle">
            Prototype
          </Badge>
        </h1>
        <p className="text-muted-foreground mt-2">
          Deploy a single Retell conversation flow agent that replaces the 6-agent squad.
          This is a parallel experiment and does not affect existing squad deployments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deploy Conversation Flow</CardTitle>
          <CardDescription>
            Creates one conversation flow with 9 nodes (receptionist, booking, appointment
            management, patient records, insurance/billing, emergency, FAQ, transfer, end)
            and one agent linked to it. All existing tools and prompts are reused.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Account ID</label>
              <Input
                placeholder="Enter account ID..."
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Voice</label>
              <Input
                placeholder="retell-Chloe"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleDeploy}
              disabled={isDeploying || isTearingDown}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Deploy Conversation Flow
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={handleTeardown}
              disabled={isDeploying || isTearingDown}
            >
              {isTearingDown ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Tearing down...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Teardown
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Deployment Successful
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-md border px-4 py-3 bg-background">
                <div>
                  <div className="text-xs text-muted-foreground">Agent ID</div>
                  <div className="font-mono text-sm">{result.agentId}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(result.agentId, 'agentId')}
                >
                  {copied === 'agentId' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-md border px-4 py-3 bg-background">
                <div>
                  <div className="text-xs text-muted-foreground">Flow ID</div>
                  <div className="font-mono text-sm">{result.conversationFlowId}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(result.conversationFlowId, 'flowId')}
                >
                  {copied === 'flowId' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-md border px-4 py-3 bg-background">
                <div>
                  <div className="text-xs text-muted-foreground">Version</div>
                  <div className="font-mono text-sm">{result.version}</div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`https://dashboard.retellai.com/agents/${result.agentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Retell Dashboard
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Current (Squad):</strong> 6 separate agents with individual LLMs, connected via agent_swap tools.
              Transitions involve handing off the call between agents (latency penalty).
            </p>
            <p>
              <strong>Conversation Flow:</strong> 1 agent, 1 flow with 9 nodes. Transitions are instant
              within the flow (no agent_swap). Shared state via dynamic variables means patient info
              persists across all nodes.
            </p>
            <p>
              Both use the same backend tool endpoints ({`/retell/tools/:name`}) and the same prompts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
