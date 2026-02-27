import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Trans } from '@kit/ui/trans';
import { PageBody } from '@kit/ui/page';
import {
  PhoneOutgoing, Heart, DollarSign, Zap, Users, CheckCircle2, ArrowRight,
  CalendarCheck, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { loadUserWorkspace } from '../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';

const PATIENT_CARE_TYPES = ['RECALL', 'REMINDER', 'FOLLOWUP', 'NOSHOW', 'TREATMENT_PLAN', 'POSTOP', 'REACTIVATION', 'SURVEY', 'WELCOME'];

export async function generateMetadata() {
  const i18n = await createI18nServerInstance();
  return { title: i18n.t('common:outbound.pageTitle') };
}

export default async function OutboundOverviewPage() {
  const workspace = await loadUserWorkspace();
  if (!workspace) redirect('/auth/sign-in');

  const i18n = await createI18nServerInstance();
  const accountId = workspace.workspace.id;

  let settings: any = null;
  let campaigns: any[] = [];
  let contacts: any[] = [];

  try {
    settings = await prisma.outboundSettings.findUnique({
      where: { accountId },
    });

    campaigns = await prisma.outboundCampaign.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });

    contacts = await prisma.campaignContact.findMany({
      where: {
        campaign: { accountId },
        status: { not: 'QUEUED' },
      },
      select: {
        status: true,
        outcome: true,
        campaign: { select: { callType: true, channel: true } },
      },
    });
  } catch {
    // Tables may not exist yet
  }

  const patientCareEnabled = settings?.patientCareEnabled || false;
  const financialEnabled = settings?.financialEnabled || false;
  const anyEnabled = patientCareEnabled || financialEnabled;
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
  const totalContacts = campaigns.reduce((sum, c) => sum + c.totalContacts, 0);
  const totalSuccessful = campaigns.reduce((sum, c) => sum + c.successfulCount, 0);
  const totalCompleted = campaigns.reduce((sum, c) => sum + c.completedCount, 0);
  const successRate = totalCompleted > 0 ? Math.round((totalSuccessful / totalCompleted) * 100) : 0;

  const callsByType: Record<string, number> = {};
  const successByChannel: Record<string, { total: number; success: number }> = {};
  const positiveOutcomes = ['booked', 'confirmed', 'paid', 'interested', 'scheduled'];

  for (const c of contacts) {
    const type = c.campaign?.callType ?? 'UNKNOWN';
    callsByType[type] = (callsByType[type] || 0) + 1;

    const channel = c.campaign?.channel ?? 'PHONE';
    if (!successByChannel[channel]) successByChannel[channel] = { total: 0, success: 0 };
    successByChannel[channel]!.total++;
    if (c.status === 'COMPLETED' && c.outcome && positiveOutcomes.includes(c.outcome.toLowerCase())) {
      successByChannel[channel]!.success++;
    }
  }

  const maxCallsByType = Math.max(...Object.values(callsByType), 1);

  const callTypeLabel = (type: string) =>
    i18n.t(`common:outbound.callTypes.${type.toLowerCase()}`, type);
  const channelLabel = (channel: string) =>
    i18n.t(`common:outbound.channels.${channel.toLowerCase()}`, channel);

  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-auto space-y-4">
        <div className="flex-shrink-0">
          <h2 className="text-2xl font-bold tracking-tight">
            <Trans i18nKey="common:outbound.overview.title" />
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            <Trans i18nKey="common:outbound.overview.description" />
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <PhoneOutgoing className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    <Trans i18nKey="common:outbound.overview.totalCampaigns" />
                  </p>
                  <p className="text-2xl font-bold">{campaigns.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
                  <Zap className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    <Trans i18nKey="common:outbound.overview.activeCampaigns" />
                  </p>
                  <p className="text-2xl font-bold">{activeCampaigns}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    <Trans i18nKey="common:outbound.overview.totalContacts" />
                  </p>
                  <p className="text-2xl font-bold">{totalContacts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    <Trans i18nKey="common:outbound.overview.successRate" />
                  </p>
                  <p className="text-2xl font-bold">{successRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Card className={patientCareEnabled ? 'border-green-200 dark:border-green-800' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-3 ${patientCareEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                    <Heart className={`h-6 w-6 ${patientCareEnabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <CardTitle>
                      <Trans i18nKey="common:outbound.patientCare.title" />
                    </CardTitle>
                    <CardDescription>
                      <Trans i18nKey="common:outbound.patientCare.description" />
                    </CardDescription>
                  </div>
                </div>
                {patientCareEnabled && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {i18n.t('common:outbound.campaign.status.active')}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">
                      {i18n.t('common:outbound.overview.campaigns')}
                    </p>
                    <p className="font-semibold">
                      {campaigns.filter((c) => PATIENT_CARE_TYPES.includes(c.callType)).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {i18n.t('common:outbound.overview.active')}
                    </p>
                    <p className="font-semibold">
                      {campaigns.filter((c) => c.status === 'ACTIVE' && PATIENT_CARE_TYPES.includes(c.callType)).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {i18n.t('common:outbound.overview.contacts')}
                    </p>
                    <p className="font-semibold">
                      {campaigns.filter((c) => PATIENT_CARE_TYPES.includes(c.callType)).reduce((s, c) => s + c.totalContacts, 0)}
                    </p>
                  </div>
                </div>
                <Link href="/home/outbound/patient-care">
                  <Button variant="outline" className="w-full mt-2">
                    {patientCareEnabled
                      ? i18n.t('common:outbound.overview.manageCampaigns')
                      : i18n.t('common:outbound.overview.getStarted')}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className={financialEnabled ? 'border-green-200 dark:border-green-800' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-3 ${financialEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                    <DollarSign className={`h-6 w-6 ${financialEnabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <CardTitle>
                      <Trans i18nKey="common:outbound.financial.title" />
                    </CardTitle>
                    <CardDescription>
                      <Trans i18nKey="common:outbound.financial.description" />
                    </CardDescription>
                  </div>
                </div>
                {financialEnabled && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {i18n.t('common:outbound.campaign.status.active')}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">
                      {i18n.t('common:outbound.overview.campaigns')}
                    </p>
                    <p className="font-semibold">
                      {campaigns.filter((c) => ['PAYMENT', 'BENEFITS'].includes(c.callType)).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {i18n.t('common:outbound.overview.active')}
                    </p>
                    <p className="font-semibold">
                      {campaigns.filter((c) => c.status === 'ACTIVE' && ['PAYMENT', 'BENEFITS'].includes(c.callType)).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {i18n.t('common:outbound.overview.contacts')}
                    </p>
                    <p className="font-semibold">
                      {campaigns.filter((c) => ['PAYMENT', 'BENEFITS'].includes(c.callType)).reduce((s, c) => s + c.totalContacts, 0)}
                    </p>
                  </div>
                </div>
                <Link href="/home/outbound/financial">
                  <Button variant="outline" className="w-full mt-2">
                    {financialEnabled
                      ? i18n.t('common:outbound.overview.manageCampaigns')
                      : i18n.t('common:outbound.overview.getStarted')}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {anyEnabled && Object.keys(callsByType).length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  <Trans i18nKey="common:outbound.analytics.callsByType" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(callsByType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>{callTypeLabel(type)}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all"
                            style={{ width: `${(count / maxCallsByType) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  <Trans i18nKey="common:outbound.analytics.successByChannel" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(successByChannel).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    <Trans i18nKey="common:outbound.analytics.noDataYet" />
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(successByChannel).map(([channel, stats]) => {
                      const rate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
                      return (
                        <div key={channel}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>{channelLabel(channel)}</span>
                            <span className="font-medium">{rate}% ({stats.success}/{stats.total})</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {campaigns.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">
              {i18n.t('common:outbound.overview.recentCampaigns')}
            </h3>
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {campaigns.slice(0, 5).map((campaign) => (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-sm">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {callTypeLabel(campaign.callType)} &middot; {channelLabel(campaign.channel)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm">
                          <p>{campaign.completedCount}/{campaign.totalContacts}</p>
                        </div>
                        <Badge
                          variant={
                            campaign.status === 'ACTIVE'
                              ? 'default'
                              : campaign.status === 'COMPLETED'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {i18n.t(`common:outbound.campaign.status.${campaign.status.toLowerCase()}`)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {anyEnabled && (
          <Card className="border-dashed">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">
                  <Trans i18nKey="common:outbound.analytics.roiTitle" />
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  <Trans i18nKey="common:outbound.analytics.comingSoon" />
                </Badge>
              </div>
              <CardDescription>
                <Trans i18nKey="common:outbound.analytics.roiDesc" />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4 opacity-50">
                <div className="text-center p-4">
                  <CalendarCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    {i18n.t('common:outbound.overview.appointmentsBooked')}
                  </p>
                  <p className="text-2xl font-bold text-muted-foreground">--</p>
                </div>
                <div className="text-center p-4">
                  <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    {i18n.t('common:outbound.overview.revenueAttributed')}
                  </p>
                  <p className="text-2xl font-bold text-muted-foreground">--</p>
                </div>
                <div className="text-center p-4">
                  <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    {i18n.t('common:outbound.overview.bestCallTime')}
                  </p>
                  <p className="text-2xl font-bold text-muted-foreground">--</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageBody>
  );
}
