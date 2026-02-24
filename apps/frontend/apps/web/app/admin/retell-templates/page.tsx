import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { CheckCircle2, Plus, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';

export const metadata = {
  title: 'Retell Templates',
};

export default async function RetellTemplatesPage() {
  const session = await getSessionUser();

  if (!session) {
    redirect('/auth/sign-in');
  }

  if (!isAdminUser(session.id)) {
    redirect('/404');
  }

  const templates = await prisma.retellAgentTemplate.findMany({
    orderBy: [
      { isDefault: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      _count: {
        select: { accounts: true },
      },
    },
  });

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Retell Templates</h1>
          <p className="text-muted-foreground mt-2">
            Manage Retell AI agent configurations (LLM prompts, agent settings, routing)
          </p>
        </div>
        <Link href="/admin/retell-templates/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No Retell templates created yet.</p>
            <Link href="/admin/retell-templates/new" className="mt-4 inline-block">
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create First Template
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <Link key={template.id} href={`/admin/retell-templates/${template.id}`}>
              <Card className="cursor-pointer hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{template.displayName}</CardTitle>
                      <Badge variant="secondary">{template.version}</Badge>
                      {template.isDefault && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                      {!template.isActive && (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {template._count.accounts} account{template._count.accounts !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <CardDescription>
                    {template.description || template.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Roles: {Object.keys((template.llmConfigs as any) || {}).join(', ')}
                    </span>
                    <span>
                      Created: {template.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
