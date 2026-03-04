import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Trans } from '@kit/ui/trans';
import { PhoneOutgoing, ShieldBan, Database, Settings2 } from 'lucide-react';
import { Button } from '@kit/ui/button';
import Link from 'next/link';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { EnableAgentToggle } from '../_components/enable-agent-toggle';
import { AutoApproveToggle } from '../_components/auto-approve-toggle';
import { ChannelPreferences } from '../_components/channel-preferences';

export const metadata = {
  title: 'Outbound Calling Settings',
};

export default async function OutboundSettingsPage() {
  const workspace = await loadUserWorkspace();
  if (!workspace) redirect('/auth/sign-in');

  const accountId = workspace.workspace.id;

  let settings: any = null;
  try {
    settings = await prisma.outboundSettings.findUnique({
      where: { accountId },
    });
  } catch {
    // Table may not exist yet
  }

  const allAccountIds = workspace.accounts.map((a) => a.id);
  let pmsConnected = false;
  try {
    const pmsIntegration = await prisma.pmsIntegration.findFirst({
      where: { accountId: { in: allAccountIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    pmsConnected = !!pmsIntegration;
  } catch {
    // Table may not exist yet
  }

  const patientCareEnabled = settings?.patientCareEnabled || false;
  const financialEnabled = settings?.financialEnabled || false;
  const autoApproveCampaigns = settings?.autoApproveCampaigns || false;
  const channelDefaults = (settings?.channelDefaults as Record<string, string>) || {};

  return (
    <div className="container max-w-2xl py-8 space-y-6 mx-auto">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            <Trans i18nKey="common:outbound.settings.title" defaults="Outbound Calling Settings" />
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            <Trans i18nKey="common:outbound.settings.description" defaults="Configure outbound calling programs and automation rules." />
          </p>
        </div>

        {!pmsConnected && (
          <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 dark:bg-amber-900/40 p-2 flex-shrink-0">
                  <Database className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                    <Trans i18nKey="common:outbound.pmsRequired.title" />
                  </h3>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                    <Trans i18nKey="common:outbound.pmsRequired.description" />
                  </p>
                </div>
                <Link href="/home/agent/integrations">
                  <Button size="sm" variant="outline" className="flex-shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40">
                    <Trans i18nKey="common:outbound.pmsRequired.connectPms" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PhoneOutgoing className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">
                <Trans i18nKey="common:outbound.settings.programsTitle" defaults="Outbound Programs" />
              </CardTitle>
            </div>
            <CardDescription>
              <Trans i18nKey="common:outbound.settings.programsDescription" defaults="Enable or disable outbound calling programs. When enabled, campaigns are automatically generated from your PMS data." />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  <Trans i18nKey="common:outbound.settings.patientCare" defaults="Patient Care" />
                </p>
                <p className="text-xs text-muted-foreground">
                  <Trans i18nKey="common:outbound.settings.patientCareDesc" defaults="Recalls, reminders, follow-ups, no-shows, reactivation" />
                </p>
              </div>
              <EnableAgentToggle
                accountId={accountId}
                group="PATIENT_CARE"
                enabled={patientCareEnabled}
                pmsConnected={pmsConnected}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  <Trans i18nKey="common:outbound.settings.financial" defaults="Financial" />
                </p>
                <p className="text-xs text-muted-foreground">
                  <Trans i18nKey="common:outbound.settings.financialDesc" defaults="Outstanding balances, payment reminders, insurance follow-ups" />
                </p>
              </div>
              <EnableAgentToggle
                accountId={accountId}
                group="FINANCIAL"
                enabled={financialEnabled}
                pmsConnected={pmsConnected}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <Trans i18nKey="common:outbound.settings.automationTitle" defaults="Automation" />
            </CardTitle>
            <CardDescription>
              <Trans i18nKey="common:outbound.settings.automationDescription" defaults="Control how campaigns are processed after they are generated." />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  <Trans i18nKey="common:outbound.settings.autoApprove" defaults="Auto-approve campaigns" />
                </p>
                <p className="text-xs text-muted-foreground">
                  <Trans i18nKey="common:outbound.settings.autoApproveDesc" defaults="When enabled, new campaigns start automatically without manual review. When disabled, campaigns are created as drafts requiring approval." />
                </p>
              </div>
              <AutoApproveToggle enabled={autoApproveCampaigns} />
            </div>
          </CardContent>
        </Card>

        {(patientCareEnabled || financialEnabled) && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">
                  <Trans i18nKey="common:outbound.channelPrefs.title" defaults="Channel Preferences" />
                </CardTitle>
              </div>
              <CardDescription>
                <Trans i18nKey="common:outbound.channelPrefs.description" defaults="Choose how each campaign type reaches your patients — by phone call, SMS, or email." />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChannelPreferences
                channelDefaults={channelDefaults}
                patientCareEnabled={patientCareEnabled}
                financialEnabled={financialEnabled}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldBan className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">
                <Trans i18nKey="common:outbound.settings.dncTitle" defaults="Do Not Call List" />
              </CardTitle>
            </div>
            <CardDescription>
              <Trans i18nKey="common:outbound.settings.dncDescription" defaults="Manage phone numbers that should never be contacted by outbound campaigns." />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/home/outbound/dnc">
              <Button variant="outline" className="w-full">
                <ShieldBan className="h-4 w-4 mr-2" />
                <Trans i18nKey="common:outbound.settings.manageDnc" defaults="Manage DNC List" />
              </Button>
            </Link>
          </CardContent>
        </Card>
    </div>
  );
}
