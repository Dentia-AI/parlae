import { redirect } from 'next/navigation';
import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Trans } from '@kit/ui/trans';
import { PageBody } from '@kit/ui/page';
import { Heart, PhoneOutgoing, MessageSquare, Mail } from 'lucide-react';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { EnableAgentToggle } from '../_components/enable-agent-toggle';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';

const PATIENT_CARE_CALL_TYPES = [
  'RECALL', 'REMINDER', 'FOLLOWUP', 'NOSHOW', 'TREATMENT_PLAN',
  'POSTOP', 'REACTIVATION', 'SURVEY', 'WELCOME',
];

const CHANNEL_ICONS: Record<string, typeof PhoneOutgoing> = {
  PHONE: PhoneOutgoing,
  SMS: MessageSquare,
  EMAIL: Mail,
};

export async function generateMetadata() {
  const i18n = await createI18nServerInstance();
  return { title: i18n.t('common:outbound.patientCare.title') };
}

export default async function PatientCarePage() {
  const workspace = await loadUserWorkspace();
  if (!workspace) redirect('/auth/sign-in');

  const i18n = await createI18nServerInstance();
  const accountId = workspace.workspace.id;

  let settings: any = null;
  let campaigns: any[] = [];

  try {
    settings = await prisma.outboundSettings.findUnique({
      where: { accountId },
    });

    campaigns = await prisma.outboundCampaign.findMany({
      where: {
        accountId,
        callType: { in: PATIENT_CARE_CALL_TYPES as any },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch {
    // Tables may not exist yet
  }

  const isEnabled = settings?.patientCareEnabled || false;

  const callTypeLabel = (type: string) =>
    i18n.t(`common:outbound.patientCare.callTypes.${type.toLowerCase()}`, type);

  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-auto space-y-4">
        <div className="flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              <Trans i18nKey="common:outbound.patientCare.title" />
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              <Trans i18nKey="common:outbound.patientCare.description" />
            </p>
          </div>
          <EnableAgentToggle
            accountId={accountId}
            group="PATIENT_CARE"
            enabled={isEnabled}
          />
        </div>

        {!isEnabled ? (
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 text-center">
            <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {i18n.t('common:outbound.patientCare.disabledTitle')}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              {i18n.t('common:outbound.patientCare.disabledDesc')}
            </p>
          </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              {PATIENT_CARE_CALL_TYPES.map((type) => {
                const typeCampaigns = campaigns.filter((c) => c.callType === type);
                const active = typeCampaigns.filter((c) => c.status === 'ACTIVE').length;
                const total = typeCampaigns.reduce((s, c) => s + c.totalContacts, 0);

                return (
                  <Card key={type} className="hover:shadow-sm transition-shadow">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">{callTypeLabel(type)}</p>
                        {active > 0 && (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            {i18n.t('common:outbound.campaign.activeCount', { count: active })}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{i18n.t('common:outbound.campaign.campaignsCount', { count: typeCampaigns.length })}</span>
                        <span>{i18n.t('common:outbound.campaign.contactsCount', { count: total })}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <h3 className="text-lg font-semibold">
              <Trans i18nKey="common:outbound.patientCare.campaigns" />
            </h3>

            {campaigns.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-8 pb-8 text-center">
                  <p className="text-muted-foreground">
                    <Trans i18nKey="common:outbound.patientCare.noCampaigns" />
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {campaigns.map((campaign) => {
                  const ChannelIcon = CHANNEL_ICONS[campaign.channel] || PhoneOutgoing;
                  const progress = campaign.totalContacts > 0
                    ? Math.round((campaign.completedCount / campaign.totalContacts) * 100)
                    : 0;

                  return (
                    <Card key={campaign.id}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="rounded-full bg-muted p-2">
                              <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{campaign.name}</p>
                                {campaign.isAutoGenerated && (
                                  <Badge variant="outline" className="text-xs">
                                    {i18n.t('common:outbound.campaign.auto')}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {callTypeLabel(campaign.callType)} &middot; {i18n.t(`common:outbound.channels.${campaign.channel.toLowerCase()}`)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right text-sm">
                              <p className="font-medium">{campaign.completedCount}/{campaign.totalContacts}</p>
                              <p className="text-xs text-muted-foreground">
                                {i18n.t('common:outbound.campaign.percentComplete', { percent: progress })}
                              </p>
                            </div>
                            <div className="w-24">
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}
