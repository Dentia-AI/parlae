import { redirect, notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { Separator } from '@kit/ui/separator';
import { CheckCircle2, Users, Settings, Copy } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { TemplateActions } from './_components/template-actions';
import { AssignTemplateForm } from './_components/assign-template-form';
import { BulkUpgradeDialog } from './_components/bulk-upgrade-dialog';

export const metadata = {
  title: 'Template Details',
};

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionUser();

  if (!session) {
    redirect('/auth/sign-in');
  }

  // Check if user is admin
  if (!isAdminUser(session.id)) {
    redirect('/404');
  }

  const { id } = await params;

  const template = await prisma.agentTemplate.findUnique({
    where: { id },
    include: {
      accounts: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneIntegrationMethod: true,
        },
        take: 100,
      },
      _count: {
        select: {
          accounts: true,
        },
      },
    },
  });

  if (!template) {
    notFound();
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{template.displayName}</h1>
            <Badge variant="outline" className="font-mono">
              {template.name}
            </Badge>
            {template.isDefault && (
              <Badge variant="default">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Default
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {template.description || 'No description provided'}
          </p>
        </div>
        <div className="flex gap-2">
          <BulkUpgradeDialog
            templateId={template.id}
            templateName={template.displayName}
            templateVersion={template.version}
            clinicCount={template._count.accounts}
          />
          <Link href={`/admin/agent-templates/${template.id}/duplicate`}>
            <Button variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          </Link>
          <TemplateActions template={template} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Template Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium capitalize">{template.category}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Version</p>
                  <p className="font-medium font-mono">{template.version}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={template.isActive ? 'default' : 'secondary'}>
                    {template.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(template.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">
                    {new Date(template.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuration Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Template configuration (excludes user-specific settings)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Squad Configuration</p>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-48">
                  {JSON.stringify(template.squadConfig, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Assistant Configuration</p>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-48">
                  {JSON.stringify(template.assistantConfig, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Model Configuration</p>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-48">
                  {JSON.stringify(template.modelConfig, null, 2)}
                </pre>
              </div>

              {template.toolsConfig && (
                <div>
                  <p className="text-sm font-medium mb-2">Tools Configuration</p>
                  <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-48">
                    {JSON.stringify(template.toolsConfig, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Usage Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <div className="text-4xl font-bold">{template._count.accounts}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Clinics using this template
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Assign Template */}
          <Card>
            <CardHeader>
              <CardTitle>Assign Template</CardTitle>
              <CardDescription>
                Apply this template to specific clinics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssignTemplateForm templateId={template.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Clinics Using Template */}
      {template.accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clinics Using This Template</CardTitle>
            <CardDescription>
              {template._count.accounts} clinic(s) currently using this configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {template.accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-sm text-muted-foreground">{account.email}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {account.phoneIntegrationMethod || 'Not configured'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
