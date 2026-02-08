'use client';

import { useState, useTransition } from 'react';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@kit/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCsrfToken } from '@kit/shared/hooks/use-csrf-token';

interface AssignTemplateFormProps {
  templateId: string;
}

export function AssignTemplateForm({ templateId }: AssignTemplateFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const csrfToken = useCsrfToken();
  const [accountIds, setAccountIds] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleAssign = () => {
    if (!accountIds.trim()) {
      toast.error('Please enter at least one account ID');
      return;
    }

    // Split by comma, newline, or space and clean up
    const ids = accountIds
      .split(/[,\n\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (ids.length === 0) {
      toast.error('Please enter valid account IDs');
      return;
    }

    setResult(null);

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/agent-templates/assign', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({
            templateId,
            accountIds: ids,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to assign template');
        }

        setResult({
          success: true,
          message: `Template assigned to ${data.updated} clinic(s)`,
        });
        toast.success(`Template assigned to ${data.updated} clinic(s)`);
        setAccountIds('');
        router.refresh();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setResult({
          success: false,
          message: errorMessage,
        });
        toast.error(errorMessage);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accountIds">Account IDs</Label>
        <textarea
          id="accountIds"
          className="w-full min-h-[100px] border rounded-md p-2 text-sm"
          placeholder="Enter account IDs (comma or newline separated)&#10;e.g.,&#10;abc-123&#10;def-456&#10;ghi-789"
          value={accountIds}
          onChange={(e) => setAccountIds(e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Enter one or more account IDs separated by commas or newlines
        </p>
      </div>

      {result && (
        <Alert variant={result.success ? 'default' : 'destructive'}>
          {result.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}

      <Button onClick={handleAssign} disabled={pending || !accountIds.trim()} className="w-full">
        {pending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          'Assign Template'
        )}
      </Button>

      <Alert>
        <AlertDescription className="text-xs">
          <strong>Note:</strong> Assigning a template will update the agent configuration while
          preserving user-specific settings like voice selection, knowledge base, and phone integration.
        </AlertDescription>
      </Alert>
    </div>
  );
}
