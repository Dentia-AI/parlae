'use client';

import { useState } from 'react';
import { Home, Bell, Bot, User, Menu, ToggleLeft, Palette, CreditCard, Users, UserCog, FileText } from 'lucide-react';
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
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import type { UserWorkspace } from '../_lib/server/load-user-workspace';

interface HomeMobileBottomNavProps {
  workspace: UserWorkspace;
}

export function HomeMobileBottomNav({ workspace }: HomeMobileBottomNavProps) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const { user } = workspace;

  const navItems = [
    {
      name: 'Home',
      href: '/home',
      icon: Home,
      matches: (path: string) => path === '/home',
    },
    {
      name: 'AI Agent',
      href: '/home/agent',
      icon: Bot,
      matches: (path: string) => path.startsWith('/home/agent'),
    },
    {
      name: 'Logs',
      href: '/home/call-logs',
      icon: FileText,
      matches: (path: string) => path.startsWith('/home/call-logs'),
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
              </Link>
            );
          })}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full relative',
                  'text-muted-foreground hover:text-foreground',
                )}
              >
                <Menu className="h-5 w-5" />
                <span className="text-xs mt-1">Menu</span>
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute top-1 right-1/4 h-4 min-w-4 rounded-full px-1 text-[10px]"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-4">
                {/* Notifications */}
                <Link
                  href="/home/notifications"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <div className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-4 min-w-4 rounded-full px-1 text-[10px]"
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({unreadCount} unread)
                      </span>
                    )}
                  </div>
                </Link>

                {/* Account Settings */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    Account Settings
                  </p>
                  <div className="space-y-1">
                    <Link
                      href="/home/settings"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-sm">Profile</span>
                    </Link>
                    <Link
                      href="/home/settings/branding"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <Palette className="h-4 w-4" />
                      <span className="text-sm">Branding</span>
                    </Link>
                    <Link
                      href="/home/settings/billing"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <CreditCard className="h-4 w-4" />
                      <span className="text-sm">Billing</span>
                    </Link>
                    <Link
                      href="/home/settings/team"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <Users className="h-4 w-4" />
                      <span className="text-sm">Team</span>
                    </Link>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    Manage
                  </p>
                  <div className="space-y-1">
                    <Link
                      href="/home/features"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted"
                      onClick={() => setOpen(false)}
                    >
                      <ToggleLeft className="h-4 w-4" />
                      <span className="text-sm">Features</span>
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                        ON/OFF
                      </Badge>
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
