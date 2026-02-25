'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Loader2,
  RefreshCw,
  Phone,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Rocket,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Shield,
  Radio,
  Users,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface RoutingStatus {
  activeProvider: string;
  switchedAt: string | null;
  vapiPhoneNumbers: number;
  retellPhoneNumbers: number;
  retellReady: boolean;
  accountOverrides: Array<{
    id: string;
    name: string;
    voiceProviderOverride: string;
  }>;
}

interface Account {
  id: string;
  name: string;
  slug: string;
}

interface RetellDeployment {
  id: string;
  accountId: string;
  retellPhoneId: string;
  phoneNumber: string;
  retellAgentId: string | null;
  retellAgentIds: Record<string, { agentId: string; llmId: string }> | null;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  account: { name: string };
}

export default function AdminVoiceProvidersPage() {
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();

  // Status
  const [status, setStatus] = useState<RoutingStatus | null>(null);
  const [deployments, setDeployments] = useState<RetellDeployment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Deploy form
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployAccountId, setDeployAccountId] = useState('');
  const [deployPhoneNumber, setDeployPhoneNumber] = useState('');
  const [deployDeleteExisting, setDeployDeleteExisting] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // Override form
  const [overrideAccountId, setOverrideAccountId] = useState('');
  const [overrideProvider, setOverrideProvider] = useState<string>('RETELL');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, accountsRes] = await Promise.all([
        fetch('/api/admin/voice-provider'),
        fetch('/api/admin/accounts'),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus({
          activeProvider: statusData.activeProvider || 'RETELL',
          switchedAt: statusData.switchedAt,
          vapiPhoneNumbers: statusData.vapiPhoneNumbers ?? 0,
          retellPhoneNumbers: statusData.retellPhoneNumbers ?? 0,
          retellReady: statusData.retellReady ?? false,
          accountOverrides: statusData.accountOverrides ?? [],
        });
      }

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(accountsData.accounts || []);
      }

      // Fetch account overrides list
      const overridesRes = await fetch('/api/admin/accounts/voice-provider');
      if (overridesRes.ok) {
        const overridesData = await overridesRes.json();
        if (overridesData.accounts) {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  accountOverrides: overridesData.accounts.map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    voiceProviderOverride: a.voiceProviderOverride,
                    retellPhoneNumbers: a.retellPhoneNumbers,
                  })),
                }
              : prev,
          );
        }
      }
    } catch {
      toast.error('Failed to load voice provider data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleToggleGlobal = async (provider: string) => {
    if (
      provider === 'RETELL' &&
      !confirm(
        'Switch ALL accounts to Retell AI? This affects all inbound calls globally. Use per-account overrides for testing instead.',
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/voice-provider', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ provider }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to switch provider');

        toast.success(`Global provider switched to ${provider}`);
        await fetchAll();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleDeploy = async () => {
    if (!deployAccountId) {
      toast.error('Select an account first');
      return;
    }

    setDeploying(true);
    try {
      const res = await fetch('/api/admin/retell-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          accountId: deployAccountId,
          phoneNumber: deployPhoneNumber || undefined,
          deleteExisting: deployDeleteExisting,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deployment failed');

      toast.success(
        `Retell agents deployed! ${Object.keys(data.agents || {}).length} agents created.`,
      );
      setShowDeployForm(false);
      setDeployAccountId('');
      setDeployPhoneNumber('');
      setDeployDeleteExisting(false);
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleSetOverride = async () => {
    if (!overrideAccountId) {
      toast.error('Select an account');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/accounts/voice-provider', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            accountId: overrideAccountId,
            provider: overrideProvider,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to set override');

        toast.success(data.message || 'Override set');
        setOverrideAccountId('');
        await fetchAll();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleClearOverride = async (accountId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/accounts/voice-provider', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ accountId, provider: null }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to clear override');

        toast.success('Override cleared — account will follow global toggle');
        await fetchAll();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  if (loading) {
    return (
      <div className="container max-w-7xl py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const globalProvider = status?.activeProvider || 'RETELL';
  const isRetellGlobal = globalProvider === 'RETELL';

  return (
    <div className="container max-w-7xl py-8 pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Voice Providers
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage Vapi and Retell AI voice providers, deploy agents, and
            configure per-account testing
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAll} disabled={isPending} variant="outline">
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button onClick={() => setShowDeployForm(!showDeployForm)}>
            <Rocket className="h-4 w-4 mr-2" />
            Deploy Retell Agents
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div
              className={`text-3xl font-bold ${isRetellGlobal ? 'text-orange-600' : 'text-blue-600'}`}
            >
              {globalProvider}
            </div>
            <p className="text-sm text-muted-foreground">Global Provider</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-blue-600">
              {status?.vapiPhoneNumbers ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">Vapi Phone Numbers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {status?.retellPhoneNumbers ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">
              Retell Phone Numbers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-purple-600">
              {status?.accountOverrides?.length ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">Account Overrides</p>
          </CardContent>
        </Card>
      </div>

      {/* Global Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Global Voice Provider
          </CardTitle>
          <CardDescription>
            Controls which voice AI platform handles ALL inbound calls (unless
            an account has a per-account override). Switch to Retell only in an
            emergency or for a full cutover.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              variant={!isRetellGlobal ? 'default' : 'outline'}
              onClick={() => handleToggleGlobal('VAPI')}
              disabled={isPending || !isRetellGlobal}
              className="min-w-[120px]"
            >
              {!isRetellGlobal ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <ToggleLeft className="h-4 w-4 mr-2" />
              )}
              Vapi AI
            </Button>
            <Button
              variant={isRetellGlobal ? 'default' : 'outline'}
              onClick={() => handleToggleGlobal('RETELL')}
              disabled={isPending || isRetellGlobal}
              className="min-w-[120px]"
            >
              {isRetellGlobal ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <ToggleRight className="h-4 w-4 mr-2" />
              )}
              Retell AI
            </Button>
            {status?.switchedAt && (
              <span className="text-xs text-muted-foreground">
                Last switched:{' '}
                {new Date(status.switchedAt).toLocaleString()}
              </span>
            )}
          </div>
          {!status?.retellReady && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No active Retell phone numbers found. Deploy Retell agents for
                at least one account before switching globally.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Deploy Retell Agents */}
      {showDeployForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Deploy Retell Agents
            </CardTitle>
            <CardDescription>
              Creates 6 Retell AI agents (receptionist, booking, appointment
              management, patient records, insurance/billing, emergency) for the
              selected account with all PMS tools wired up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Account</Label>
              {accounts.length > 0 ? (
                <select
                  className="w-full border rounded-md p-2.5 bg-background"
                  value={deployAccountId}
                  onChange={(e) => setDeployAccountId(e.target.value)}
                >
                  <option value="">Select an account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.slug})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  placeholder="Account ID (UUID)"
                  value={deployAccountId}
                  onChange={(e) => setDeployAccountId(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Phone Number{' '}
                <span className="text-muted-foreground font-normal">
                  (optional, E.164 format)
                </span>
              </Label>
              <Input
                placeholder="+14165551234"
                value={deployPhoneNumber}
                onChange={(e) => setDeployPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If provided, this number will be imported into Retell and linked
                to the receptionist agent. Leave blank to deploy agents only.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="deleteExisting"
                checked={deployDeleteExisting}
                onChange={(e) => setDeployDeleteExisting(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="deleteExisting" className="font-normal">
                Delete existing Retell agents for this account first
              </Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleDeploy} disabled={deploying}>
                {deploying ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Deploy Agents
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeployForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Account Overrides */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Per-Account Testing
          </CardTitle>
          <CardDescription>
            Override the voice provider for a specific account without affecting
            other accounts. Use this to test Retell end-to-end for one clinic
            while the global toggle stays on Vapi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Set Override Form */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>Account</Label>
              {accounts.length > 0 ? (
                <select
                  className="w-full border rounded-md p-2.5 bg-background"
                  value={overrideAccountId}
                  onChange={(e) => setOverrideAccountId(e.target.value)}
                >
                  <option value="">Select an account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.slug})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  placeholder="Account ID"
                  value={overrideAccountId}
                  onChange={(e) => setOverrideAccountId(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <select
                className="border rounded-md p-2.5 bg-background"
                value={overrideProvider}
                onChange={(e) => setOverrideProvider(e.target.value)}
              >
                <option value="RETELL">Retell AI</option>
                <option value="VAPI">Vapi AI</option>
              </select>
            </div>
            <Button
              onClick={handleSetOverride}
              disabled={isPending || !overrideAccountId}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Set Override
            </Button>
          </div>

          {/* Current Overrides */}
          {status?.accountOverrides && status.accountOverrides.length > 0 ? (
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Active Overrides
              </h4>
              {status.accountOverrides.map((account: any) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{account.name}</span>
                    <Badge
                      variant={
                        account.voiceProviderOverride === 'RETELL'
                          ? 'default'
                          : 'secondary'
                      }
                      className={
                        account.voiceProviderOverride === 'RETELL'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          : ''
                      }
                    >
                      {account.voiceProviderOverride}
                    </Badge>
                    {account.retellPhoneNumbers?.length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {account.retellPhoneNumbers
                          .map((p: any) => p.phoneNumber)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleClearOverride(account.id)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="ml-1">Clear</span>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground pt-2">
              No per-account overrides set. All accounts follow the global
              toggle ({globalProvider}).
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How Voice Routing Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className="mt-0.5 shrink-0 font-mono text-xs"
              >
                1
              </Badge>
              <div>
                <span className="font-medium">Per-account override</span>{' '}
                <span className="text-muted-foreground">
                  — If the account has a{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    voiceProviderOverride
                  </code>{' '}
                  set, that takes priority. Use this for testing Retell on a
                  single clinic.
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className="mt-0.5 shrink-0 font-mono text-xs"
              >
                2
              </Badge>
              <div>
                <span className="font-medium">Global toggle</span>{' '}
                <span className="text-muted-foreground">
                  — If no per-account override exists, the global toggle above
                  determines the provider. Use this for emergency failover.
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className="mt-0.5 shrink-0 font-mono text-xs"
              >
                3
              </Badge>
              <div>
                <span className="font-medium">Default: Vapi</span>{' '}
                <span className="text-muted-foreground">
                  — If neither is set, calls route to Vapi AI.
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
