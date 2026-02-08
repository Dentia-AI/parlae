'use client';

import { useState } from 'react';
import { Home, Settings, Bell, User, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@kit/ui/utils';
import { Badge } from '@kit/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@kit/ui/sheet';
import { useNotifications } from '~/components/notifications/use-notifications';
import { AccountSelector } from './account-selector';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import type { UserWorkspace } from '../_lib/server/load-user-workspace';

interface HomeMobileBottomNavProps {
  workspace: UserWorkspace;
}

export function HomeMobileBottomNav({ workspace }: HomeMobileBottomNavProps) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const { user, accounts } = workspace;

  const navItems = [
    {
      name: 'Home',
      href: '/home',
      icon: Home,
      matches: (path: string) => path === '/home',
    },
    {
      name: 'Notifications',
      href: '/home/notifications',
      icon: Bell,
      badge: unreadCount,
      matches: (path: string) => path.startsWith('/home/notifications'),
    },
  ];

  return (
    <>
      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.matches(pathname);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full relative',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs mt-1">{item.name}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute top-1 right-1/4 h-5 min-w-5 rounded-full px-1 text-xs"
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full',
                  'text-muted-foreground hover:text-foreground',
                )}
              >
                <Menu className="h-5 w-5" />
                <span className="text-xs mt-1">Menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-4">
                {/* Account Selector */}
                <div>
                  <p className="text-sm font-medium mb-2">Switch Account</p>
                  <AccountSelector
                    accounts={accounts}
                    currentAccountId={workspace.id}
                    className="w-full"
                  />
                </div>

                {/* Settings Links */}
                <div>
                  <p className="text-sm font-medium mb-2">Settings</p>
                  <div className="space-y-1">
                    <Link
                      href="/home/settings"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <User className="h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                    <Link
                      href="/home/billing"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Billing</span>
                    </Link>
                    <Link
                      href="/home/employees"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <User className="h-4 w-4" />
                      <span>Team</span>
                    </Link>
                  </div>
                </div>

                {/* Profile Dropdown */}
                <div className="pt-4 border-t">
                  <ProfileAccountDropdownContainer
                    user={user}
                    account={workspace}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Spacer to prevent content from being hidden behind bottom nav */}
      <div className="h-16 md:hidden" />
    </>
  );
}

