'use client';

import { useState, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { MoreVertical, CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface TemplateActionsProps {
  template: {
    id: string;
    isDefault: boolean;
    isActive: boolean;
  };
}

export function TemplateActions({ template }: TemplateActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();

  const handleSetDefault = () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/agent-templates/${template.id}/set-default`, {
          method: 'POST',
          headers: {
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to set as default');
        }

        toast.success('Template set as default');
        router.refresh();
      } catch (error) {
        toast.error('Failed to update template');
      }
    });
  };

  const handleToggleActive = () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/agent-templates/${template.id}/toggle-active`, {
          method: 'POST',
          headers: {
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to toggle status');
        }

        toast.success(template.isActive ? 'Template deactivated' : 'Template activated');
        router.refresh();
      } catch (error) {
        toast.error('Failed to update template');
      }
    });
  };

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/agent-templates/${template.id}`, {
          method: 'DELETE',
          headers: {
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to delete template');
        }

        toast.success('Template deleted');
        router.push('/admin/agent-templates');
      } catch (error) {
        toast.error('Failed to delete template');
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <MoreVertical className="h-4 w-4 mr-2" />
              Actions
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!template.isDefault && (
          <DropdownMenuItem onClick={handleSetDefault}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Set as Default
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleToggleActive}>
          {template.isActive ? (
            <>
              <XCircle className="h-4 w-4 mr-2" />
              Deactivate
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Activate
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
