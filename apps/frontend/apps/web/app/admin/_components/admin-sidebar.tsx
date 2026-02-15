'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Phone, 
  Layers, 
  UserCheck,
  Settings,
  FileStack,
  GitBranch,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';

const navigation = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    name: 'Accounts',
    href: '/admin/accounts',
    icon: Users,
  },
  {
    name: 'Agent Templates',
    href: '/admin/agent-templates',
    icon: Layers,
  },
  {
    name: 'Version Overview',
    href: '/admin/agent-templates/versions',
    icon: GitBranch,
  },
  {
    name: 'Setup Test Agent',
    href: '/admin/setup-vapi',
    icon: Phone,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/30 min-h-screen sticky top-0 flex-shrink-0">
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-6">Admin Console</h2>
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
                            (item.href !== '/admin' && pathname.startsWith(item.href) &&
                             // Prevent parent path from matching when a more specific child matches
                             !navigation.some(
                               (other) =>
                                 other.href !== item.href &&
                                 other.href.startsWith(item.href) &&
                                 pathname.startsWith(other.href),
                             ));
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
