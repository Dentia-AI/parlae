import { redirect } from 'next/navigation';
import { VoiceSelectionPageClient } from './_components/voice-selection-page-client';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { getAccountProvider } from '@kit/shared/voice-provider';

export const metadata = {
  title: 'AI Receptionist Setup - Voice Selection',
};

export default async function ReceptionistSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const manage = params.manage === 'true';

  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  const account = workspace.workspace.id 
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          name: true,
          email: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
          brandingBusinessName: true,
        },
      })
    : null;

  if (!account) {
    redirect('/auth/sign-in');
  }

  const integrationSettings = account.phoneIntegrationSettings as Record<string, unknown> | null;
  const vapiSquadId = (integrationSettings?.vapiSquadId as string) || '';
  const voiceProvider = await getAccountProvider(account.id);

  return (
    <VoiceSelectionPageClient 
      accountId={account.id}
      businessName={account.name}
      accountEmail={account.email || ''}
      savedClinicName={account.brandingBusinessName || ''}
      manage={manage}
      vapiSquadId={vapiSquadId}
      voiceProvider={voiceProvider}
    />
  );
}
