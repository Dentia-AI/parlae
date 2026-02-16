'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Zap,
  Users,
  Calendar,
  Database,
  Plus,
  Activity,
  Key,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import Link from 'next/link';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface PmsIntegration {
  id: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  provider: string;
  status: string;
  masterCustomerId: string | null;
  practiceKey: string | null;
  officeId: string | null;
  hasRequestKey: boolean;
  hasRefreshKey: boolean;
  hasSecretKey: boolean;
  tokenExpiry: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  features: any;
  config: any;
  createdAt: string;
  updatedAt: string;
}

interface EnvCheck {
  hasSikkaAppId: boolean;
  hasSikkaAppKey: boolean;
}

export default function AdminPmsPage() {
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();
  const [integrations, setIntegrations] = useState<PmsIntegration[]>([]);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [masterCustomerId, setMasterCustomerId] = useState('');
  const [practiceKey, setPracticeKey] = useState('');
  const [practiceId, setPracticeId] = useState('');
  const [spuInstallationKey, setSpuInstallationKey] = useState('');

  // Test results
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [cronResult, setCronResult] = useState<any>(null);

  const loadIntegrations = async () => {
    try {
      const res = await fetch('/api/admin/pms', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setIntegrations(data.integrations);
        setEnvCheck(data.envCheck);
      }
    } catch {
      toast.error('Failed to load PMS integrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  // Load accounts for dropdown
  const [accounts, setAccounts] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/accounts', {
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success) {
          setAccounts(data.accounts || []);
        }
      } catch {
        // Accounts endpoint might not exist yet
      }
    })();
  }, []);

  const apiCall = async (action: string, extra: Record<string, any> = {}) => {
    const res = await fetch('/api/admin/pms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ action, ...extra }),
    });
    return res.json();
  };

  const handleCreate = () => {
    if (!accountId || !practiceKey || !spuInstallationKey) {
      toast.error('Account ID, Practice Key, and SPU Installation Key are required');
      return;
    }
    startTransition(async () => {
      const result = await apiCall('create', {
        accountId,
        masterCustomerId,
        practiceKey,
        practiceId,
        spuInstallationKey,
      });
      if (result.success) {
        toast.success(result.message);
        setShowCreateForm(false);
        setAccountId('');
        setMasterCustomerId('');
        setPracticeKey('');
        setPracticeId('');
        setSpuInstallationKey('');
        loadIntegrations();
      } else {
        toast.error(result.error || 'Failed to create');
      }
    });
  };

  const handleActivate = (integrationId: string) => {
    startTransition(async () => {
      const result = await apiCall('activate', { integrationId });
      if (result.success) {
        toast.success(`Token activated! Expires: ${result.tokenExpiry}`);
        loadIntegrations();
      } else {
        toast.error(result.error || 'Activation failed');
      }
    });
  };

  const handleTest = (integrationId: string) => {
    startTransition(async () => {
      const result = await apiCall('test', { integrationId });
      setTestResults((prev) => ({ ...prev, [`test-${integrationId}`]: result }));
      if (result.success) {
        toast.success('Connection test passed');
      } else {
        toast.error(result.error || 'Test failed');
      }
    });
  };

  const handleFetchPatients = (integrationId: string) => {
    startTransition(async () => {
      const result = await apiCall('fetch-patients', { integrationId });
      setTestResults((prev) => ({
        ...prev,
        [`patients-${integrationId}`]: result,
      }));
      if (result.success) {
        toast.success(`Fetched ${result.count} patient(s)`);
      } else {
        toast.error(result.error || 'Failed to fetch patients');
      }
    });
  };

  const handleFetchAppointments = (integrationId: string) => {
    startTransition(async () => {
      const result = await apiCall('fetch-appointments', { integrationId });
      setTestResults((prev) => ({
        ...prev,
        [`appointments-${integrationId}`]: result,
      }));
      if (result.success) {
        toast.success(`Fetched ${result.count} appointment(s)`);
      } else {
        toast.error(result.error || 'Failed to fetch appointments');
      }
    });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: any; icon: any }> = {
      ACTIVE: { variant: 'default', icon: CheckCircle2 },
      SETUP_REQUIRED: { variant: 'secondary', icon: AlertCircle },
      ERROR: { variant: 'destructive', icon: XCircle },
      INACTIVE: { variant: 'outline', icon: XCircle },
    };
    const { variant, icon: Icon } = map[status] || map.INACTIVE!;
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="container max-w-7xl py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            PMS Integrations
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage Sikka PMS connections, activate tokens, and test API access.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              startTransition(async () => {
                try {
                  const res = await fetch(
                    '/api/cron/refresh-sikka-tokens?force=true',
                    {
                      headers: { 'x-internal-call': 'true' },
                      credentials: 'include',
                    },
                  );
                  const data = await res.json();
                  setCronResult(data);
                  if (data.success) {
                    toast.success(
                      `Refreshed ${data.summary.success}/${data.summary.total} token(s)`,
                    );
                    loadIntegrations();
                  } else {
                    toast.error(data.error || 'Refresh failed');
                  }
                } catch {
                  toast.error('Failed to trigger token refresh');
                }
              });
            }}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh All Tokens
          </Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Connect PMS
          </Button>
        </div>
      </div>

      {/* Cron Result */}
      {cronResult && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Token Refresh Result</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCronResult(null)}
              >
                Dismiss
              </Button>
            </div>
            <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-48">
              {JSON.stringify(cronResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Environment Check */}
      {envCheck && (
        <Card
          className={
            envCheck.hasSikkaAppId && envCheck.hasSikkaAppKey
              ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5" />
              <div>
                <p className="font-medium text-sm">
                  System Credentials (Environment Variables)
                </p>
                <div className="flex gap-4 mt-1 text-sm">
                  <span className="flex items-center gap-1">
                    SIKKA_APP_ID:{' '}
                    {envCheck.hasSikkaAppId ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    SIKKA_APP_KEY:{' '}
                    {envCheck.hasSikkaAppKey ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </span>
                </div>
                {(!envCheck.hasSikkaAppId || !envCheck.hasSikkaAppKey) && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Set SIKKA_APP_ID and SIKKA_APP_KEY in .env.local (local) or
                    SSM (production) before activating tokens.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Connect New PMS (Sikka)</CardTitle>
            <CardDescription>
              Enter the Sikka practice credentials to link an account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Account</Label>
              {accounts.length > 0 ? (
                <select
                  className="w-full border rounded-md p-2.5 bg-background"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
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
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                />
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Master Customer ID</Label>
                <Input
                  placeholder="D36225"
                  value={masterCustomerId}
                  onChange={(e) => setMasterCustomerId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Practice ID (Office ID) *</Label>
                <Input
                  placeholder="1"
                  value={practiceId}
                  onChange={(e) => setPracticeId(e.target.value)}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Practice Key *</Label>
                <Input
                  placeholder="84A9439BD3627374VGUV"
                  value={practiceKey}
                  onChange={(e) => setPracticeKey(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>SPU Installation Key *</Label>
                <Input
                  placeholder="STc3kSY7S4ORJHb5..."
                  value={spuInstallationKey}
                  onChange={(e) => setSpuInstallationKey(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                Save Integration
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Integrations */}
      {integrations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No PMS Integrations</p>
            <p className="text-muted-foreground mt-1">
              Click &quot;Connect PMS&quot; to add Sikka credentials for an
              account.
            </p>
          </CardContent>
        </Card>
      ) : (
        integrations.map((integration) => (
          <Card key={integration.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    {integration.accountName || integration.accountId}
                    {statusBadge(integration.status)}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Provider: {integration.provider} | Customer:{' '}
                    {integration.masterCustomerId || 'N/A'} | Office:{' '}
                    {integration.officeId || 'N/A'} | Practice Key:{' '}
                    {integration.practiceKey || 'N/A'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Token Status */}
              <div className="rounded-lg border p-3 space-y-2">
                <h4 className="text-sm font-medium">Token Status</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Request Key:</span>{' '}
                    {integration.hasRequestKey ? (
                      <Badge
                        variant="outline"
                        className="text-green-600 border-green-300"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600">
                        Missing
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Refresh Key:</span>{' '}
                    {integration.hasRefreshKey ? (
                      <Badge
                        variant="outline"
                        className="text-green-600 border-green-300"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600">
                        Missing
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expires:</span>{' '}
                    {integration.tokenExpiry
                      ? new Date(integration.tokenExpiry).toLocaleString()
                      : 'N/A'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Sync:</span>{' '}
                    {integration.lastSyncAt
                      ? new Date(integration.lastSyncAt).toLocaleString()
                      : 'Never'}
                  </div>
                </div>

                {integration.lastError && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {integration.lastError}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleActivate(integration.id)}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Zap className="h-4 w-4 mr-1" />
                  )}
                  Activate Token
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest(integration.id)}
                  disabled={pending || !integration.hasRequestKey}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Test Connection
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleFetchPatients(integration.id)}
                  disabled={pending || !integration.hasRequestKey}
                >
                  <Users className="h-4 w-4 mr-1" />
                  Fetch Patients
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleFetchAppointments(integration.id)}
                  disabled={pending || !integration.hasRequestKey}
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  Fetch Appointments
                </Button>
              </div>

              {/* Test Results */}
              {Object.entries(testResults)
                .filter(([key]) => key.includes(integration.id))
                .map(([key, result]) => (
                  <div key={key} className="rounded-lg border p-3">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {key.replace(`-${integration.id}`, '').replace('-', ' ')}
                    </h4>
                    <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-64">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
