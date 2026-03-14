import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Phone, Settings, FileText, Mic, CheckCircle2, Calendar, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Trans } from '@kit/ui/trans';
import { loadUserWorkspace } from '../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { DeployedBanner } from './_components/deployed-banner';
import { DeployingAnimation } from './_components/deploying-animation';
import { PhoneSetupCard } from './_components/phone-setup-card';
import { PmsIntegrationCard } from './_components/pms-integration-card';
import { CallForwardingInstructions } from './_components/call-forwarding-instructions';
import { SetupRedirect } from '../_components/setup-redirect';
import { getAccountProvider } from '@kit/shared/voice-provider';
import { DEFAULT_VOICE_ID } from '@kit/shared/retell/templates/dental-clinic.retell-template';
import { formatPhoneDisplay } from '~/lib/format-phone';

export const metadata = {
  title: 'AI Agents Dashboard',
};

export default async function ReceptionistDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ deployed?: string; deploying?: string }>;
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

  if (!account) {
    return <SetupRedirect />;
  }

  const integrationSettings = account.phoneIntegrationSettings as any;
  const activeProvider = await getAccountProvider(account.id);

  // Look up Retell deployment info if this account uses Retell
  let retellVoiceInfo: { voiceId: string; voiceName: string } | null = null;
  let hasRetellDeployment = !!(
    integrationSettings?.retellAgentIds ||
    integrationSettings?.retellReceptionistAgentId
  );

  if (activeProvider === 'RETELL' && account.id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retellPhone = await (prisma as any).retellPhoneNumber.findFirst({
        where: { accountId: account.id },
        select: { retellAgentIds: true },
      });
      if (retellPhone?.retellAgentIds) {
        hasRetellDeployment = true;
        const savedVoice = integrationSettings?.voiceConfig;
        retellVoiceInfo = savedVoice
          ? { voiceId: savedVoice.voiceId, voiceName: savedVoice.name }
          : { voiceId: DEFAULT_VOICE_ID, voiceName: 'Chloe' };
      }
    } catch {
      // RetellPhoneNumber model may not be generated yet
    }
  }

  const hasVapiReceptionist = !!integrationSettings?.vapiSquadId;

  const hasReceptionist = account.phoneIntegrationMethod &&
                          account.phoneIntegrationMethod !== 'none' &&
                          (activeProvider === 'RETELL' ? hasRetellDeployment : hasVapiReceptionist);

  const isDeploying = integrationSettings?.deploymentStatus === 'in_progress';
  const deploymentFailed = integrationSettings?.deploymentStatus === 'failed';

  // Show deploying animation while setup is in progress (including re-deploys)
  if (isDeploying || params.deploying === 'true') {
    return (
      <DeployingAnimation
        startedAt={integrationSettings?.deploymentStartedAt}
        deploymentError={null}
      />
    );
  }

  // Show failed state if deployment failed and no working agent to fall back to
  if (!hasReceptionist && deploymentFailed) {
    return (
      <DeployingAnimation
        startedAt={integrationSettings?.deploymentStartedAt}
        deploymentError={integrationSettings?.deploymentError || 'Deployment failed. Please try again.'}
      />
    );
  }

  // If no receptionist configured and not deploying, redirect to setup
  if (!hasReceptionist) {
    return <SetupRedirect />;
  }

  const phoneNumber = integrationSettings?.phoneNumber || '+1 (555) 555-1234';
  const voiceConfig = integrationSettings?.voiceConfig;
  const isActive = activeProvider === 'RETELL' ? hasRetellDeployment : hasVapiReceptionist;

  const displayVoice = activeProvider === 'RETELL' && retellVoiceInfo
    ? { name: retellVoiceInfo.voiceName, gender: voiceConfig?.gender || 'female', accent: voiceConfig?.accent || 'American' }
    : voiceConfig;

  const integrationMethod = account?.phoneIntegrationMethod || 'none';
  const displayPhone = formatPhoneDisplay(phoneNumber);

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-6">
      {/* Deployment success banner + forwarding instructions */}
      {params.deployed === 'true' && (
        <DeployedBanner
          phoneNumber={phoneNumber}
          clinicNumber={integrationSettings?.clinicNumber}
          integrationMethod={account.phoneIntegrationMethod || undefined}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight"><Trans i18nKey="common:agentOverview.title" /></h1>
        <p className="text-muted-foreground mt-2">
          <Trans i18nKey="common:agentOverview.description" />
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
                  {isActive ? <Trans i18nKey="common:agentOverview.activeStatus" /> : <Trans i18nKey="common:agentOverview.setupIncomplete" />}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <CardDescription className="!mb-0">
                    <code className="font-mono">{displayPhone}</code>
                  </CardDescription>
                  {isActive && (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      <Trans i18nKey="common:agentOverview.live" />
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
          displayPhone={displayPhone}
          integrationMethod={integrationMethod}
          phoneChangeCount={integrationSettings?.phoneChangeCount ?? 0}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <CardTitle><Trans i18nKey="common:agentOverview.voice" /></CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {displayVoice ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground"><Trans i18nKey="common:agentOverview.voiceLabel" /></p>
                    <p className="font-semibold">{displayVoice.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground"><Trans i18nKey="common:agentOverview.typeLabel" /></p>
                    <p className="font-semibold capitalize">
                      {displayVoice.gender} • {displayVoice.accent}
                    </p>
                  </div>
                </div>
                <Link href="/home/agent/setup?manage=true">
                  <Button variant="outline" size="sm" className="w-full">
                    <Trans i18nKey="common:agentOverview.changeVoice" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-4"><Trans i18nKey="common:agentOverview.noVoice" /></p>
                <Link href="/home/agent/setup?manage=true">
                  <Button variant="outline" size="sm">
                    <Trans i18nKey="common:agentOverview.configureVoice" />
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
              <CardTitle><Trans i18nKey="common:agentOverview.knowledgeBase" /></CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground"><Trans i18nKey="common:agentOverview.documents" /></p>
                  <p className="font-semibold">
                    <Trans i18nKey="common:agentOverview.uploaded" values={{ count: integrationSettings?.knowledgeBaseFileIds?.length || 0 }} />
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground"><Trans i18nKey="common:agentOverview.kbStatus" /></p>
                  <p className="font-semibold">
                    {integrationSettings?.queryToolId ? <Trans i18nKey="common:agentOverview.kbActive" /> : <Trans i18nKey="common:agentOverview.kbNotConfigured" />}
                  </p>
                </div>
              </div>
              <Link href="/home/agent/knowledge">
                <Button variant="outline" size="sm" className="w-full">
                  <Trans i18nKey="common:agentOverview.manageFiles" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call Forwarding Instructions (always visible for forwarded method) */}
      {account.phoneIntegrationMethod === 'forwarded' && params.deployed !== 'true' && (
        <CallForwardingInstructions
          twilioNumber={phoneNumber}
          clinicNumber={integrationSettings?.clinicNumber}
          defaultExpanded={false}
        />
      )}

      {/* Integrations */}
      <div>
        <h2 className="text-lg font-semibold mb-3"><Trans i18nKey="common:agentOverview.integrations" /></h2>
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
                    <h3 className="font-semibold text-sm"><Trans i18nKey="common:agentOverview.googleCalendar" /></h3>
                    {account?.googleCalendarConnected ? (
                      <>
                        <div className="flex items-center gap-1.5 mt-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-xs text-green-700 dark:text-green-400 font-medium"><Trans i18nKey="common:agentOverview.connected" /></span>
                        </div>
                        {account.googleCalendarEmail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{account.googleCalendarEmail}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1">
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground"><Trans i18nKey="common:agentOverview.notConnected" /></span>
                      </div>
                    )}
                  </div>
                </div>
                <Link href="/home/agent/integrations">
                  <Button variant="outline" size="sm">
                    {account?.googleCalendarConnected ? <Trans i18nKey="common:agentOverview.manage" /> : <Trans i18nKey="common:agentOverview.connect" />}
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
                  <h3 className="font-semibold"><Trans i18nKey="common:agentOverview.reconfigure" /></h3>
                  <p className="text-sm text-muted-foreground">
                    <Trans i18nKey="common:agentOverview.reconfigureDesc" />
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
          <strong className="text-foreground"><Trans i18nKey="common:agentOverview.testCallLabel" /></strong>{' '}
          <Trans i18nKey="common:agentOverview.testCallDesc" values={{ number: displayPhone }} />
        </span>
        <Button size="sm" variant="outline">
          <Trans i18nKey="common:agentOverview.testCall" />
        </Button>
      </div>
    </div>
  );
}
