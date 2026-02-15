'use client';

import React, { useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';

import { InviteEmployeeSchema } from '@kit/shared/employee-management/schema';
import { inviteEmployeeAction } from '@kit/shared/employee-management/server-actions';

interface InviteEmployeeFormProps {
  accountId: string;
  onSuccess?: () => void;
}

export function InviteEmployeeForm({
  accountId,
  onSuccess,
}: InviteEmployeeFormProps) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = React.useState(false);

  const form = useForm<z.infer<typeof InviteEmployeeSchema>>({
    resolver: zodResolver(InviteEmployeeSchema),
    defaultValues: {
      accountId,
      email: '',
      role: 'viewer',
    },
  });

  const onSubmit = (data: z.infer<typeof InviteEmployeeSchema>) => {
    startTransition(async () => {
      try {
        await toast.promise(inviteEmployeeAction(data), {
          loading: 'Sending invitation...',
          success: () => {
            form.reset();
            setOpen(false);
            onSuccess?.();
            return 'Invitation sent successfully!';
          },
          error: (err) => {
            return err?.message || 'Failed to send invitation';
          },
        });
      } catch (error) {
        // Error already handled by toast
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Trans i18nKey="account:inviteEmployee" defaults="Invite Employee" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans
              i18nKey="account:inviteEmployeeTitle"
              defaults="Invite Employee"
            />
          </DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="account:inviteEmployeeDescription"
              defaults="Send an invitation to add a new employee to this account."
            />
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey="common:email" defaults="Email" />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="employee@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey="common:role" defaults="Role" />
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex flex-col">
                          <span className="font-medium">Admin</span>
                          <span className="text-muted-foreground text-xs">
                            All permissions except billing
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="editor">
                        <div className="flex flex-col">
                          <span className="font-medium">Editor</span>
                          <span className="text-muted-foreground text-xs">
                            Can create and edit campaigns/ads
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex flex-col">
                          <span className="font-medium">Viewer</span>
                          <span className="text-muted-foreground text-xs">
                            Read-only access
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                <Trans i18nKey="common:cancel" defaults="Cancel" />
              </Button>
              <Button type="submit" disabled={pending}>
                <Trans
                  i18nKey="account:sendInvitation"
                  defaults="Send Invitation"
                />
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

