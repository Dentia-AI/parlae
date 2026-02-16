'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { cn } from '@kit/ui/utils';
import { User, Palette, CreditCard, Users } from 'lucide-react';

export default function SettingsLayout(props: React.PropsWithChildren) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const settingsTabs = [
    {
      label: t('common:settings.tabs.profile'),
      href: '/home/settings',
      icon: User,
      exact: true,
    },
    {
      label: t('common:settings.tabs.branding'),
      href: '/home/settings/branding',
      icon: Palette,
    },
    {
      label: t('common:settings.tabs.billing'),
      href: '/home/settings/billing',
      icon: CreditCard,
    },
    {
      label: t('common:settings.tabs.team'),
      href: '/home/settings/team',
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Settings Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 pt-6 pb-0">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight">
            {t('common:settings.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('common:settings.description')}
          </p>

          {/* Tab Navigation */}
          <nav className="flex gap-1 mt-4 -mb-px">
            {settingsTabs.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                    isActive
                      ? 'border-primary text-primary bg-muted/50'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl px-6 py-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {props.children}
        </div>
      </div>
    </div>
  );
}
