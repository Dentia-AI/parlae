import { redirect } from 'next/navigation';
import { VoiceSelectionPageClient } from './_components/voice-selection-page-client';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';

export const metadata = {
  title: 'AI Receptionist Setup - Voice Selection',
};

export default async function ReceptionistSetupPage() {
  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  // Get the personal account details
  const account = workspace.workspace.id 
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          name: true,
          email: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
        },
      })
    : null;

  if (!account) {
    redirect('/auth/sign-in');
  }

  // Allow accessing setup even if already configured (for editing)
  // Don't redirect if already has receptionist

  return (
    <VoiceSelectionPageClient 
      accountId={account.id}
      businessName={account.name}
      accountEmail={account.email || ''}
    />
  );
}
