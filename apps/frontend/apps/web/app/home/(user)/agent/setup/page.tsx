import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Stepper } from '@kit/ui/stepper';
import { VoiceSelectionForm } from './_components/voice-selection-form';
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
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Set Up Your AI Receptionist</h1>
        <p className="text-muted-foreground mt-2">
          Configure your AI-powered phone receptionist in a few simple steps
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
            <Stepper
              steps={['Voice Selection', 'Knowledge Base', 'Integrations', 'Phone Integration', 'Review & Launch']}
              currentStep={0}
            />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Voice Selection</CardTitle>
          <CardDescription>
            Choose the voice personality for your AI receptionist
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>Loading...</div>}>
            <VoiceSelectionForm 
              accountId={account.id}
              businessName={account.name}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
