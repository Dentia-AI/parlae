'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Loader2,
  Trash2,
  RefreshCw,
  Users,
  Bot,
  Phone,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Wrench,
  BrainCircuit,
  Globe,
} from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface SquadMember {
  assistantId: string;
  assistantName: string;
  hasTools: boolean;
  toolCount: number;
  standaloneToolCount?: number;
  inlineToolCount?: number;
  toolNames?: string[];
  standaloneToolIds?: string[];
  serverUrl: string;
  hasAnalysisPlan: boolean;
}

interface StandaloneTool {
  id: string;
  name: string;
  description: string;
  serverUrl: string;
  createdAt: string;
}

interface Squad {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  members: SquadMember[];
  account: {
    accountId: string;
    accountName: string;
    templateVersion: string;
    templateName: string;
    phoneNumber: string;
  } | null;
}

interface OrphanedAssistant {
  id: string;
  name: string;
  createdAt: string;
  hasTools: boolean;
  toolCount: number;
  serverUrl: string;
}

export default function AdminSquadsPage() {
  const [loading, setLoading] = useState(true);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [orphanedAssistants, setOrphanedAssistants] = useState<
    OrphanedAssistant[]
  >([]);
  const [standaloneTools, setStandaloneTools] = useState<StandaloneTool[]>([]);
  const [stats, setStats] = useState({
    totalSquads: 0,
    totalAssistants: 0,
    totalOrphaned: 0,
    totalStandaloneTools: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [redeployingId, setRedeployingId] = useState<string | null>(null);
  const csrfToken = useCsrfToken();

  const fetchSquads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/squads');
      if (!res.ok) throw new Error('Failed to load squads');
      const data = await res.json();
      setSquads(data.squads || []);
      setOrphanedAssistants(data.orphanedAssistants || []);
      setStandaloneTools(data.standaloneTools || []);
      setStats({
        totalSquads: data.totalSquads || 0,
        totalAssistants: data.totalAssistants || 0,
        totalOrphaned: data.totalOrphaned || 0,
        totalStandaloneTools: data.totalStandaloneTools || 0,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSquads();
  }, [fetchSquads]);

  const handleDeleteSquad = async (
    squadId: string,
    deleteAssistants: boolean,
  ) => {
    if (
      !confirm(
        `Delete this squad${deleteAssistants ? ' and its assistants' : ''}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(squadId);
    try {
      const res = await fetch('/api/admin/squads', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ squadId, deleteAssistants }),
      });

      if (!res.ok) throw new Error('Failed to delete squad');
      const data = await res.json();

      toast.success(
        `Deleted ${data.deleted?.length || 0} items. ${data.failed?.length || 0} failed.`,
      );
      await fetchSquads();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAssistant = async (assistantId: string) => {
    if (!confirm('Delete this assistant? This cannot be undone.')) return;

    setDeletingId(assistantId);
    try {
      const res = await fetch('/api/admin/squads', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ squadId: null, assistantIds: [assistantId] }),
      });

      if (!res.ok) throw new Error('Failed to delete assistant');
      toast.success('Assistant deleted');
      await fetchSquads();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRedeploy = async (accountId: string) => {
    if (
      !confirm(
        'Recreate the squad for this account with the latest template? The old squad will be deleted.',
      )
    ) {
      return;
    }

    setRedeployingId(accountId);
    try {
      const res = await fetch('/api/admin/redeploy-squad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ accountId, deleteOldSquad: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to redeploy');
      }

      const data = await res.json();
      toast.success(
        `Squad recreated: ${data.memberCount} assistants, template ${data.templateVersion}`,
      );
      await fetchSquads();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRedeployingId(null);
    }
  };

  const isCorrectUrl = (url: string | undefined) => {
    if (!url) return false;
    return (
      url.includes('api.parlae.ca') || url.includes('localhost:3333')
    );
  };

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vapi Squad Management</h1>
          <p className="text-muted-foreground mt-2">
            View, delete, and recreate squads and assistants
          </p>
        </div>
        <Button onClick={fetchSquads} disabled={loading} variant="outline">
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{stats.totalSquads}</div>
            <p className="text-sm text-muted-foreground">Squads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">{stats.totalAssistants}</div>
            <p className="text-sm text-muted-foreground">
              Total Assistants
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-indigo-600">{stats.totalStandaloneTools}</div>
            <p className="text-sm text-muted-foreground">
              Standalone Tools
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-yellow-600">{stats.totalOrphaned}</div>
            <p className="text-sm text-muted-foreground">
              Orphaned Assistants
            </p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Squads List */}
      {!loading && squads.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No squads found in Vapi.
          </CardContent>
        </Card>
      )}

      {squads.map((squad) => (
        <Card key={squad.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {squad.name || 'Unnamed Squad'}
                  <Badge variant="outline" className="text-xs">
                    {squad.memberCount} members
                  </Badge>
                </CardTitle>
                <CardDescription className="space-y-1 mt-1">
                  <span className="block">ID: {squad.id}</span>
                  <span className="block">
                    Created:{' '}
                    {new Date(squad.createdAt).toLocaleDateString()}
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://dashboard.vapi.ai/squads/${squad.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
                {squad.account && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRedeploy(squad.account!.accountId)}
                    disabled={
                      redeployingId === squad.account.accountId ||
                      !!deletingId
                    }
                  >
                    {redeployingId === squad.account.accountId ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Recreate
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteSquad(squad.id, true)}
                  disabled={!!deletingId}
                >
                  {deletingId === squad.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Delete + Assistants
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Account info */}
            {squad.account && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="font-medium">Linked Account:</span>{' '}
                {squad.account.accountName}
                {squad.account.phoneNumber && (
                  <span className="ml-3 text-muted-foreground">
                    <Phone className="h-3 w-3 inline mr-1" />
                    {squad.account.phoneNumber}
                  </span>
                )}
                {squad.account.templateVersion && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {squad.account.templateVersion}
                  </Badge>
                )}
              </div>
            )}

            {!squad.account && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Not linked to any account — may be an orphaned squad
                </AlertDescription>
              </Alert>
            )}

            {/* Members */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Assistants:</p>
              {squad.members.map((member, idx) => (
                <div
                  key={member.assistantId || idx}
                  className="flex items-center justify-between p-3 rounded-lg border text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {member.assistantName}
                    </span>

                    {/* Tools badge */}
                    {member.hasTools ? (
                      <Badge
                        variant="default"
                        className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        title={member.toolNames?.join(', ') || ''}
                      >
                        <Wrench className="h-3 w-3 mr-1" />
                        {member.toolCount} tools
                        {(member.standaloneToolCount ?? 0) > 0 && (
                          <span className="ml-1 opacity-75">
                            ({member.standaloneToolCount} standalone)
                          </span>
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        No tools
                      </Badge>
                    )}

                    {/* Analysis plan badge */}
                    {member.hasAnalysisPlan ? (
                      <Badge
                        variant="default"
                        className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                      >
                        <BrainCircuit className="h-3 w-3 mr-1" />
                        Structured Output
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs text-yellow-600"
                      >
                        No Analysis
                      </Badge>
                    )}
                  </div>

                  {/* Server URL check */}
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    {member.serverUrl ? (
                      <span
                        className={`text-xs ${isCorrectUrl(member.serverUrl) ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {isCorrectUrl(member.serverUrl) ? (
                          <CheckCircle className="h-3 w-3 inline mr-1" />
                        ) : (
                          <AlertCircle className="h-3 w-3 inline mr-1" />
                        )}
                        {member.serverUrl
                          ? new URL(member.serverUrl).hostname
                          : 'none'}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No server URL
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Standalone Tools */}
      {standaloneTools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5 text-indigo-500" />
              Standalone Tools ({standaloneTools.length})
            </CardTitle>
            <CardDescription>
              Reusable function tools visible in the Vapi Tools UI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {standaloneTools.map((tool) => (
                <div
                  key={tool.id}
                  className="p-3 rounded-lg border text-sm space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{tool.name}</span>
                    <a
                      href={`https://dashboard.vapi.ai/tools`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {tool.description}
                  </p>
                  {tool.serverUrl && (
                    <div className="flex items-center gap-1 text-xs">
                      <Globe className="h-3 w-3" />
                      <span
                        className={
                          isCorrectUrl(tool.serverUrl)
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        {isCorrectUrl(tool.serverUrl) ? (
                          <CheckCircle className="h-3 w-3 inline mr-1" />
                        ) : (
                          <AlertCircle className="h-3 w-3 inline mr-1" />
                        )}
                        {new URL(tool.serverUrl).hostname}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    ID: {tool.id.slice(0, 12)}...
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orphaned Assistants */}
      {orphanedAssistants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Orphaned Assistants ({orphanedAssistants.length})
            </CardTitle>
            <CardDescription>
              Assistants not in any squad — can be safely deleted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {orphanedAssistants.map((assistant) => (
              <div
                key={assistant.id}
                className="flex items-center justify-between p-3 rounded-lg border text-sm"
              >
                <div className="flex items-center gap-3">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span>{assistant.name || 'Unnamed'}</span>
                  <span className="text-xs text-muted-foreground">
                    {assistant.id.slice(0, 8)}...
                  </span>
                  {assistant.hasTools && (
                    <Badge variant="outline" className="text-xs">
                      {assistant.toolCount} tools
                    </Badge>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteAssistant(assistant.id)}
                  disabled={!!deletingId}
                >
                  {deletingId === assistant.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
