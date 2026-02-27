import { redirect } from 'next/navigation';
import { Trans } from '@kit/ui/trans';
import { PageBody } from '@kit/ui/page';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';

import { DncListClient } from './_components/dnc-list-client';

export async function generateMetadata() {
  const i18n = await createI18nServerInstance();
  return { title: i18n.t('common:outbound.dnc.title') };
}

export default async function DncPage() {
  const workspace = await loadUserWorkspace();
  if (!workspace) redirect('/auth/sign-in');

  const accountId = workspace.workspace.id;

  let entries: Array<{
    id: string;
    phoneNumber: string;
    reason: string | null;
    source: string;
    createdAt: string;
  }> = [];

  try {
    const raw = await prisma.doNotCallEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
    entries = raw.map((e) => ({
      id: e.id,
      phoneNumber: e.phoneNumber,
      reason: e.reason,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    }));
  } catch {
    // Tables may not exist yet
  }

  return (
    <PageBody className="pt-4 pb-0 min-h-0 overflow-hidden">
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-shrink-0 pb-4">
          <h2 className="text-2xl font-bold tracking-tight">
            <Trans i18nKey="common:outbound.dnc.title" />
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            <Trans i18nKey="common:outbound.dnc.description" />
          </p>
        </div>
        <DncListClient accountId={accountId} initialEntries={entries} />
      </div>
    </PageBody>
  );
}
