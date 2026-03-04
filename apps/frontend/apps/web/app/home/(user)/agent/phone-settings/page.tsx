import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Separator } from '@kit/ui/separator';
import {
  PhoneCall,
  PhoneForwarded,
  Network,
  Settings,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { Trans } from '@kit/ui/trans';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { formatPhoneDisplay, formatPhoneDialable } from '~/lib/format-phone';

export const metadata = {
  title: 'Phone Integration Settings',
};

const methodInfo = {
  ported: {
    nameKey: 'phoneSettingsPage.portedNumber',
    nameDefault: 'Ported Number',
    icon: PhoneCall,
    descKey: 'phoneSettingsPage.portedDescription',
    descDefault: 'Your number is fully transferred to our system',
  },
  forwarded: {
    nameKey: 'phoneSettingsPage.callForwarding',
    nameDefault: 'Call Forwarding',
    icon: PhoneForwarded,
    descKey: 'phoneSettingsPage.callForwardingDescription',
    descDefault: 'Calls are forwarded from your existing number',
  },
  sip: {
    nameKey: 'phoneSettingsPage.sipTrunk',
    nameDefault: 'SIP Trunk',
    icon: Network,
    descKey: 'phoneSettingsPage.sipDescription',
    descDefault: 'Connected via your PBX system',
  },
} as const;

export default async function PhoneIntegrationSettingsPage() {
  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  const account = workspace.workspace.id
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
          brandingContactPhone: true,
        },
      })
    : null;

  if (!account || !account.phoneIntegrationMethod || account.phoneIntegrationMethod === 'none') {
    redirect('/home/agent/setup/phone');
  }

  const method = account.phoneIntegrationMethod as keyof typeof methodInfo;
  const settings = (account.phoneIntegrationSettings as any) ?? {};
  const currentMethod = methodInfo[method] || methodInfo.forwarded;
  const Icon = currentMethod.icon;

  const clinicNumberRaw = settings.clinicNumber || account.brandingContactPhone || '';
  const twilioNumberRaw = settings.phoneNumber || '';
  const staffDirectNumberRaw = settings.staffDirectNumber || null;
  const clinicNumber = clinicNumberRaw ? formatPhoneDisplay(clinicNumberRaw) : 'Not set';
  const twilioNumber = twilioNumberRaw ? formatPhoneDisplay(twilioNumberRaw) : 'Pending provisioning';
  const staffDirectNumber = staffDirectNumberRaw ? formatPhoneDisplay(staffDirectNumberRaw) : null;
  const dialDigits = formatPhoneDialable(twilioNumberRaw);
  const setupDate = settings.configuredAt
    ? new Date(settings.configuredAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : settings.deployedAt
      ? new Date(settings.deployedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;
  const isActive = !!(settings.vapiSquadId || settings.retellReceptionistAgentId || settings.deployType === 'conversation_flow');

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <Trans i18nKey={'phoneSettingsPage.title'} defaults="Phone Integration" />
        </h1>
        <p className="text-muted-foreground mt-2">
          <Trans i18nKey={'phoneSettingsPage.description'} defaults="Manage how your phone number connects to your AI receptionist" />
        </p>
      </div>

      {/* Current Setup */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>
                  <Trans i18nKey={currentMethod.nameKey} defaults={currentMethod.nameDefault} />
                </CardTitle>
                <CardDescription>
                  <Trans i18nKey={currentMethod.descKey} defaults={currentMethod.descDefault} />
                </CardDescription>
              </div>
            </div>
            {isActive ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                <Trans i18nKey={'phoneSettingsPage.active'} defaults="Active" />
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Trans i18nKey={'phoneSettingsPage.inactive'} defaults="Inactive" />
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phone Numbers */}
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                <Trans i18nKey={'phoneSettingsPage.clinicNumber'} defaults="Your Clinic Number" />
              </div>
              <div className="text-2xl font-bold font-mono">{clinicNumber}</div>
            </div>

            {method === 'forwarded' && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    <Trans i18nKey={'phoneSettingsPage.forwardingTo'} defaults="Forwarding To (Twilio)" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-mono">{twilioNumber}</div>
                  </div>
                </div>
              </>
            )}

            {method === 'ported' && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    <Trans i18nKey={'phoneSettingsPage.vapiPhoneNumber'} defaults="Vapi Phone Number" />
                  </div>
                  <div className="text-lg font-mono">{twilioNumber}</div>
                </div>
              </>
            )}

            {staffDirectNumber && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    <Trans i18nKey={'phoneSettingsPage.staffDirectLine'} defaults="Staff Direct Line (Emergency Transfers)" />
                  </div>
                  <div className="text-lg font-mono">{staffDirectNumber}</div>
                </div>
              </>
            )}
          </div>

          {/* Setup Date */}
          {setupDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              <Trans i18nKey={'phoneSettingsPage.setupCompletedOn'} defaults="Setup completed on {{date}}" values={{ date: setupDate }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Method */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'phoneSettingsPage.changeMethodTitle'} defaults="Change Integration Method" />
          </CardTitle>
          <CardDescription>
            <Trans i18nKey={'phoneSettingsPage.changeMethodDescription'} defaults="Switch to a different phone integration method" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <Trans i18nKey={'phoneSettingsPage.changeMethodWarning'} defaults="Changing your integration method will require reconfiguring your phone setup. Your AI receptionist will be temporarily unavailable during the transition." />
            </p>
          </div>

          <Link href="/home/agent/setup/phone">
            <Button variant="outline" className="w-full">
              <Trans i18nKey={'phoneSettingsPage.changeMethodButton'} defaults="Change Integration Method" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Method-Specific Instructions */}
      {method === 'forwarded' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              <Trans i18nKey={'phoneSettingsPage.forwardingInstructionsTitle'} defaults="Call Forwarding Instructions" />
            </CardTitle>
            <CardDescription>
              <Trans i18nKey={'phoneSettingsPage.forwardingInstructionsDescription'} defaults="How to set up forwarding on your carrier" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {/* Recommended setup */}
            <div className="rounded-xl ring-1 ring-primary/20 bg-primary/[0.04] p-4">
              <h4 className="font-semibold mb-2">
                <Trans i18nKey={'phoneSettingsPage.recommendedSetup'} defaults="Recommended: No-Answer + Busy Forwarding" />
              </h4>
              <p className="text-muted-foreground">
                <Trans i18nKey={'phoneSettingsPage.recommendedSetupDesc'} defaults="Set up both types for complete coverage. Staff answers during hours. If busy or no answer, calls go to AI. After hours, nobody answers, so AI handles it." />
              </p>
            </div>

            {/* Canadian carriers */}
            <div>
              <h4 className="font-semibold mb-2">
                <Trans i18nKey={'phoneSettingsPage.canadianCarriers'} defaults="Canadian Carriers (Bell, Rogers, Telus)" />
              </h4>
              <div className="space-y-3">
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    <Trans i18nKey={'phoneSettingsPage.noAnswerForwarding'} defaults="No-Answer Forwarding" />
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*92 {dialDigits}</strong>
                    <br />
                    Disable: <strong>*93</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    <Trans i18nKey={'phoneSettingsPage.busyForwarding'} defaults="Busy Forwarding" />
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*90 {dialDigits}</strong>
                    <br />
                    Disable: <strong>*91</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    <Trans i18nKey={'phoneSettingsPage.allCalls'} defaults="All Calls (Unconditional)" />
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*72 {dialDigits}</strong>
                    <br />
                    Disable: <strong>*73</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* US carriers */}
            <div>
              <h4 className="font-semibold mb-2">
                <Trans i18nKey={'phoneSettingsPage.usCarriers'} defaults="US Carriers (AT&T, Verizon, T-Mobile)" />
              </h4>
              <div className="space-y-3">
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    <Trans i18nKey={'phoneSettingsPage.noAnswerForwarding'} defaults="No-Answer Forwarding" />
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*61* {dialDigits} #</strong>
                    <br />
                    Disable: <strong>#61#</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    <Trans i18nKey={'phoneSettingsPage.busyForwarding'} defaults="Busy Forwarding" />
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*67* {dialDigits} #</strong>
                    <br />
                    Disable: <strong>#67#</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    <Trans i18nKey={'phoneSettingsPage.allCalls'} defaults="All Calls (Unconditional)" />
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*21* {dialDigits} #</strong>
                    <br />
                    Disable: <strong>#21#</strong>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Support */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'phoneSettingsPage.needHelpTitle'} defaults="Need Help?" />
          </CardTitle>
          <CardDescription>
            <Trans i18nKey={'phoneSettingsPage.needHelpDescription'} defaults="Having issues with your phone integration?" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><Trans i18nKey={'phoneSettingsPage.contactSupport'} defaults="Contact our support team:" /></p>
            <div className="space-y-1">
              <div><Trans i18nKey={'phoneSettingsPage.supportEmail'} defaults="Email: support@parlae.ca" /></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
