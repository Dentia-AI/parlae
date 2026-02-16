import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { CheckCircle2, Plus, Copy, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';

export const metadata = {
  title: 'Agent Templates',
};

export default async function AgentTemplatesPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect('/auth/sign-in');
  }

  // Check if user is admin
  if (!isAdminUser(session.id)) {
    redirect('/404');
  }

  // Fetch all templates
  const templates = await prisma.agentTemplate.findMany({
    orderBy: [
      { isDefault: 'desc' },
      { category: 'asc' },
      { createdAt: 'desc' },
    ],
    include: {
      _count: {
        select: {
          accounts: true,
        },
      },
    },
  });

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Templates</h1>
          <p className="text-muted-foreground mt-2">
            Manage AI agent configurations and versions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/agent-templates/fetch">
            <Button variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Fetch from Squad
            </Button>
          </Link>
          <Link href="/admin/agent-templates/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </Link>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{template.displayName}</CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                      {template.name}
                    </Badge>
                    {template.isDefault && (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                    {!template.isActive && (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                  <CardDescription>
                    {template.description || 'No description provided'}
                  </CardDescription>
                </div>
                <Link href={`/admin/agent-templates/${template.id}`}>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium capitalize">{template.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Version</p>
                  <p className="font-medium font-mono">{template.version}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Clinics Using</p>
                  <p className="font-medium flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {template._count.accounts}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(template.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {templates.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No templates found. Create your first template to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
