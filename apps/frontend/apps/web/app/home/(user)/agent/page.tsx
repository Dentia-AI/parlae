import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Phone, Settings, BarChart3, FileText, Mic, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { loadUserWorkspace } from '../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';

export const metadata = {
  title: 'AI Agents Dashboard',
};

export default async function ReceptionistDashboardPage() {
  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  // Get the personal account details with phone integration
  const account = workspace.workspace.id 
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
        },
      })
    : null;

  // Check if receptionist is fully configured
  // Must have method != 'none' AND have vapiSquadId in settings
  const integrationSettings = account?.phoneIntegrationSettings as any;
  const hasReceptionist = account?.phoneIntegrationMethod && 
                          account.phoneIntegrationMethod !== 'none' &&
                          integrationSettings?.vapiSquadId;

  // If no receptionist configured, redirect to setup
  if (!hasReceptionist) {
    redirect('/home/agent/setup');
  }

  const phoneNumber = integrationSettings?.phoneNumber || '+1 (555) 555-1234';
  const voiceConfig = integrationSettings?.voiceConfig;
  const isActive = !!integrationSettings?.vapiSquadId;

  const integrationMethodLabels: Record<string, string> = {
    forwarded: 'Call Forwarding',
    ported: 'Ported Number',
    sip: 'SIP Trunk',
    none: 'Not Configured',
  };
  const integrationLabel = integrationMethodLabels[account?.phoneIntegrationMethod || 'none'] || account?.phoneIntegrationMethod || 'Not Configured';

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground mt-2">
          Manage your AI-powered phone agents
        </p>
      </div>

      {/* Status Card */}
      <Card className={isActive ? 'border-green-200 bg-green-50' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-3 ${isActive ? 'bg-green-100' : 'bg-muted'}`}>
                <Phone className={`h-6 w-6 ${isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <CardTitle>
                  {isActive ? 'Active & Answering Calls' : 'Setup Incomplete'}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <CardDescription className="!mb-0">
                    <code className="font-mono">{phoneNumber}</code>
                  </CardDescription>
                  {isActive && (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Live
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Configuration */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Phone Setup</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Phone Number</p>
                <p className="font-mono font-semibold">{phoneNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Integration</p>
                <p className="font-semibold">{integrationLabel}</p>
              </div>
            </div>
            <Link href="/home/agent/phone-settings">
              <Button variant="outline" size="sm" className="w-full mt-4">
                Manage Phone
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Voice</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {voiceConfig ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Voice</p>
                    <p className="font-semibold">{voiceConfig.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-semibold capitalize">
                      {voiceConfig.gender} • {voiceConfig.accent}
                    </p>
                  </div>
                </div>
                <Link href="/home/agent/setup">
                  <Button variant="outline" size="sm" className="w-full">
                    Change Voice
                  </Button>
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-4">No voice configured</p>
                <Link href="/home/agent/setup">
                  <Button variant="outline" size="sm">
                    Configure Voice
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Knowledge Base</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {integrationSettings?.knowledgeBaseFileIds?.length || 0} documents
            </p>
            <Link href="/home/agent/setup/knowledge">
              <Button variant="outline" size="sm" className="w-full">
                Manage Files
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity - Removed from here, moved to dashboard */}
      
      {/* Quick Actions */}
      <div>
        <Link href="/home/agent/setup">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Reconfigure Agent</h3>
                  <p className="text-sm text-muted-foreground">
                    Change voice, knowledge base, or phone setup
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Test Call */}
      <Alert>
        <AlertDescription className="flex items-center justify-between">
          <span>
            <strong>Test your AI receptionist:</strong> Call {phoneNumber} to hear how it sounds
          </span>
          <Button size="sm" variant="outline">
            Test Call
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
