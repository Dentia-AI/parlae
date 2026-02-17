import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Phone, Settings, FileText, Mic, CheckCircle2, Calendar, XCircle } from 'lucide-react';
import Link from 'next/link';
import { loadUserWorkspace } from '../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { DeployedBanner } from './_components/deployed-banner';
import { PhoneSetupCard } from './_components/phone-setup-card';
import { PmsIntegrationCard } from './_components/pms-integration-card';

export const metadata = {
  title: 'AI Agents Dashboard',
};

export default async function ReceptionistDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deployed?: string }>;
}) {
  const params = await searchParams;
  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  // Get the personal account details with phone integration and integrations
  const account = workspace.workspace.id 
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          primaryOwnerId: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
          googleCalendarConnected: true,
          googleCalendarEmail: true,
        },
      })
    : null;

  // Check PMS integration from the PmsIntegration model.
  // PMS records may be linked to any account owned by this user (personal or
  // non-personal), so we query across all of them.
  let pmsIntegration: { provider: string; providerName: string | null; status: string; metadata: any } | null = null;
  if (account?.primaryOwnerId) {
    try {
      const allUserAccounts = await prisma.account.findMany({
        where: { primaryOwnerId: account.primaryOwnerId },
        select: { id: true },
      });
      const allAccountIds = allUserAccounts.map((a) => a.id);

      pmsIntegration = await prisma.pmsIntegration.findFirst({
        where: { accountId: { in: allAccountIds } },
        select: {
          provider: true,
          providerName: true,
          status: true,
          metadata: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      // Table may not exist yet
    }
  }

  // Check if receptionist is fully configured
  // Must have method != 'none' AND have vapiSquadId in settings
  const integrationSettings = account?.phoneIntegrationSettings as any;
  const hasReceptionist = account?.phoneIntegrationMethod && 
                          account.phoneIntegrationMethod !== 'none' &&
                          integrationSettings?.vapiSquadId;

  // If no receptionist configured, redirect to setup
  if (!hasReceptionist) {
    redirect('/home/agent/setup');
  }

  const phoneNumber = integrationSettings?.phoneNumber || '+1 (555) 555-1234';
  const voiceConfig = integrationSettings?.voiceConfig;
  const isActive = !!integrationSettings?.vapiSquadId;

  const integrationMethodLabels: Record<string, string> = {
    forwarded: 'Call Forwarding',
    ported: 'Ported Number',
    sip: 'SIP Trunk',
    none: 'Not Configured',
  };
  const integrationLabel = integrationMethodLabels[account?.phoneIntegrationMethod || 'none'] || account?.phoneIntegrationMethod || 'Not Configured';

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      {/* Deployment success banner */}
      {params.deployed === 'true' && (
        <DeployedBanner phoneNumber={phoneNumber} />
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground mt-2">
          Manage your AI-powered phone agents
        </p>
      </div>

      {/* Status Card */}
      <Card className={isActive ? 'bg-green-50/50 dark:bg-green-950/20' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-3 ${isActive ? 'bg-green-100' : 'bg-muted'}`}>
                <Phone className={`h-6 w-6 ${isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <CardTitle>
                  {isActive ? 'Active & Answering Calls' : 'Setup Incomplete'}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <CardDescription className="!mb-0">
                    <code className="font-mono">{phoneNumber}</code>
                  </CardDescription>
                  {isActive && (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Live
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Configuration */}
      <div className="grid md:grid-cols-3 gap-6">
        <PhoneSetupCard
          phoneNumber={phoneNumber}
          integrationLabel={integrationLabel}
          phoneChangeCount={integrationSettings?.phoneChangeCount ?? 0}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Voice</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {voiceConfig ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Voice</p>
                    <p className="font-semibold">{voiceConfig.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-semibold capitalize">
                      {voiceConfig.gender} • {voiceConfig.accent}
                    </p>
                  </div>
                </div>
                <Link href="/home/agent/setup?manage=true">
                  <Button variant="outline" size="sm" className="w-full">
                    Change Voice
                  </Button>
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-4">No voice configured</p>
                <Link href="/home/agent/setup?manage=true">
                  <Button variant="outline" size="sm">
                    Configure Voice
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Knowledge Base</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Documents</p>
                  <p className="font-semibold">
                    {integrationSettings?.knowledgeBaseFileIds?.length || 0} uploaded
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-semibold">
                    {integrationSettings?.queryToolId ? 'Active' : 'Not configured'}
                  </p>
                </div>
              </div>
              <Link href="/home/agent/knowledge">
                <Button variant="outline" size="sm" className="w-full">
                  Manage Files
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integrations */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Integrations</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Google Calendar */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${account?.googleCalendarConnected ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                    <Calendar className={`h-5 w-5 ${account?.googleCalendarConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Google Calendar</h3>
                    {account?.googleCalendarConnected ? (
                      <>
                        <div className="flex items-center gap-1.5 mt-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-xs text-green-700 dark:text-green-400 font-medium">Connected</span>
                        </div>
                        {account.googleCalendarEmail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{account.googleCalendarEmail}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1">
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Not connected</span>
                      </div>
                    )}
                  </div>
                </div>
                <Link href="/home/agent/setup/integrations">
                  <Button variant="outline" size="sm">
                    {account?.googleCalendarConnected ? 'Manage' : 'Connect'}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* PMS */}
          <PmsIntegrationCard
            accountId={account?.id || ''}
            initialStatus={pmsIntegration?.status || null}
            initialProvider={(() => {
              const meta = pmsIntegration?.metadata as any;
              return meta?.actualPmsType && meta.actualPmsType !== 'Unknown'
                ? meta.actualPmsType
                : null;
            })()}
            initialPracticeName={(() => {
              const meta = pmsIntegration?.metadata as any;
              return meta?.practiceName || null;
            })()}
            hasIntegration={!!pmsIntegration}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <Link href="/home/agent/setup">
          <Card className="cursor-pointer hover:shadow-md transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Reconfigure Agent</h3>
                  <p className="text-sm text-muted-foreground">
                    Change voice, knowledge base, or phone setup
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Test Call */}
      <div className="rounded-xl bg-muted/30 px-5 py-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">Test your AI receptionist:</strong> Call {phoneNumber} to hear how it sounds
        </span>
        <Button size="sm" variant="outline">
          Test Call
        </Button>
      </div>
    </div>
  );
}
