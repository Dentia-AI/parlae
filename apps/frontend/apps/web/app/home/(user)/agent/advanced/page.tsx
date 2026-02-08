import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Lock, Mail } from 'lucide-react';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';
import { AdvancedSetupContent } from './_components/advanced-setup-content';

export const metadata = {
  title: 'Advanced Setup',
};

export default async function AdvancedSetupPage() {
  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  // Get the personal account to check access
  const account = workspace.workspace.id 
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          advancedSetupEnabled: true,
        },
      })
    : null;

  const hasAccess = account?.advancedSetupEnabled ?? false;

  if (!hasAccess) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Advanced Setup</h1>
          <p className="text-muted-foreground mt-2">
            Advanced configuration for AI agent settings
          </p>
        </div>

        {/* Locked State */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-6 py-8">
              <div className="rounded-full bg-amber-100 p-6">
                <Lock className="h-12 w-12 text-amber-600" />
              </div>
              
              <div className="space-y-2 max-w-lg">
                <h3 className="text-xl font-semibold">Access Required</h3>
                <p className="text-muted-foreground">
                  Advanced setup is restricted and only available in exceptional cases. 
                  The default configuration is optimized for most use cases and typically 
                  does not require modification.
                </p>
              </div>

              <Alert className="max-w-md">
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  If you believe you need access to advanced settings, please contact your 
                  administrator. They can review your request and enable access if appropriate.
                </AlertDescription>
              </Alert>

              <div className="text-sm text-muted-foreground pt-4">
                <p>
                  <strong>Note:</strong> Standard setup options available in the main wizard 
                  are sufficient for the majority of configurations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User has access, show the full advanced setup
  return <AdvancedSetupContent />;
}
