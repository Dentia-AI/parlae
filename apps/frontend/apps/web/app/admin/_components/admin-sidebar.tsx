'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  PhoneOutgoing,
  Settings,
  GitBranch,
  Receipt,
  Database,
  FlaskConical,
  Radio,
  Globe,
  Workflow,
  Bot,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';

const isDev = process.env.NODE_ENV !== 'production';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'General',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Accounts', href: '/admin/accounts', icon: Users },
      { name: 'Billing Management', href: '/admin/billing', icon: Receipt },
      { name: 'Voice Providers', href: '/admin/voice-providers', icon: Radio },
      { name: 'KB Scraper', href: '/admin/knowledge-scraper', icon: Globe },
      { name: 'PMS Integrations', href: '/admin/pms', icon: Database },
    ],
  },
  {
    label: 'Retell (Primary)',
    items: [
      { name: 'Flow Templates', href: '/admin/retell-templates/conversation-flow', icon: Workflow },
      { name: 'Flow Versions', href: '/admin/retell-templates/conversation-flow/versions', icon: GitBranch },
      { name: 'Flow Simulations', href: '/admin/retell-simulations', icon: FlaskConical },
      { name: 'Retell Agents', href: '/admin/retell-agents', icon: Bot },
    ],
  },
  {
    label: 'Outbound',
    items: [
      { name: 'Outbound Templates', href: '/admin/outbound-templates', icon: PhoneOutgoing },
      { name: 'Outbound Versions', href: '/admin/outbound-templates/versions', icon: GitBranch },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Platform Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

const allItems = navGroups.flatMap((g) => g.items);

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/30 h-screen sticky top-0 flex-shrink-0 overflow-y-auto">
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-6">Admin Console</h2>
        <nav className="space-y-5">
          {navGroups.map((group) => {
            if (group.items.length === 0) return null;

            return (
              <div key={group.label}>
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== '/admin' &&
                        pathname.startsWith(item.href) &&
                        !allItems.some(
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
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
