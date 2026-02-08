import { use } from 'react';

import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';
import { Heading } from '@kit/ui/heading';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { formatCurrency } from '@kit/shared/utils';
import { Phone, BarChart3 } from 'lucide-react';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

// local imports
import { HomeLayoutPageHeader } from './_components/home-page-header';
import { loadUserWorkspace } from './_lib/server/load-user-workspace';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('account:homePage');

  return {
    title,
  };
};

function UserHomePage() {
  const { user, workspace, stats } = use(loadUserWorkspace());

  const locale =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : 'en-US';

  const totalSpend = formatCurrency({
    value: (stats.totalSpendCents ?? 0) / 100,
    currencyCode: 'USD',
    locale,
  });

  const totalPayments = formatCurrency({
    value: (stats.totalPaymentsCents ?? 0) / 100,
    currencyCode: 'USD',
    locale,
  });

  const netBalance = formatCurrency({
    value: (stats.netBalanceCents ?? 0) / 100,
    currencyCode: 'USD',
    locale,
  });

  const storageUsed = formatBytes(stats.storageUsedBytes ?? 0);

  return (
    <>
      <HomeLayoutPageHeader
        title={<Trans i18nKey={'common:routes.home'} />}
        description={<Trans i18nKey={'common:homeTabDescription'} />}
      />

      <PageBody>
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Welcome back</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold">{user.email}</p>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">User ID</dt>
                    <dd className="font-mono">{user.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Workspace</dt>
                    <dd className="text-right font-medium">
                      {workspace?.name ?? 'Personal account'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subscription</dt>
                    <dd className="uppercase font-medium">
                      {workspace?.subscription_status ?? 'free'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Financial Overview</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total payments</span>
                  <span className="font-medium">{totalPayments}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ad spend</span>
                  <span className="font-medium">{totalSpend}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Balance</span>
                  <span
                    className={netBalance.startsWith('-') ? 'text-destructive font-medium' : 'text-emerald-600 font-medium'}
                  >
                    {netBalance}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Ads created" value={stats.totalAds} />
            <StatCard label="Active campaigns" value={stats.activeCampaigns} />
            <StatCard label="Assets uploaded" value={stats.totalFiles} />
            <StatCard label="Storage used" value={storageUsed} />
          </div>

          {/* AI Agent Activity Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight">AI Agent Activity</h2>
              <Badge variant="outline" className="gap-1">
                <Phone className="h-3 w-3" />
                Live
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Calls Today" value={0} />
              <StatCard label="Avg. Duration" value="0:00" />
              <StatCard label="Appointments Booked" value={0} />
              <StatCard label="Success Rate" value="--" />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>Recent Calls</CardTitle>
                  </div>
                  <Button variant="ghost" size="sm">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <p>No calls yet. Your AI agent is ready to answer!</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

export default withI18n(UserHomePage);

function StatCard(props: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">
          {props.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{props.value}</div>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
