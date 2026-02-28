import { redirect } from 'next/navigation';
import { Card, CardContent } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Trans } from '@kit/ui/trans';
import { PageBody } from '@kit/ui/page';
import { DollarSign, Database } from 'lucide-react';
import Link from 'next/link';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { EnableAgentToggle } from '../_components/enable-agent-toggle';
import { CampaignCard } from '../_components/campaign-card';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';

const FINANCIAL_CALL_TYPES = ['PAYMENT', 'BENEFITS'];

export async function generateMetadata() {
  const i18n = await createI18nServerInstance();
  return { title: i18n.t('common:outbound.financial.title') };
}

export default async function FinancialPage() {
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
        callType: { in: FINANCIAL_CALL_TYPES as any },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch {
    // Tables may not exist yet
  }

  const isEnabled = settings?.financialEnabled || false;

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

  const callTypeLabel = (type: string) =>
    i18n.t(`common:outbound.financial.callTypes.${type.toLowerCase()}`, type);

  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-auto space-y-4">
        <div className="flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              <Trans i18nKey="common:outbound.financial.title" />
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              <Trans i18nKey="common:outbound.financial.description" />
            </p>
          </div>
          <EnableAgentToggle
            accountId={accountId}
            group="FINANCIAL"
            enabled={isEnabled}
            pmsConnected={pmsConnected}
          />
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
                <Link href="/home/agent/setup/integrations">
                  <Button size="sm" variant="outline" className="flex-shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40">
                    <Trans i18nKey="common:outbound.pmsRequired.connectPms" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {!isEnabled ? (
          <Card className="border-dashed">
            <CardContent className="pt-10 pb-10 text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {i18n.t('common:outbound.financial.disabledTitle')}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                {i18n.t('common:outbound.financial.disabledDesc')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {FINANCIAL_CALL_TYPES.map((type) => {
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
              <Trans i18nKey="common:outbound.financial.campaigns" />
            </h3>

            {campaigns.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-8 pb-8 text-center">
                  <p className="text-muted-foreground">
                    <Trans i18nKey="common:outbound.financial.noCampaigns" />
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    callTypeLabel={callTypeLabel(campaign.callType)}
                    channelLabel={i18n.t(`common:outbound.channels.${campaign.channel.toLowerCase()}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageBody>
  );
}
