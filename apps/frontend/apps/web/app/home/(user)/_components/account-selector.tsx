'use client';

import { useState } from 'react';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';

import { Button } from '@kit/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@kit/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import { Trans } from '@kit/ui/trans';
import { cn } from '@kit/ui/utils';

type Account = {
  id: string;
  name: string;
  slug: string;
  pictureUrl: string | null;
  isPersonalAccount: boolean;
  role: string;
};

interface AccountSelectorProps {
  accounts: Account[];
  currentAccountId: string | null;
  className?: string;
}

export function AccountSelector({
  accounts,
  currentAccountId,
  className,
}: AccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const currentAccount = accounts.find((acc) => acc.id === currentAccountId);

  // Separate personal and client accounts
  const personalAccounts = accounts.filter((acc) => acc.isPersonalAccount);
  const clientAccounts = accounts.filter((acc) => !acc.isPersonalAccount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select account"
          className={cn('justify-between', className)}
        >
          {currentAccount ? (
            <div className="flex items-center gap-2">
              <ProfileAvatar
                displayName={currentAccount.name}
                pictureUrl={currentAccount.pictureUrl}
                className="h-5 w-5"
              />
              <span className="truncate">{currentAccount.name}</span>
            </div>
          ) : (
            <Trans i18nKey="account:selectAccount" defaults="Select account" />
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>
              <Trans
                i18nKey="account:noAccountsFound"
                defaults="No accounts found."
              />
            </CommandEmpty>

            {personalAccounts.length > 0 && (
              <CommandGroup
                heading={
                  <Trans
                    i18nKey="account:personalAccount"
                    defaults="Personal Account"
                  />
                }
              >
                {personalAccounts.map((account) => (
                  <CommandItem
                    key={account.id}
                    onSelect={() => {
                      // Navigate to personal account home
                      window.location.href = '/home';
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <ProfileAvatar
                      displayName={account.name}
                      pictureUrl={account.pictureUrl}
                      className="h-5 w-5"
                    />
                    <span className="truncate">{account.name}</span>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        currentAccountId === account.id
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {clientAccounts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup
                  heading={
                    <Trans
                      i18nKey="account:clientAccounts"
                      defaults="Client Accounts"
                    />
                  }
                >
                  {clientAccounts.map((account) => (
                    <CommandItem
                      key={account.id}
                      onSelect={() => {
                        // In future, navigate to client account context
                        // For now, just reload to show we can switch accounts
                        window.location.href = '/home';
                        setOpen(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <ProfileAvatar
                        displayName={account.name}
                        pictureUrl={account.pictureUrl}
                        className="h-5 w-5"
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="truncate text-sm">{account.name}</span>
                        <span className="text-muted-foreground truncate text-xs capitalize">
                          {account.role}
                        </span>
                      </div>
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          currentAccountId === account.id
                            ? 'opacity-100'
                            : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setShowCreateModal(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                <Trans
                  i18nKey="account:createClientAccount"
                  defaults="Create Client Account"
                />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans
                i18nKey="account:createClientAccount"
                defaults="Create Client Account"
              />
            </DialogTitle>
            <DialogDescription>
              <Trans
                i18nKey="account:createClientAccountDescription"
                defaults="Create a new client account to manage their team and settings."
              />
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center text-muted-foreground">
            <p>Client account creation form coming soon...</p>
            <p className="text-sm mt-2">
              This feature will allow you to create and manage client accounts.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}

