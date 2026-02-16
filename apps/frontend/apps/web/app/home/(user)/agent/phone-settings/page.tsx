import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Separator } from '@kit/ui/separator';
import {
  PhoneCall,
  PhoneForwarded,
  Network,
  Settings,
  CheckCircle2,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { loadUserWorkspace } from '../../_lib/server/load-user-workspace';
import { prisma } from '@kit/prisma';

export const metadata = {
  title: 'Phone Integration Settings',
};

const methodInfo = {
  ported: {
    name: 'Ported Number',
    icon: PhoneCall,
    description: 'Your number is fully transferred to our system',
  },
  forwarded: {
    name: 'Call Forwarding',
    icon: PhoneForwarded,
    description: 'Calls are forwarded from your existing number',
  },
  sip: {
    name: 'SIP Trunk',
    icon: Network,
    description: 'Connected via your PBX system',
  },
} as const;

export default async function PhoneIntegrationSettingsPage() {
  const workspace = await loadUserWorkspace();

  if (!workspace) {
    redirect('/auth/sign-in');
  }

  const account = workspace.workspace.id
    ? await prisma.account.findUnique({
        where: { id: workspace.workspace.id },
        select: {
          id: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
          brandingContactPhone: true,
        },
      })
    : null;

  if (!account || !account.phoneIntegrationMethod || account.phoneIntegrationMethod === 'none') {
    redirect('/home/agent/setup/phone');
  }

  const method = account.phoneIntegrationMethod as keyof typeof methodInfo;
  const settings = (account.phoneIntegrationSettings as any) ?? {};
  const currentMethod = methodInfo[method] || methodInfo.forwarded;
  const Icon = currentMethod.icon;

  const clinicNumber = settings.clinicNumber || account.brandingContactPhone || 'Not set';
  const twilioNumber = settings.phoneNumber || 'Pending provisioning';
  const staffDirectNumber = settings.staffDirectNumber || null;
  const setupDate = settings.configuredAt
    ? new Date(settings.configuredAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : settings.deployedAt
      ? new Date(settings.deployedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;
  const isActive = !!settings.vapiSquadId;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Phone Integration</h1>
        <p className="text-muted-foreground mt-2">
          Manage how your phone number connects to your AI receptionist
        </p>
      </div>

      {/* Current Setup */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>{currentMethod.name}</CardTitle>
                <CardDescription>{currentMethod.description}</CardDescription>
              </div>
            </div>
            {isActive ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Phone Numbers */}
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Your Clinic Number</div>
              <div className="text-2xl font-bold font-mono">{clinicNumber}</div>
            </div>

            {method === 'forwarded' && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Forwarding To (Twilio)</div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-mono">{twilioNumber}</div>
                  </div>
                </div>
              </>
            )}

            {method === 'ported' && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Vapi Phone Number</div>
                  <div className="text-lg font-mono">{twilioNumber}</div>
                </div>
              </>
            )}

            {staffDirectNumber && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    Staff Direct Line (Emergency Transfers)
                  </div>
                  <div className="text-lg font-mono">{staffDirectNumber}</div>
                </div>
              </>
            )}
          </div>

          {/* Setup Date */}
          {setupDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              Setup completed on {setupDate}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Method */}
      <Card>
        <CardHeader>
          <CardTitle>Change Integration Method</CardTitle>
          <CardDescription>
            Switch to a different phone integration method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Changing your integration method will require reconfiguring your phone setup.
              Your AI receptionist will be temporarily unavailable during the transition.
            </p>
          </div>

          <Link href="/home/agent/setup/phone">
            <Button variant="outline" className="w-full">
              Change Integration Method
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Method-Specific Instructions */}
      {method === 'forwarded' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Call Forwarding Instructions
            </CardTitle>
            <CardDescription>
              How to set up forwarding on your carrier
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {/* Recommended setup */}
            <div className="rounded-xl ring-1 ring-primary/20 bg-primary/[0.04] p-4">
              <h4 className="font-semibold mb-2">
                Recommended: No-Answer + Busy Forwarding
              </h4>
              <p className="text-muted-foreground">
                Set up both types for complete coverage. Staff answers during hours. If busy or
                no answer, calls go to AI. After hours, nobody answers, so AI handles it.
              </p>
            </div>

            {/* Canadian carriers */}
            <div>
              <h4 className="font-semibold mb-2">
                Canadian Carriers (Bell, Rogers, Telus)
              </h4>
              <div className="space-y-3">
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    No-Answer Forwarding
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*92</strong> + {twilioNumber}
                    <br />
                    Disable: <strong>*93</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    Busy Forwarding
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*90</strong> + {twilioNumber}
                    <br />
                    Disable: <strong>*91</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    All Calls (Unconditional)
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*72</strong> + {twilioNumber}
                    <br />
                    Disable: <strong>*73</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* US carriers */}
            <div>
              <h4 className="font-semibold mb-2">
                US Carriers (AT&amp;T, Verizon, T-Mobile)
              </h4>
              <div className="space-y-3">
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    No-Answer Forwarding
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*61*</strong>{twilioNumber}<strong>#</strong>
                    <br />
                    Disable: <strong>#61#</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-green-700 dark:text-green-400 mb-1">
                    Busy Forwarding
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*67*</strong>{twilioNumber}<strong>#</strong>
                    <br />
                    Disable: <strong>#67#</strong>
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-border/30 p-3">
                  <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    All Calls (Unconditional)
                  </div>
                  <div className="mt-1 font-mono text-xs bg-muted/50 p-2 rounded-lg">
                    Activate: <strong>*21*</strong>{twilioNumber}<strong>#</strong>
                    <br />
                    Disable: <strong>#21#</strong>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Support */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Having issues with your phone integration?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>Contact our support team:</p>
            <div className="space-y-1">
              <div>Email: support@parlae.ca</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
